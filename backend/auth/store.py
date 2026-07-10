# -*- coding: utf-8 -*-
"""로그인 시스템의 데이터 계층 — 회원 DB, 비밀번호 암호화, 출입증(세션 토큰).

이 파일은 "화면 없이" 순수하게 데이터만 다룬다(웹 라우터는 auth/api.py).

- 비밀번호는 절대 원문으로 저장하지 않는다. pbkdf2(표준 라이브러리)로 해시해 저장하며,
  각 비밀번호마다 무작위 salt를 붙여 같은 비번이라도 해시가 달라지게 한다.
- 로그인에 성공하면 무작위 토큰(출입증)을 만들어 sessions 표에 저장하고 화면에 돌려준다.
  이후 화면은 요청마다 이 토큰을 들고 오고, 백엔드는 토큰으로 사용자를 확인한다.
- DB는 rag.config.DATA_DIR 아래 app.db(SQLite). 배포 시 영구 디스크에 저장되어 유지된다.
  (store 워크스페이스 데이터와 같은 파일, 다른 표를 쓴다.)
"""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
from datetime import datetime, timezone

from rag import config  # DATA_DIR(생성물 저장 경로). chromadb에 의존하지 않아 안전.

DB_PATH = config.DATA_DIR / "app.db"

_PBKDF2_ROUNDS = 200_000  # 계산을 일부러 무겁게 해 무차별 대입을 어렵게 한다.


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  login_id TEXT UNIQUE NOT NULL,"
        "  display_name TEXT NOT NULL,"
        "  pw_hash TEXT NOT NULL,"
        "  created_at TEXT NOT NULL"
        ")"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions ("
        "  token TEXT PRIMARY KEY,"
        "  user_id INTEGER NOT NULL,"
        "  created_at TEXT NOT NULL"
        ")"
    )
    return conn


# --- 비밀번호 해시 ---------------------------------------------------------

def hash_password(password: str, salt: bytes | None = None) -> str:
    """비밀번호를 'salt:해시' 형태의 문자열로 만든다(저장용)."""
    if salt is None:
        salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ROUNDS)
    return salt.hex() + ":" + dk.hex()


def verify_password(password: str, stored: str) -> bool:
    """입력 비번이 저장된 해시와 일치하는지 확인한다."""
    try:
        salt_hex, dk_hex = stored.split(":", 1)
        salt = bytes.fromhex(salt_hex)
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ROUNDS)
    # 타이밍 공격 방지를 위해 상수 시간 비교를 쓴다.
    return secrets.compare_digest(dk.hex(), dk_hex)


# --- 회원 관리 -------------------------------------------------------------

def create_user(login_id: str, password: str, display_name: str | None = None) -> dict:
    """새 회원을 추가한다. login_id가 이미 있으면 ValueError."""
    login_id = login_id.strip()
    if not login_id or not password:
        raise ValueError("아이디와 비밀번호는 비어 있을 수 없습니다.")
    display_name = (display_name or login_id).strip()
    conn = _connect()
    try:
        try:
            cur = conn.execute(
                "INSERT INTO users (login_id, display_name, pw_hash, created_at) VALUES (?, ?, ?, ?)",
                (login_id, display_name, hash_password(password), _now()),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            raise ValueError("이미 존재하는 아이디입니다: %s" % login_id)
        return {"id": cur.lastrowid, "loginId": login_id, "displayName": display_name}
    finally:
        conn.close()


def set_password(login_id: str, new_password: str) -> bool:
    """비밀번호를 바꾼다. 해당 아이디가 없으면 False."""
    if not new_password:
        raise ValueError("비밀번호는 비어 있을 수 없습니다.")
    conn = _connect()
    try:
        cur = conn.execute(
            "UPDATE users SET pw_hash = ? WHERE login_id = ?",
            (hash_password(new_password), login_id.strip()),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_user(login_id: str) -> bool:
    """회원과 그 세션을 삭제한다. 없으면 False."""
    conn = _connect()
    try:
        row = conn.execute("SELECT id FROM users WHERE login_id = ?", (login_id.strip(),)).fetchone()
        if row is None:
            return False
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (row[0],))
        conn.execute("DELETE FROM users WHERE id = ?", (row[0],))
        conn.commit()
        return True
    finally:
        conn.close()


def list_users() -> list[dict]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT id, login_id, display_name, created_at FROM users ORDER BY id"
        ).fetchall()
    finally:
        conn.close()
    return [{"id": r[0], "loginId": r[1], "displayName": r[2], "createdAt": r[3]} for r in rows]


def count_users() -> int:
    conn = _connect()
    try:
        return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    finally:
        conn.close()


# --- 로그인 / 출입증(세션) --------------------------------------------------

def authenticate(login_id: str, password: str) -> dict | None:
    """아이디+비번이 맞으면 사용자 정보를, 틀리면 None을 돌려준다."""
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id, login_id, display_name, pw_hash FROM users WHERE login_id = ?",
            (login_id.strip(),),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    if not verify_password(password, row[3]):
        return None
    return {"id": row[0], "loginId": row[1], "displayName": row[2]}


def create_session(user_id: int) -> str:
    """새 출입증(토큰)을 만들어 저장하고 돌려준다."""
    token = secrets.token_urlsafe(32)
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user_id, _now()),
        )
        conn.commit()
    finally:
        conn.close()
    return token


def user_for_token(token: str | None) -> dict | None:
    """출입증(토큰)에 해당하는 사용자를 돌려준다. 없거나 유효하지 않으면 None."""
    if not token:
        return None
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT u.id, u.login_id, u.display_name"
            " FROM sessions s JOIN users u ON u.id = s.user_id"
            " WHERE s.token = ?",
            (token,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return {"id": row[0], "loginId": row[1], "displayName": row[2]}


def destroy_session(token: str | None) -> None:
    """출입증을 폐기한다(로그아웃)."""
    if not token:
        return
    conn = _connect()
    try:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
    finally:
        conn.close()
