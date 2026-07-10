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
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

from rag import config  # DATA_DIR(생성물 저장 경로). chromadb에 의존하지 않아 안전.

DB_PATH = config.DATA_DIR / "app.db"

_PBKDF2_ROUNDS = 200_000  # 계산을 일부러 무겁게 해 무차별 대입을 어렵게 한다.
_SESSION_TTL_DAYS = int(os.environ.get("RSG_SESSION_TTL_DAYS", "7"))
_MAX_LOGIN_ID_LEN = 100
_MAX_PASSWORD_LEN = 256
_MAX_DISPLAY_NAME_LEN = 100


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
        "  created_at TEXT NOT NULL,"
        "  token_hash TEXT,"
        "  expires_at TEXT"
        ")"
    )
    cols = {row[1] for row in conn.execute("PRAGMA table_info(sessions)").fetchall()}
    if "token_hash" not in cols:
        conn.execute("ALTER TABLE sessions ADD COLUMN token_hash TEXT")
    if "expires_at" not in cols:
        conn.execute("ALTER TABLE sessions ADD COLUMN expires_at TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_users_login_id ON users(login_id)")
    conn.commit()
    return conn


def _validate_login_id(login_id: str) -> str:
    login_id = login_id.strip()
    if not login_id or len(login_id) > _MAX_LOGIN_ID_LEN:
        raise ValueError("아이디는 1~100자여야 합니다.")
    return login_id


def _validate_password(password: str) -> str:
    if not password or len(password) > _MAX_PASSWORD_LEN:
        raise ValueError("비밀번호는 1~256자여야 합니다.")
    return password


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _session_expires_at() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=_SESSION_TTL_DAYS)).isoformat()


def _purge_expired_sessions(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at <= ?", (_now(),))


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
    login_id = _validate_login_id(login_id)
    password = _validate_password(password)
    display_name = (display_name or login_id).strip()
    if not display_name or len(display_name) > _MAX_DISPLAY_NAME_LEN:
        raise ValueError("표시 이름은 1~100자여야 합니다.")
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
    login_id = _validate_login_id(login_id)
    new_password = _validate_password(new_password)
    conn = _connect()
    try:
        cur = conn.execute(
            "UPDATE users SET pw_hash = ? WHERE login_id = ?",
            (hash_password(new_password), login_id),
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
    login_id = login_id.strip()
    if not login_id or len(login_id) > _MAX_LOGIN_ID_LEN or len(password) > _MAX_PASSWORD_LEN:
        return None
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
    hashed = _token_hash(token)
    conn = _connect()
    try:
        _purge_expired_sessions(conn)
        conn.execute(
            "INSERT INTO sessions (token, token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
            (hashed, hashed, user_id, _now(), _session_expires_at()),
        )
        conn.commit()
    finally:
        conn.close()
    return token


def user_for_token(token: str | None) -> dict | None:
    """출입증(토큰)에 해당하는 사용자를 돌려준다. 없거나 유효하지 않으면 None."""
    if not token:
        return None
    if len(token) > 256:
        return None
    hashed = _token_hash(token)
    conn = _connect()
    try:
        _purge_expired_sessions(conn)
        row = conn.execute(
            "SELECT u.id, u.login_id, u.display_name"
            " FROM sessions s JOIN users u ON u.id = s.user_id"
            " WHERE (s.token_hash = ? OR s.token = ?)"
            " AND (s.expires_at IS NULL OR s.expires_at > ?)",
            (hashed, token, _now()),
        ).fetchone()
        conn.commit()
    finally:
        conn.close()
    if row is None:
        return None
    return {"id": row[0], "loginId": row[1], "displayName": row[2]}


def destroy_session(token: str | None) -> None:
    """출입증을 폐기한다(로그아웃)."""
    if not token:
        return
    hashed = _token_hash(token)
    conn = _connect()
    try:
        conn.execute("DELETE FROM sessions WHERE token_hash = ? OR token = ?", (hashed, token))
        conn.commit()
    finally:
        conn.close()
