# -*- coding: utf-8 -*-
"""공부 노트 저장(SQLite) + 첨부 파일 보관.

개인 지식 저장 도구 — AI를 쓰지 않는다. 노트(마크다운 본문)와 첨부 파일을 저장하고,
제목·본문·태그·첨부파일 텍스트를 대상으로 키워드 검색(SQL LIKE)한다.

DB는 로그인(auth)·워크스페이스(store)·회의록(meeting)과 같은 app.db 파일을 쓰되 표만 다르다.
첨부 파일 원본은 config.DATA_DIR/study_files/ 에 저장한다(배포 시 영구 디스크).
config.DATA_DIR 기준이라 재배포에도 유지된다.
"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone

from rag import config  # DATA_DIR: 배포 시 영구 디스크(/var/data)

DB_PATH = config.DATA_DIR / "app.db"
FILES_DIR = config.DATA_DIR / "study_files"   # 첨부 파일 원본 보관 폴더


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS study_notes ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  title TEXT NOT NULL,"
        "  subject TEXT NOT NULL DEFAULT '',"
        "  tags TEXT NOT NULL DEFAULT '[]',"   # JSON 배열 문자열
        "  content TEXT NOT NULL DEFAULT '',"  # 마크다운 본문
        "  created_at TEXT NOT NULL,"
        "  updated_at TEXT NOT NULL"
        ")"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS study_files ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  note_id INTEGER NOT NULL,"
        "  filename TEXT NOT NULL,"          # 원본 파일명(표시·다운로드용)
        "  stored_name TEXT NOT NULL,"       # 디스크 저장명(서버 생성, 경로 탈출 차단)
        "  size INTEGER NOT NULL,"
        "  extracted_text TEXT NOT NULL DEFAULT '',"   # 검색용(화면 표시 안 함)
        "  created_at TEXT NOT NULL"
        ")"
    )
    return conn


def _load_tags(raw: str) -> list[str]:
    try:
        val = json.loads(raw)
        return val if isinstance(val, list) else []
    except (ValueError, TypeError):
        return []


# --- 노트 CRUD -------------------------------------------------------------

def create_note(title: str, subject: str, tags: list[str], content: str) -> dict:
    now = _now()
    conn = _connect()
    try:
        cur = conn.execute(
            "INSERT INTO study_notes (title, subject, tags, content, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (title, subject, json.dumps(tags, ensure_ascii=False), content, now, now),
        )
        conn.commit()
        return {"id": cur.lastrowid, "created_at": now, "updated_at": now}
    finally:
        conn.close()


def update_note(note_id: int, title: str, subject: str, tags: list[str], content: str) -> bool:
    now = _now()
    conn = _connect()
    try:
        cur = conn.execute(
            "UPDATE study_notes SET title=?, subject=?, tags=?, content=?, updated_at=? WHERE id=?",
            (title, subject, json.dumps(tags, ensure_ascii=False), content, now, note_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def _preview(content: str) -> str:
    line = ""
    for raw in content.splitlines():
        stripped = raw.strip().lstrip("#>-*・ ").strip()
        if stripped:
            line = stripped
            break
    return line[:100]


def list_notes() -> list[dict]:
    """목록용 요약(본문 전체 제외). 최신 수정순."""
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT id, title, subject, tags, content, updated_at FROM study_notes "
            "ORDER BY updated_at DESC, id DESC"
        ).fetchall()
    finally:
        conn.close()
    return [
        {"id": r[0], "title": r[1], "subject": r[2], "tags": _load_tags(r[3]),
         "preview": _preview(r[4]), "updated_at": r[5]}
        for r in rows
    ]


def _snippet(text: str, q: str) -> str:
    """검색어 주변 ±60자 스니펫. 없으면 앞부분."""
    low = text.lower()
    idx = low.find(q.lower())
    if idx < 0:
        return text.strip()[:120]
    start = max(0, idx - 60)
    end = min(len(text), idx + len(q) + 60)
    piece = text[start:end].replace("\n", " ").strip()
    return ("…" if start > 0 else "") + piece + ("…" if end < len(text) else "")


def search_notes(q: str) -> list[dict]:
    """제목·본문·태그·첨부파일 텍스트를 LIKE로 검색. 최신 수정순."""
    like = f"%{q}%"
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT DISTINCT n.id, n.title, n.subject, n.tags, n.content, n.updated_at "
            "FROM study_notes n LEFT JOIN study_files f ON f.note_id = n.id "
            "WHERE n.title LIKE ? OR n.content LIKE ? OR n.tags LIKE ? OR f.extracted_text LIKE ? "
            "ORDER BY n.updated_at DESC, n.id DESC",
            (like, like, like, like),
        ).fetchall()
    finally:
        conn.close()
    out = []
    for r in rows:
        # 본문에 매치가 있으면 본문 스니펫, 아니면 제목/태그 매치이므로 preview.
        content = r[4]
        snippet = _snippet(content, q) if q.lower() in content.lower() else _preview(content)
        out.append({"id": r[0], "title": r[1], "subject": r[2], "tags": _load_tags(r[3]),
                    "preview": snippet, "updated_at": r[5]})
    return out


def get_note(note_id: int) -> dict | None:
    """노트 1건 상세(본문 + 첨부 파일 목록)."""
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id, title, subject, tags, content, created_at, updated_at "
            "FROM study_notes WHERE id = ?",
            (note_id,),
        ).fetchone()
        if row is None:
            return None
        files = conn.execute(
            "SELECT id, filename, size, created_at FROM study_files WHERE note_id = ? ORDER BY id",
            (note_id,),
        ).fetchall()
    finally:
        conn.close()
    return {
        "id": row[0], "title": row[1], "subject": row[2], "tags": _load_tags(row[3]),
        "content": row[4], "created_at": row[5], "updated_at": row[6],
        "files": [{"id": f[0], "filename": f[1], "size": f[2], "created_at": f[3]} for f in files],
    }


def delete_note(note_id: int) -> bool:
    """노트 삭제 + 첨부 파일(디스크 원본 포함) 정리."""
    conn = _connect()
    try:
        stored = conn.execute(
            "SELECT stored_name FROM study_files WHERE note_id = ?", (note_id,)
        ).fetchall()
        cur = conn.execute("DELETE FROM study_notes WHERE id = ?", (note_id,))
        conn.execute("DELETE FROM study_files WHERE note_id = ?", (note_id,))
        conn.commit()
    finally:
        conn.close()
    if cur.rowcount == 0:
        return False
    for (name,) in stored:
        _remove_disk_file(name)
    return True


# --- 첨부 파일 -------------------------------------------------------------

def _remove_disk_file(stored_name: str) -> None:
    try:
        (FILES_DIR / stored_name).unlink(missing_ok=True)
    except OSError:
        pass


def note_exists(note_id: int) -> bool:
    conn = _connect()
    try:
        return conn.execute(
            "SELECT 1 FROM study_notes WHERE id = ?", (note_id,)
        ).fetchone() is not None
    finally:
        conn.close()


def add_file(note_id: int, filename: str, data: bytes, extracted_text: str = "") -> dict:
    """첨부 파일 저장. 저장명은 서버가 생성(경로 탈출 차단)."""
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(filename)[1].lower()
    stored_name = f"{note_id}_{uuid.uuid4().hex}{ext}"
    (FILES_DIR / stored_name).write_bytes(data)
    now = _now()
    conn = _connect()
    try:
        cur = conn.execute(
            "INSERT INTO study_files (note_id, filename, stored_name, size, extracted_text, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (note_id, filename, stored_name, len(data), extracted_text, now),
        )
        conn.commit()
        return {"id": cur.lastrowid, "filename": filename, "size": len(data), "created_at": now}
    finally:
        conn.close()


def get_file(file_id: int) -> tuple[str, bytes] | None:
    """(원본 파일명, 바이트) 반환. 다운로드용."""
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT filename, stored_name FROM study_files WHERE id = ?", (file_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    path = FILES_DIR / row[1]
    if not path.exists():
        return None
    return row[0], path.read_bytes()


def delete_file(file_id: int) -> bool:
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT stored_name FROM study_files WHERE id = ?", (file_id,)
        ).fetchone()
        if row is None:
            return False
        conn.execute("DELETE FROM study_files WHERE id = ?", (file_id,))
        conn.commit()
    finally:
        conn.close()
    _remove_disk_file(row[0])
    return True
