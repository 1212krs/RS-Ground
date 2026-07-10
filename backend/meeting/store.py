# -*- coding: utf-8 -*-
"""회의록 저장(SQLite). 분석 결과 JSON을 통째로 보관해 다시 볼 때 Claude 재호출이 없다(비용 0).

DB는 로그인(auth)·워크스페이스(store)와 같은 app.db 파일을 쓰되 표(meetings)만 다르다.
config.DATA_DIR 기준이라 배포 시 영구 디스크(/var/data)에 저장되어 재배포에도 유지된다.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

from rag import config  # DATA_DIR: 배포 시 영구 디스크(/var/data)

DB_PATH = config.DATA_DIR / "app.db"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS meetings ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  title TEXT NOT NULL,"
        "  transcript TEXT NOT NULL,"
        "  analysis TEXT NOT NULL,"   # 분석 결과 JSON 통째로
        "  created_at TEXT NOT NULL"
        ")"
    )
    return conn


def create_meeting(title: str, transcript: str, analysis: dict) -> dict:
    """회의록 1건 저장 후 {id, title, created_at} 반환."""
    now = _now()
    conn = _connect()
    try:
        cur = conn.execute(
            "INSERT INTO meetings (title, transcript, analysis, created_at) VALUES (?, ?, ?, ?)",
            (title, transcript, json.dumps(analysis, ensure_ascii=False), now),
        )
        conn.commit()
        return {"id": cur.lastrowid, "title": title, "created_at": now}
    finally:
        conn.close()


def list_meetings() -> list[dict]:
    """목록용 요약 정보(전문·분석 전체는 제외). 최신순."""
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT id, title, analysis, created_at FROM meetings ORDER BY id DESC"
        ).fetchall()
    finally:
        conn.close()
    out = []
    for r in rows:
        try:
            summary = json.loads(r[2]).get("summary", "")
        except (ValueError, TypeError):
            summary = ""
        # 목록에는 요약 첫 줄만 살짝 보여준다.
        preview = summary.splitlines()[0][:80] if summary else ""
        out.append({"id": r[0], "title": r[1], "preview": preview, "created_at": r[3]})
    return out


def get_meeting(meeting_id: int) -> dict | None:
    """회의록 1건 상세(분석 JSON + 원문)."""
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id, title, transcript, analysis, created_at FROM meetings WHERE id = ?",
            (meeting_id,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return {
        "id": row[0],
        "title": row[1],
        "transcript": row[2],
        "analysis": json.loads(row[3]),
        "created_at": row[4],
    }


def delete_meeting(meeting_id: int) -> bool:
    """회의록 삭제. 없으면 False."""
    conn = _connect()
    try:
        cur = conn.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
