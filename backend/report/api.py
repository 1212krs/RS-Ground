# -*- coding: utf-8 -*-
"""보고서 탭용 FastAPI 라우터.

단독 실행이 아니라 backend/main.py 가 rag 앱에 이 라우터를 합쳐서 띄운다:
  cd backend && ./venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000

엔드포인트:
  GET    /api/report/templates        서식 목록(목차·지침 유무 포함)
  GET    /api/report/status           AI(Claude API 키) 연결 상태
  POST   /api/report/compose          제목·내용·참고파일 → AI가 본문 초안 생성 (multipart)
  POST   /api/report/generate         편집 완료된 내용 → hwpx 파일 다운로드 (JSON)
  POST   /api/report/templates/check  샘플 hwpx 검사만 (저장 안 함, multipart)
  POST   /api/report/templates        샘플 hwpx → 서식 자동 변환·등록 (multipart)
  DELETE /api/report/templates/{id}   등록된 서식 삭제
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv
from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from .composer import ai_status, compose
from .engine import build_hwpx, form_to_doc, get_template, list_templates
from .extractors import extract_file_text
from . import template_builder as tb
from security import MAX_REPORT_UPLOAD_BYTES, read_upload_limited, require_json_size, require_max_len

# 실행 위치(cwd)에 상관없이 backend/.env 를 확실히 읽도록 경로를 고정한다.
# (이 파일은 backend/report/api.py 이므로 parents[1] == backend/)
load_dotenv(Path(__file__).resolve().parents[1] / ".env")  # ANTHROPIC_API_KEY 로드

router = APIRouter(prefix="/api/report")

MAX_FILES = 3
MAX_FILE_BYTES = MAX_REPORT_UPLOAD_BYTES


@router.get("/templates")
def templates():
    return [{"id": t["id"], "name": t["name"], "sections": t["sections"],
             "features": t["features"], "has_guide": bool(t["guide"]),
             "builtin": t.get("builtin", True)}
            for t in list_templates()]


@router.get("/status")
def status():
    return ai_status()


@router.post("/compose")
async def compose_report(
    title: str = Form(...),
    brief: str = Form(""),
    template: str = Form(""),
    include_table: bool = Form(True),
    files: list[UploadFile] = File(default=[]),
):
    title = title.strip()
    brief = brief.strip()
    template = template.strip()
    if not title:
        raise HTTPException(400, "제목을 입력하세요.")
    require_max_len(title, "title", 150)
    require_max_len(brief, "brief", 12000)  # 개인보고서 등 '통째로 던지는' 긴 메모 허용
    require_max_len(template, "template", 80)
    tpl = get_template(template)

    extracted = []
    for f in files[:MAX_FILES]:
        require_max_len(f.filename or "file", "filename", 120)
        data = await read_upload_limited(f, MAX_FILE_BYTES)
        extracted.append((f.filename, extract_file_text(f.filename, data)))

    req = {"title": title, "brief": brief,
           "include_table": include_table, "files": extracted}
    engine, doc, reason = compose(req, tpl)
    return {"engine": engine, "doc": doc, "reason": reason,
            "template": tpl["id"],
            "files_used": [{"name": n, "chars": len(t)} for n, t in extracted]}


@router.post("/generate")
def generate_report(payload: dict = Body(...)):
    require_json_size(payload, "payload")
    tpl = get_template(payload.get("template", ""))
    try:
        doc = form_to_doc(payload, tpl)
        blob = build_hwpx(doc, tpl)
    except Exception as ex:
        raise HTTPException(500, "hwpx 생성 실패: %s" % ex)

    filename = quote(doc["title"] + ".hwpx")
    return Response(
        content=blob,
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename*=UTF-8''%s" % filename},
    )


# ────────────────────────────────────────────────────────────────
#  서식 자동 등록 — 담당자가 [[표시어]]만 적은 hwpx를 올리면 서식으로 변환
# ────────────────────────────────────────────────────────────────
def _convert_or_400(file: UploadFile, data: bytes) -> dict:
    """변환 결과를 돌려주되, 실패하면 사유 목록을 그대로 400으로 내보낸다."""
    try:
        return tb.convert(file.filename or "sample.hwpx", data)
    except tb.ConvertError as ex:
        raise HTTPException(400, {"message": "서식으로 만들 수 없습니다.",
                                  "errors": ex.errors, "warnings": ex.warnings})


@router.post("/templates/check")
async def check_template(file: UploadFile = File(...)):
    """저장하지 않고 검사만 한다 — 담당자가 고칠 곳을 먼저 확인하는 용도."""
    require_max_len(file.filename or "file", "filename", 120)
    data = await read_upload_limited(file, MAX_FILE_BYTES)
    out = _convert_or_400(file, data)
    return {"ok": True, "sections": out["sections"], "features": out["features"],
            "steps": out["steps"], "warnings": out["warnings"]}


@router.post("/templates")
async def create_template(
    name: str = Form(...),
    guide: str = Form(""),
    overwrite: bool = Form(False),
    file: UploadFile = File(...),
):
    require_max_len(name, "name", tb.MAX_NAME_LEN)
    require_max_len(guide, "guide", 20000)
    require_max_len(file.filename or "file", "filename", 120)
    data = await read_upload_limited(file, MAX_FILE_BYTES)
    try:
        tb.safe_name(name)
    except tb.ConvertError as ex:
        raise HTTPException(400, {"message": "등록할 수 없습니다.", "errors": ex.errors, "warnings": []})

    out = _convert_or_400(file, data)
    try:
        saved = tb.save(name, out["data"], guide, overwrite)
    except tb.ConvertError as ex:
        raise HTTPException(409, {"message": "등록할 수 없습니다.",
                                  "errors": ex.errors, "warnings": out["warnings"]})
    return {"ok": True, **saved, "sections": out["sections"], "features": out["features"],
            "steps": out["steps"], "warnings": out["warnings"]}


@router.delete("/templates/{tpl_id}")
def remove_template(tpl_id: str):
    require_max_len(tpl_id, "tpl_id", tb.MAX_NAME_LEN)
    try:
        removed = tb.delete(tpl_id)
    except tb.ConvertError as ex:
        raise HTTPException(404, {"message": "삭제할 수 없습니다.", "errors": ex.errors, "warnings": []})
    return {"ok": True, "removed": removed}
