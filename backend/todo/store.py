# -*- coding: utf-8 -*-
"""'할 일' 칸반 보드 저장(SQLite). 티켓 1건 = 카드 1장.

DB는 로그인(auth)·워크스페이스(store)·회의록(meeting)과 같은 app.db 파일을 쓰되
표(tickets)만 다르다. config.DATA_DIR 기준이라 배포 시 영구 디스크에 저장된다.

position은 컬럼(status) 내 정렬 순서다. 정수가 아니라 실수(REAL)로 두고
두 카드 사이에 끼워 넣을 때 (앞 + 뒤) / 2로 계산한다 — 매번 전체 재정렬을
하지 않아도 되는 흔한 기법이다. 간격이 1 미만으로 좁아지면 그 컬럼만
1024 간격으로 다시 매긴다(_normalize_column).
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from rag import config  # DATA_DIR: 배포 시 영구 디스크(/var/data)

DB_PATH = config.DATA_DIR / "app.db"

STATUSES = ("BACKLOG", "TODO", "IN_PROGRESS", "DONE")
PRIORITIES = ("LOW", "MEDIUM", "HIGH")
POSITION_GAP = 1024.0
DONE_VISIBLE_HOURS = 24

_COLUMNS = (
    "id, title, description, priority, status, position,"
    " planned_start_date, started_at, planned_end_date, completed_at,"
    " created_at, updated_at"
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tickets ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  title TEXT NOT NULL,"
        "  description TEXT,"
        "  priority TEXT NOT NULL DEFAULT 'MEDIUM',"
        "  status TEXT NOT NULL DEFAULT 'BACKLOG',"
        "  position REAL NOT NULL,"
        "  planned_start_date TEXT,"
        "  started_at TEXT,"
        "  planned_end_date TEXT,"
        "  completed_at TEXT,"
        "  created_at TEXT NOT NULL,"
        "  updated_at TEXT NOT NULL"
        ")"
    )
    return conn


def _row_to_dict(row: sqlite3.Row | tuple) -> dict:
    keys = [c.strip() for c in _COLUMNS.split(",")]
    d = dict(zip(keys, row))
    d["is_overdue"] = _is_overdue(d["planned_end_date"], d["status"])
    return d


def _is_overdue(planned_end_date: str | None, status: str) -> bool:
    if not planned_end_date or status == "DONE":
        return False
    today = datetime.now(timezone.utc).date().isoformat()
    return planned_end_date < today


def _column_positions(conn: sqlite3.Connection, status: str, exclude_id: int | None = None) -> list[tuple[int, float]]:
    rows = conn.execute(
        "SELECT id, position FROM tickets WHERE status = ? ORDER BY position ASC", (status,)
    ).fetchall()
    return [(r[0], r[1]) for r in rows if r[0] != exclude_id]


def _normalize_column(conn: sqlite3.Connection, status: str) -> None:
    """컬럼 내 position을 1024 간격으로 다시 매긴다(간격이 너무 좁아졌을 때)."""
    ids = [r[0] for r in conn.execute(
        "SELECT id FROM tickets WHERE status = ? ORDER BY position ASC", (status,)
    ).fetchall()]
    for i, ticket_id in enumerate(ids):
        conn.execute("UPDATE tickets SET position = ? WHERE id = ?", ((i + 1) * POSITION_GAP, ticket_id))


def _position_for_insert(conn: sqlite3.Connection, status: str, index: int, exclude_id: int | None = None) -> float:
    """대상 컬럼에서 index번째 자리에 넣을 position 값을 계산한다."""
    siblings = _column_positions(conn, status, exclude_id=exclude_id)
    index = max(0, min(index, len(siblings)))

    if not siblings:
        return POSITION_GAP

    if index == 0:
        prev, nxt = None, siblings[0][1]
        new_pos = nxt - POSITION_GAP
    elif index == len(siblings):
        prev, nxt = siblings[-1][1], None
        new_pos = prev + POSITION_GAP
    else:
        prev, nxt = siblings[index - 1][1], siblings[index][1]
        new_pos = (prev + nxt) / 2

    if prev is not None and nxt is not None and (nxt - prev) < 1:
        _normalize_column(conn, status)
        return _position_for_insert(conn, status, index, exclude_id=exclude_id)
    return new_pos


def create_ticket(title: str, description: str | None, priority: str,
                   planned_start_date: str | None, planned_end_date: str | None) -> dict:
    now = _now()
    conn = _connect()
    try:
        position = _position_for_insert(conn, "BACKLOG", 0)
        cur = conn.execute(
            "INSERT INTO tickets (title, description, priority, status, position,"
            " planned_start_date, started_at, planned_end_date, completed_at, created_at, updated_at)"
            " VALUES (?, ?, ?, 'BACKLOG', ?, ?, NULL, ?, NULL, ?, ?)",
            (title, description, priority, position, planned_start_date, planned_end_date, now, now),
        )
        conn.commit()
        return get_ticket(cur.lastrowid)
    finally:
        conn.close()


def list_tickets() -> list[dict]:
    """보드에 표시할 전체 티켓. Done은 completed_at 기준 24시간 이내만 포함."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=DONE_VISIBLE_HOURS)).isoformat()
    conn = _connect()
    try:
        rows = conn.execute(
            f"SELECT {_COLUMNS} FROM tickets"
            " WHERE status != 'DONE' OR completed_at >= ?"
            " ORDER BY status ASC, position ASC",
            (cutoff,),
        ).fetchall()
    finally:
        conn.close()
    return [_row_to_dict(r) for r in rows]


def get_ticket(ticket_id: int) -> dict | None:
    conn = _connect()
    try:
        row = conn.execute(f"SELECT {_COLUMNS} FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
    finally:
        conn.close()
    return _row_to_dict(row) if row else None


def update_ticket(ticket_id: int, fields: dict) -> dict | None:
    """title/description/priority/planned_start_date/planned_end_date 부분 수정."""
    allowed = {"title", "description", "priority", "planned_start_date", "planned_end_date"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_ticket(ticket_id)
    conn = _connect()
    try:
        if conn.execute("SELECT 1 FROM tickets WHERE id = ?", (ticket_id,)).fetchone() is None:
            return None
        updates["updated_at"] = _now()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE tickets SET {set_clause} WHERE id = ?", (*updates.values(), ticket_id))
        conn.commit()
    finally:
        conn.close()
    return get_ticket(ticket_id)


def move_ticket(ticket_id: int, new_status: str, index: int) -> dict | None:
    """드래그앤드롭: 컬럼(status) 이동 + 컬럼 내 순서(position) 지정.

    TODO 진입 시 started_at 자동 기록, TODO에서 벗어나 BACKLOG로 가면 초기화.
    DONE 진입 시 completed_at 자동 기록, DONE에서 벗어나면 초기화.
    """
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT status, started_at, completed_at FROM tickets WHERE id = ?", (ticket_id,)
        ).fetchone()
        if row is None:
            return None
        old_status, started_at, completed_at = row
        now = _now()

        if new_status == "TODO" and old_status != "TODO":
            started_at = now
        elif old_status == "TODO" and new_status == "BACKLOG":
            started_at = None

        if new_status == "DONE" and old_status != "DONE":
            completed_at = now
        elif old_status == "DONE" and new_status != "DONE":
            completed_at = None

        position = _position_for_insert(conn, new_status, index, exclude_id=ticket_id)
        conn.execute(
            "UPDATE tickets SET status = ?, position = ?, started_at = ?, completed_at = ?, updated_at = ?"
            " WHERE id = ?",
            (new_status, position, started_at, completed_at, now, ticket_id),
        )
        conn.commit()
    finally:
        conn.close()
    return get_ticket(ticket_id)


def delete_ticket(ticket_id: int) -> bool:
    conn = _connect()
    try:
        cur = conn.execute("DELETE FROM tickets WHERE id = ?", (ticket_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
