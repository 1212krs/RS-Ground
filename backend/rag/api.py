"""RAG 파이프라인을 웹 화면(지식 탭)에서 쓸 수 있게 여는 로컬 API 서버.

실행: cd backend && ./venv/Scripts/python.exe -m uvicorn rag.api:app --reload --port 8000
프론트(Vite, 127.0.0.1:5173)는 vite.config.js의 server.proxy['/api/rag']를 통해 이 서버로 요청을 전달한다.
"""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .chunker import chunk_directory, write_chunks_jsonl
from .embedder import EmbeddingCache, embed_passages
from .extractors import PLAIN_TEXT_SUFFIXES, SUPPORTED_SUFFIXES
from .store import get_client, get_collection, reset_collection, upsert_chunks

load_dotenv()

app = FastAPI(title="RS-Ground RAG API")

# Vite 프록시를 쓰면 브라우저 입장에서는 동일 출처라 사실 필요 없지만,
# curl 등으로 API를 직접 두드려볼 때를 위해 열어둔다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
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
        if part:
            target_dir = target_dir / part
    target_dir.mkdir(parents=True, exist_ok=True)

    target_path = target_dir / file.filename
    target_path.write_bytes(content)

    chunks = _reindex_all()
    source = target_path.relative_to(config.RAW_DOCS_DIR).as_posix()
    my_chunk_count = sum(1 for c in chunks if c.source == source)

    return {"source": source, "chunk_count": my_chunk_count, "total_chunks": len(chunks)}


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
