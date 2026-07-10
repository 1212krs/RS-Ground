# -*- coding: utf-8 -*-
"""회의록 정리 에이전트 API (FastAPI 라우터).

엔드포인트:
  POST   /api/meeting/analyze   { title?, transcript } → Claude 분석 → DB 저장 → 분석 결과 반환
  GET    /api/meeting           저장된 회의 목록 (요약 정보)
  GET    /api/meeting/{id}      회의 1건 상세 (분석 JSON + 원문)
  DELETE /api/meeting/{id}      회의 삭제

주의: 이 라우터는 auth/api.py의 PROTECTED_PREFIXES('/api/meeting')로 보호된다.
      로그인(토큰) 없이는 401 → 아무나 Claude 비용을 못 쓴다.
"""

from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException

from security import require_max_len
from . import store
from .analyzer import TRANSCRIPT_CHAR_LIMIT, analyze

router = APIRouter(prefix="/api/meeting")


@router.post("/analyze")
def analyze_meeting(payload: dict = Body(...)):
    title = (payload.get("title") or "").strip()
    transcript = (payload.get("transcript") or "").strip()
    if not transcript:
        raise HTTPException(400, "회의 전문을 입력하세요.")
    require_max_len(title, "title", 200)
    if len(transcript) > TRANSCRIPT_CHAR_LIMIT:
        raise HTTPException(
            400,
            "회의 전문이 너무 깁니다(%d자). 최대 %d자까지 분석할 수 있습니다. "
            "긴 회의는 나눠서 분석해 주세요." % (len(transcript), TRANSCRIPT_CHAR_LIMIT),
        )

    try:
        analysis = analyze(transcript, title)
    except RuntimeError as ex:
        # 키 없음·API 오류 등 → 502로 사유 전달(프론트가 안내)
        raise HTTPException(502, "분석 실패: %s" % ex)

    saved = store.create_meeting(analysis.get("title") or title or "제목 없는 회의",
                                 transcript, analysis)
    return {"id": saved["id"], "created_at": saved["created_at"], "analysis": analysis}


@router.get("")
def list_meetings():
    return {"meetings": store.list_meetings()}


@router.get("/{meeting_id}")
def get_meeting(meeting_id: int):
    m = store.get_meeting(meeting_id)
    if m is None:
        raise HTTPException(404, "회의를 찾을 수 없습니다.")
    return m


@router.delete("/{meeting_id}")
def delete_meeting(meeting_id: int):
    if not store.delete_meeting(meeting_id):
        raise HTTPException(404, "회의를 찾을 수 없습니다.")
    return {"ok": True}
