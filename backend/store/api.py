# -*- coding: utf-8 -*-
"""워크스페이스(일정·할 일·메모) 영속 저장용 FastAPI 라우터.

프론트엔드가 브라우저 localStorage 대신 서버 DB에 저장하게 해서,
브라우저 데이터를 지우거나 다른 브라우저로 바꿔도 일정이 유지되게 한다.
(다른 PC에서 보려면 그 PC가 이 백엔드에 접속 가능해야 한다.)

저장 모델: 컬렉션(events/todos/memos)별로 JSON 배열을 통째로 보관하는 KV 저장소.
프론트엔드가 '배열 전체를 읽고 쓰는' 방식이라 이 구조가 가장 단순하고 안전하다.
단일 사용자 개인 도구 전제(mock 인증)라 사용자 구분은 두지 않는다.

엔드포인트:
  GET  /api/store/{key}   저장값 반환 (없으면 {"data": null})
  PUT  /api/store/{key}   값을 통째로 저장

키 종류:
  events/todos/memos  → 배열(list)
  projectName         → 문자열(str) : 사이드바 프로젝트 이름

DB: data/app.db (sqlite, git 제외).
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException

BACKEND_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BACKEND_DIR.parent / "data" / "app.db"

# 임의 키로 아무 데이터나 쌓이지 않도록 허용 키를 고정한다.
LIST_KEYS = {"events", "todos", "memos"}   # 배열로 저장
SCALAR_KEYS = {"projectName"}              # 문자열로 저장
ALLOWED_KEYS = LIST_KEYS | SCALAR_KEYS

router = APIRouter(prefix="/api/store")


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS kv ("
        "  key TEXT PRIMARY KEY,"
        "  data TEXT NOT NULL,"
        "  updated_at TEXT NOT NULL"
        ")"
    )
    return conn


def _check_key(key: str) -> None:
    if key not in ALLOWED_KEYS:
        raise HTTPException(status_code=404, detail="알 수 없는 저장소 키: %s" % key)


@router.get("/{key}")
def read(key: str):
    _check_key(key)
    conn = _connect()
    try:
        row = conn.execute("SELECT data FROM kv WHERE key = ?", (key,)).fetchone()
    finally:
        conn.close()
    if row is None:
        return {"data": None}
    return {"data": json.loads(row[0])}


@router.put("/{key}")
def write(key: str, payload: dict = Body(...)):
    _check_key(key)
    data = payload.get("data")
    if key in LIST_KEYS and not isinstance(data, list):
        raise HTTPException(status_code=400, detail="data 필드는 배열이어야 합니다.")
    if key in SCALAR_KEYS and not isinstance(data, str):
        raise HTTPException(status_code=400, detail="data 필드는 문자열이어야 합니다.")
    now = datetime.now(timezone.utc).isoformat()
    text = json.dumps(data, ensure_ascii=False)
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO kv (key, data, updated_at) VALUES (?, ?, ?)"
            " ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
            (key, text, now),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "count": len(data), "updated_at": now}
