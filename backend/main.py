# -*- coding: utf-8 -*-
"""백엔드 통합 진입점 — RAG API + 보고서 API를 한 서버로 띄운다.

실행:
  cd backend && ./venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000

동작 방식:
  rag/api.py 가 만든 FastAPI 앱(app)을 그대로 가져와서 보고서 라우터만 추가한다.
  → 기존 rag 코드는 한 줄도 바꾸지 않고, 예전 명령(uvicorn rag.api:app)도 계속 동작한다
    (그 경우 보고서 API만 빠짐).

RAG 의존성(chromadb 등)이 설치되지 않은 환경에서는 RAG를 건너뛰고
보고서 API만으로 서버를 띄운다(지식 탭은 그동안 동작하지 않음 — 시작 로그에 표시).
"""

try:
    from rag.api import app  # RAG 앱(CORS 포함)을 기반으로 사용
    _rag_loaded = True
except ImportError as ex:  # chromadb 등 미설치 환경 — 보고서 API만으로 기동
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from starlette.middleware.trustedhost import TrustedHostMiddleware

    from rag import config  # allowed_origins()는 chromadb에 의존하지 않아 이 경로에서도 안전
    from security import BodySizeLimitMiddleware, SecurityHeadersMiddleware, allowed_hosts

    app = FastAPI(title="RS-Ground API (report only)")
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts())
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.allowed_origins(),
        allow_credentials=True,  # 로그인 쿠키 주고받기용(배포 시 로그인 단계에서 사용)
        allow_methods=["*"],
        allow_headers=["*"],
    )
    _rag_loaded = False
    # 주의: Windows 콘솔(cp949)에서도 출력되도록 특수문자 없이 쓴다
    print("[main] RAG 미탑재(%s) -> 보고서 API만 기동. 지식 탭은 동작하지 않음." % ex)

from report.api import router as report_router
from store.api import router as store_router
from auth.api import AuthMiddleware, router as auth_router

# 로그인 창구(/api/auth/*)를 연다.
app.include_router(auth_router)
app.include_router(report_router)
app.include_router(store_router)

# 문지기: /api/rag·/api/report·/api/store 요청에 유효한 출입증(토큰)이 있는지 검사한다.
# (라우터 등록 뒤에 추가해도 요청 처리 시점에 적용된다. /api/auth·OPTIONS는 통과.)
app.add_middleware(AuthMiddleware)

if _rag_loaded:
    print("[main] RAG + 보고서 API 기동 (로그인 보호 켜짐)")
