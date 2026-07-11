# -*- coding: utf-8 -*-
"""'할 일' 칸반 보드 API (FastAPI 라우터).

엔드포인트:
  POST   /api/todo/tickets           티켓 생성 (Backlog 맨 위)
  GET    /api/todo/tickets           보드 전체 티켓 목록 (Done은 24시간 이내만)
  GET    /api/todo/tickets/{id}      티켓 1건 상세
  PATCH  /api/todo/tickets/{id}      제목/설명/우선순위/계획일 수정
  DELETE /api/todo/tickets/{id}      티켓 삭제
  PATCH  /api/todo/tickets/{id}/move 드래그앤드롭: 상태·순서 변경 (시작일/종료일 자동 관리)

주의: 이 라우터는 auth/api.py의 PROTECTED_PREFIXES('/api/todo')로 보호된다.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Body, HTTPException

from security import require_max_len
from . import store

router = APIRouter(prefix="/api/todo")


def _validate_priority(priority: str | None) -> str:
    priority = (priority or "MEDIUM").upper()
    if priority not in store.PRIORITIES:
        raise HTTPException(400, "우선순위는 LOW, MEDIUM, HIGH 중 선택해주세요.")
    return priority


def _validate_date(value: str | None, field: str) -> str | None:
    value = (value or "").strip() or None
    if value is None:
        return None
    try:
        date.fromisoformat(value)
    except ValueError:
        raise HTTPException(400, f"{field}는 YYYY-MM-DD 형식이어야 합니다.")
    return value


@router.post("/tickets")
def create_ticket(payload: dict = Body(...)):
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "제목을 입력해주세요.")
    require_max_len(title, "title", 200)

    description = (payload.get("description") or "").strip() or None
    if description:
        require_max_len(description, "description", 1000)

    priority = _validate_priority(payload.get("priority"))
    planned_start_date = _validate_date(payload.get("planned_start_date"), "계획시작일")
    planned_end_date = _validate_date(payload.get("planned_end_date"), "계획종료일")

    ticket = store.create_ticket(title, description, priority, planned_start_date, planned_end_date)
    return ticket


@router.get("/tickets")
def list_tickets():
    return {"tickets": store.list_tickets()}


@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: int):
    ticket = store.get_ticket(ticket_id)
    if ticket is None:
        raise HTTPException(404, "티켓을 찾을 수 없습니다.")
    return ticket


@router.patch("/tickets/{ticket_id}")
def update_ticket(ticket_id: int, payload: dict = Body(...)):
    fields: dict = {}

    if "title" in payload:
        title = (payload.get("title") or "").strip()
        if not title:
            raise HTTPException(400, "제목을 입력해주세요.")
        require_max_len(title, "title", 200)
        fields["title"] = title

    if "description" in payload:
        description = (payload.get("description") or "").strip() or None
        if description:
            require_max_len(description, "description", 1000)
        fields["description"] = description

    if "priority" in payload:
        fields["priority"] = _validate_priority(payload.get("priority"))

    if "planned_start_date" in payload:
        fields["planned_start_date"] = _validate_date(payload.get("planned_start_date"), "계획시작일")

    if "planned_end_date" in payload:
        fields["planned_end_date"] = _validate_date(payload.get("planned_end_date"), "계획종료일")

    ticket = store.update_ticket(ticket_id, fields)
    if ticket is None:
        raise HTTPException(404, "티켓을 찾을 수 없습니다.")
    return ticket


@router.patch("/tickets/{ticket_id}/move")
def move_ticket(ticket_id: int, payload: dict = Body(...)):
    new_status = (payload.get("status") or "").upper()
    if new_status not in store.STATUSES:
        raise HTTPException(400, "상태는 BACKLOG, TODO, IN_PROGRESS, DONE 중 선택해주세요.")
    try:
        index = int(payload.get("index", 0))
    except (TypeError, ValueError):
        raise HTTPException(400, "index는 정수여야 합니다.")

    ticket = store.move_ticket(ticket_id, new_status, max(0, index))
    if ticket is None:
        raise HTTPException(404, "티켓을 찾을 수 없습니다.")
    return ticket


@router.delete("/tickets/{ticket_id}")
def delete_ticket(ticket_id: int):
    if not store.delete_ticket(ticket_id):
        raise HTTPException(404, "티켓을 찾을 수 없습니다.")
    return {"ok": True}
