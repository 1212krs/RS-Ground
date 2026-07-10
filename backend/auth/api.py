# -*- coding: utf-8 -*-
"""로그인 시스템의 웹 계층 — 로그인/로그아웃/내정보 API + 요청을 지키는 '문지기' 미들웨어.

동작(출입증=토큰 방식):
  1) POST /api/auth/login  {loginId, password}
       → 맞으면 { user, token } 반환. 화면은 token을 보관한다.
  2) 이후 화면은 요청 헤더에 `Authorization: Bearer <token>`을 실어 보낸다.
  3) 문지기 미들웨어가 /api/rag·/api/report·/api/store 요청의 토큰을 검사한다.
       유효하지 않으면 401(로그인 필요)로 막는다 → 아무나 백엔드를 못 써서 API 비용을 보호.
  4) /api/auth/* 와 CORS 사전요청(OPTIONS)은 문지기를 통과시킨다(그래야 로그인 자체가 가능).

쿠키 대신 토큰을 쓰는 이유: 화면(Vercel)과 백엔드(Render)가 다른 출처라 쿠키는 브라우저
보안규칙(SameSite/Secure)이 까다롭다. 토큰-헤더 방식은 로컬·배포 어디서나 동일하게 동작한다.
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Header, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from rag import config
from . import store

router = APIRouter(prefix="/api/auth")

# 문지기가 검사하는 경로들. 이 접두어로 시작하는 요청은 로그인(토큰)이 필요하다.
PROTECTED_PREFIXES = ("/api/rag", "/api/report", "/api/store")


def _bearer(authorization: str | None) -> str | None:
    """'Authorization: Bearer <token>' 헤더에서 토큰만 뽑아낸다."""
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def require_user(authorization: str | None = Header(default=None)) -> dict:
    """라우터에서 '로그인된 사용자'를 요구할 때 쓰는 의존성. 없으면 401."""
    user = store.user_for_token(_bearer(authorization))
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return user


# --- 라우터(로그인 창구) ----------------------------------------------------

@router.post("/login")
def login(payload: dict = Body(...)):
    login_id = (payload.get("loginId") or "").strip()
    password = payload.get("password") or ""
    user = store.authenticate(login_id, password)
    if user is None:
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")
    token = store.create_session(user["id"])
    return {"user": user, "token": token}


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    store.destroy_session(_bearer(authorization))
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(require_user)):
    return {"user": user}


# --- 문지기 미들웨어 --------------------------------------------------------

def _cors_headers(request: Request) -> dict:
    """401 응답에도 CORS 헤더를 붙여, 브라우저가 401 내용을 정상적으로 읽게 한다.

    (미들웨어가 CORSMiddleware보다 먼저 응답을 만들 수 있어, 여기서 직접 반영한다.)
    """
    origin = request.headers.get("origin")
    if origin and origin in config.allowed_origins():
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
    return {}


class AuthMiddleware(BaseHTTPMiddleware):
    """보호 대상 경로에 유효한 출입증(토큰)이 있는지 검사하는 문지기."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # CORS 사전요청(OPTIONS)과 보호 대상이 아닌 경로는 그냥 통과.
        if request.method == "OPTIONS" or not path.startswith(PROTECTED_PREFIXES):
            return await call_next(request)
        user = store.user_for_token(_bearer(request.headers.get("authorization")))
        if user is None:
            return JSONResponse(
                {"error": "로그인이 필요합니다."},
                status_code=401,
                headers=_cors_headers(request),
            )
        request.state.user = user
        return await call_next(request)
