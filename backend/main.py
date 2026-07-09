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

    app = FastAPI(title="RS-Ground API (report only)")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    _rag_loaded = False
    # 주의: Windows 콘솔(cp949)에서도 출력되도록 특수문자 없이 쓴다
    print("[main] RAG 미탑재(%s) -> 보고서 API만 기동. 지식 탭은 동작하지 않음." % ex)

from report.api import router as report_router
from store.api import router as store_router

app.include_router(report_router)
app.include_router(store_router)

if _rag_loaded:
    print("[main] RAG + 보고서 API 기동")
