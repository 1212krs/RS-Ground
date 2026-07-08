# -*- coding: utf-8 -*-
"""보고서 탭용 FastAPI 라우터.

단독 실행이 아니라 backend/main.py 가 rag 앱에 이 라우터를 합쳐서 띄운다:
  cd backend && ./venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000

엔드포인트:
  GET  /api/report/templates  서식 목록(목차·지침 유무 포함)
  GET  /api/report/status     AI(Claude API 키) 연결 상태
  POST /api/report/compose    제목·내용·참고파일 → AI가 본문 초안 생성 (multipart)
  POST /api/report/generate   편집 완료된 내용 → hwpx 파일 다운로드 (JSON)
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

# 실행 위치(cwd)에 상관없이 backend/.env 를 확실히 읽도록 경로를 고정한다.
# (이 파일은 backend/report/api.py 이므로 parents[1] == backend/)
load_dotenv(Path(__file__).resolve().parents[1] / ".env")  # ANTHROPIC_API_KEY 로드

router = APIRouter(prefix="/api/report")

MAX_FILES = 3
MAX_FILE_BYTES = 5 * 1024 * 1024


@router.get("/templates")
def templates():
    return [{"id": t["id"], "name": t["name"], "sections": t["sections"],
             "has_guide": bool(t["guide"])} for t in list_templates()]


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
    if not title.strip():
        raise HTTPException(400, "제목을 입력하세요.")
    tpl = get_template(template)

    extracted = []
    for f in files[:MAX_FILES]:
        data = await f.read()
        if len(data) > MAX_FILE_BYTES:
            extracted.append((f.filename, "[파일이 5MB를 초과하여 제외됨]"))
            continue
        extracted.append((f.filename, extract_file_text(f.filename, data)))

    req = {"title": title.strip(), "brief": brief.strip(),
           "include_table": include_table, "files": extracted}
    engine, doc, reason = compose(req, tpl)
    return {"engine": engine, "doc": doc, "reason": reason,
            "template": tpl["id"],
            "files_used": [{"name": n, "chars": len(t)} for n, t in extracted]}


@router.post("/generate")
def generate_report(payload: dict = Body(...)):
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
