"""RAG 파이프라인을 웹 화면(지식 탭)에서 쓸 수 있게 여는 로컬 API 서버.

실행: cd backend && ./venv/Scripts/python.exe -m uvicorn rag.api:app --reload --port 8000
프론트(Vite, 127.0.0.1:5173)는 vite.config.js의 server.proxy['/api/rag']를 통해 이 서버로 요청을 전달한다.
"""

from __future__ import annotations

import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .chat import answer_question
from .chunker import chunk_directory, write_chunks_jsonl
from .embedder import EmbeddingCache, embed_passages
from .extractors import PLAIN_TEXT_SUFFIXES, SUPPORTED_SUFFIXES
from .store import get_client, get_collection, reset_collection, upsert_chunks

# 실행 위치(cwd)에 상관없이 backend/.env 를 확실히 읽도록 경로를 고정한다.
# (config.BACKEND_DIR == backend/)
load_dotenv(config.BACKEND_DIR / ".env")


def _safe_name(name: str) -> str:
    """사용자 입력(파일명·분류명)에서 경로 조작 요소를 제거하고 마지막 이름 성분만 남긴다.

    ../, 절대경로, 드라이브 문자, 구분자를 걸러 data/raw 밖으로 새는 것을 막는다.
    """
    # 슬래시/백슬래시를 모두 잘라 마지막 성분만 취함 (Path.name은 OS별로 한쪽만 처리)
    base = name.replace("\\", "/").split("/")[-1].strip()
    if base in ("", ".", "..") or ":" in base:
        raise HTTPException(400, "허용되지 않는 이름입니다: %r" % name)
    return base

app = FastAPI(title="RS-Ground RAG API")

# Vite 프록시를 쓰면 브라우저 입장에서는 동일 출처라 사실 필요 없지만,
# curl 등으로 API를 직접 두드려볼 때를 위해 열어둔다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.allowed_origins(),
    allow_credentials=True,  # 로그인 쿠키를 주고받으려면 필요(배포 시 로그인 단계에서 사용)
    allow_methods=["*"],
    allow_headers=["*"],
)


def _reindex_all() -> list:
    """data/raw/ 전체를 다시 청킹→임베딩(캐시)→ChromaDB 재구성한다. PRD-RAG.md 4.3절 참고."""
    chunks = chunk_directory()
    write_chunks_jsonl(chunks)
    if not chunks:
        client = get_client()
        reset_collection(client)
        return []

    cache = EmbeddingCache()
    vectors = embed_passages([c.text for c in chunks], cache=cache)
    cache.close()

    client = get_client()
    collection = reset_collection(client)
    upsert_chunks(collection, chunks, vectors)
    return chunks


@app.post("/api/rag/documents")
async def upload_document(
    file: UploadFile = File(...),
    category_l1: str = Form(""),
    category_l2: str = Form(""),
    category_l3: str = Form(""),
):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        allowed = ", ".join(sorted(SUPPORTED_SUFFIXES))
        raise HTTPException(400, f"지원하지 않는 파일 형식입니다({suffix}). 지원 형식: {allowed}")

    content = await file.read()
    if suffix in PLAIN_TEXT_SUFFIXES:
        try:
            content.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(400, "UTF-8 텍스트 파일만 업로드할 수 있습니다.")

    target_dir = config.RAW_DOCS_DIR
    for part in (category_l1, category_l2, category_l3):
        if part.strip():
            target_dir = target_dir / _safe_name(part)
    target_dir.mkdir(parents=True, exist_ok=True)

    target_path = target_dir / _safe_name(file.filename)

    # 최종 방어선: 이름을 걸렀더라도 실제 경로가 data/raw 안에 있는지 재확인한다.
    raw_root = config.RAW_DOCS_DIR.resolve()
    if not target_path.resolve().is_relative_to(raw_root):
        raise HTTPException(400, "저장 경로가 허용 범위를 벗어났습니다.")

    target_path.write_bytes(content)

    chunks = _reindex_all()
    source = target_path.relative_to(config.RAW_DOCS_DIR).as_posix()
    my_chunk_count = sum(1 for c in chunks if c.source == source)

    return {"source": source, "chunk_count": my_chunk_count, "total_chunks": len(chunks)}


@app.post("/api/rag/chat")
def chat(payload: dict = Body(...)):
    """근거 기반 질의응답. category_l1을 주면 그 분야 문서만 검색한다(예: '회계'=회계챗, 없으면 전체=AI챗)."""
    question = (payload.get("question") or "").strip()
    if not question:
        raise HTTPException(400, "질문을 입력하세요.")
    category_l1 = (payload.get("category_l1") or "").strip() or None
    scope_label = (payload.get("scope_label") or "").strip() or category_l1
    try:
        top_k = int(payload.get("top_k") or config.TOP_K_DEFAULT)
    except (TypeError, ValueError):
        top_k = config.TOP_K_DEFAULT
    return answer_question(question, category_l1=category_l1, top_k=top_k, scope_label=scope_label)


@app.get("/api/rag/umap")
def get_umap():
    """저장된 임베딩 지도 좌표를 돌려준다. 색인이 바뀌어 좌표가 낡았으면 stale=True."""
    collection = get_collection(get_client())
    collection_count = collection.count()
    try:
        points = json.loads(config.UMAP_COORDS_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        points = []
    return {
        "points": points,
        "count": len(points),
        "collection_count": collection_count,
        "stale": len(points) != collection_count,
    }


@app.post("/api/rag/umap")
def rebuild_umap():
    """현재 ChromaDB에 색인된 모든 조각으로 UMAP 2D 좌표를 다시 계산해 저장한다.
    임베딩은 이미 저장된 것을 그대로 꺼내 쓰므로 임베딩 API 비용은 들지 않는다.
    (umap-learn 첫 호출은 컴파일 때문에 수십 초 걸릴 수 있음 — 그래서 업로드마다 자동으로 하지 않고 요청 시에만 계산)."""
    # UMAP은 무거운 의존성이라 서버 시작을 느리게 하지 않도록 이 안에서만 import 한다.
    from .visualize import compute_umap_coords, save_coords

    collection = get_collection(get_client())
    data = collection.get(include=["embeddings", "metadatas", "documents"])
    embeddings = data.get("embeddings")
    embeddings = list(embeddings) if embeddings is not None else []
    if len(embeddings) < 3:
        raise HTTPException(400, "지도를 그리려면 색인된 조각이 최소 3개 이상 필요합니다.")

    metas = data["metadatas"]
    docs = data["documents"]
    coords = compute_umap_coords(embeddings)
    metadatas = [
        {
            "source": m.get("source", ""),
            "chunk_index": m.get("chunk_index", 0),
            "category_l1": m.get("category_l1", ""),
            "text_preview": (docs[i] or "")[:100].replace("\n", " "),
        }
        for i, m in enumerate(metas)
    ]
    save_coords(coords, metadatas)
    points = [{"x": float(x), "y": float(y), **m} for (x, y), m in zip(coords, metadatas)]
    return {"points": points, "count": len(points),
            "collection_count": len(points), "stale": False}


@app.get("/api/rag/documents")
def list_documents():
    client = get_client()
    collection = get_collection(client)
    data = collection.get(include=["metadatas"])

    by_source: dict[str, dict] = {}
    for meta in data["metadatas"]:
        source = meta["source"]
        entry = by_source.setdefault(
            source,
            {
                "source": source,
                "category_l1": meta.get("category_l1", ""),
                "category_l2": meta.get("category_l2", ""),
                "category_l3": meta.get("category_l3", ""),
                "chunk_count": 0,
                "created_at": meta.get("created_at", ""),
            },
        )
        entry["chunk_count"] += 1

    return {"documents": sorted(by_source.values(), key=lambda d: d["source"])}
