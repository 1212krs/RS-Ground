# -*- coding: utf-8 -*-
"""공부 노트 도구 API (FastAPI 라우터) — AI 미사용.

개인 지식 저장 도구. 마크다운 노트 작성/수정/삭제 + 파일 첨부(원본 보관) + 키워드 검색.

엔드포인트:
  GET    /api/study?q=          q 없으면 목록, 있으면 키워드 검색
  GET    /api/study/{id}        노트 1건 상세(본문 + 첨부 목록)
  POST   /api/study            노트 생성 { title, subject, tags, content }
  PUT    /api/study/{id}        노트 수정
  DELETE /api/study/{id}        노트 삭제(첨부 파일 포함)
  POST   /api/study/{id}/files  파일 첨부(multipart) — 원본 저장 + 텍스트 추출(검색용)
  GET    /api/study/files/{fid} 첨부 원본 다운로드
  DELETE /api/study/files/{fid} 첨부 삭제

주의: auth/api.py의 PROTECTED_PREFIXES('/api/study')로 보호된다(로그인 필요).
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Body, File, HTTPException, Response, UploadFile

from security import MAX_STUDY_UPLOAD_BYTES, read_upload_limited, require_max_len
from . import store
from .extractors import SUPPORTED_SUFFIXES, extract_upload_text

router = APIRouter(prefix="/api/study")

CONTENT_LIMIT = 100_000


def _parse_tags(raw) -> list[str]:
    """tags 입력을 문자열 리스트로 정규화(각 태그 40자 제한)."""
    if isinstance(raw, str):
        items = [t.strip() for t in raw.split(",")]
    elif isinstance(raw, list):
        items = [str(t).strip() for t in raw]
    else:
        items = []
    tags = []
    for t in items:
        if t:
            require_max_len(t, "tag", 40)
            if t not in tags:
                tags.append(t)
    return tags


def _note_payload(payload: dict) -> tuple[str, str, list[str], str]:
    title = (payload.get("title") or "").strip()
    subject = (payload.get("subject") or "").strip()
    content = payload.get("content") or ""
    if not title:
        raise HTTPException(400, "제목을 입력하세요.")
    if not subject:
        raise HTTPException(400, "분류를 선택하세요.")
    require_max_len(title, "title", 200)
    require_max_len(subject, "subject", 80)
    require_max_len(content, "content", CONTENT_LIMIT)
    tags = _parse_tags(payload.get("tags"))
    return title, subject, tags, content


@router.get("")
def list_or_search(q: str = ""):
    q = q.strip()
    if q:
        require_max_len(q, "q", 200)
        return {"notes": store.search_notes(q), "query": q}
    return {"notes": store.list_notes()}


# --- 분류(카테고리) --- (라우트 순서 주의: /{note_id} 보다 먼저 선언해야 'subjects'가 정수로 파싱되지 않는다)
@router.get("/subjects")
def list_subjects():
    return {"subjects": store.list_subjects()}


@router.post("/subjects")
def create_subject(payload: dict = Body(...)):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "분류 이름을 입력하세요.")
    require_max_len(name, "name", 80)
    return store.create_subject(name)


@router.delete("/subjects/{subject_id}")
def delete_subject(subject_id: int):
    result = store.delete_subject(subject_id)
    if result == "not_found":
        raise HTTPException(404, "분류를 찾을 수 없습니다.")
    if result == "non_empty":
        raise HTTPException(409, "노트가 남아 있어 분류를 삭제할 수 없습니다. 먼저 노트를 비워 주세요.")
    return {"ok": True}


@router.get("/{note_id}")
def get_note(note_id: int):
    n = store.get_note(note_id)
    if n is None:
        raise HTTPException(404, "노트를 찾을 수 없습니다.")
    return n


@router.post("")
def create_note(payload: dict = Body(...)):
    title, subject, tags, content = _note_payload(payload)
    saved = store.create_note(title, subject, tags, content)
    return {"id": saved["id"], "created_at": saved["created_at"], "updated_at": saved["updated_at"]}


@router.put("/{note_id}")
def update_note(note_id: int, payload: dict = Body(...)):
    title, subject, tags, content = _note_payload(payload)
    if not store.update_note(note_id, title, subject, tags, content):
        raise HTTPException(404, "노트를 찾을 수 없습니다.")
    return {"ok": True}


@router.delete("/{note_id}")
def delete_note(note_id: int):
    if not store.delete_note(note_id):
        raise HTTPException(404, "노트를 찾을 수 없습니다.")
    return {"ok": True}


@router.post("/{note_id}/files")
async def upload_file(note_id: int, file: UploadFile = File(...)):
    if not store.note_exists(note_id):
        raise HTTPException(404, "노트를 찾을 수 없습니다.")
    suffix = os.path.splitext(file.filename or "")[1].lower()
    if suffix not in SUPPORTED_SUFFIXES:
        allowed = ", ".join(sorted(SUPPORTED_SUFFIXES))
        raise HTTPException(400, f"지원하지 않는 파일 형식입니다({suffix}). 지원 형식: {allowed}")

    data = await read_upload_limited(file, MAX_STUDY_UPLOAD_BYTES)
    # 텍스트 추출은 검색용이라, 실패해도 파일 저장은 진행(검색만 불가).
    try:
        text = extract_upload_text(file.filename, data)
    except ValueError:
        text = ""

    saved = store.add_file(note_id, file.filename, data, text)
    return saved


@router.get("/files/{file_id}")
def download_file(file_id: int):
    got = store.get_file(file_id)
    if got is None:
        raise HTTPException(404, "첨부 파일을 찾을 수 없습니다.")
    filename, data = got
    # 파일명 인코딩(RFC 5987) — 한글 파일명 대응.
    from urllib.parse import quote

    disposition = "attachment; filename*=UTF-8''%s" % quote(filename)
    return Response(content=data, media_type="application/octet-stream",
                    headers={"Content-Disposition": disposition})


@router.delete("/files/{file_id}")
def delete_file(file_id: int):
    if not store.delete_file(file_id):
        raise HTTPException(404, "첨부 파일을 찾을 수 없습니다.")
    return {"ok": True}
