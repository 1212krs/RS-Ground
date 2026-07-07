"""ChromaDB 저장/검색.

PRD-RAG.md 4.3절 핵심 규칙:
- 컬렉션 생성 시 거리 방식을 cosine으로 지정한다 (생성 후 변경 불가).
- ChromaDB 내장 임베딩 함수는 쓰지 않고, 업스테이지 벡터를 직접 넣고 뺀다.
- 문서 ID는 {source}::{chunk_index} 로 결정적으로 만들어 upsert한다 (재실행 시 중복 방지).
"""

from __future__ import annotations

import chromadb

from . import config
from .chunker import Chunk


def get_client(persist_dir=config.CHROMA_DIR) -> chromadb.ClientAPI:
    persist_dir.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(
        path=str(persist_dir),
        settings=chromadb.Settings(anonymized_telemetry=False),
    )


def get_collection(client: chromadb.ClientAPI, name: str = config.COLLECTION_NAME):
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": config.CHROMA_DISTANCE_METRIC},
    )


def reset_collection(client: chromadb.ClientAPI, name: str = config.COLLECTION_NAME):
    """컬렉션을 통째로 비우고 새로 만든다.

    재색인 시 삭제되거나 줄어든 문서의 오래된 청크가 컬렉션에 남아 검색 결과를 오염시키는 것을 막는다.
    임베딩 API 호출은 SQLite 캐시가 막아주므로, 매번 비우고 다시 채워도 API 비용은 거의 늘지 않는다.
    """
    try:
        client.delete_collection(name=name)
    except Exception:
        pass
    return get_collection(client, name=name)


def chunk_id(chunk: Chunk) -> str:
    return f"{chunk.source}::{chunk.chunk_index}"


def upsert_chunks(collection, chunks: list[Chunk], vectors: list[list[float]]) -> None:
    if len(chunks) != len(vectors):
        raise ValueError("청크 개수와 벡터 개수가 다릅니다.")
    if not chunks:
        return

    collection.upsert(
        ids=[chunk_id(c) for c in chunks],
        embeddings=vectors,
        documents=[c.text for c in chunks],
        metadatas=[
            {
                "source": c.source,
                "chunk_index": c.chunk_index,
                "char_start": c.char_start,
                "char_end": c.char_end,
                "content_hash": c.content_hash,
                "embedding_model": config.EMBEDDING_MODEL_PASSAGE,
                "chunk_size": c.chunk_size,
                "chunk_overlap": c.chunk_overlap,
                "created_at": c.created_at,
                "category_l1": c.category_l1,
                "category_l2": c.category_l2,
                "category_l3": c.category_l3,
            }
            for c in chunks
        ],
    )


def _category_where(
    category_l1: str | None = None,
    category_l2: str | None = None,
    category_l3: str | None = None,
) -> dict | None:
    """category_l1/l2/l3 조건을 ChromaDB where 절로 변환한다. 조건이 없으면 None(필터 없음)."""
    conditions = []
    if category_l1:
        conditions.append({"category_l1": category_l1})
    if category_l2:
        conditions.append({"category_l2": category_l2})
    if category_l3:
        conditions.append({"category_l3": category_l3})

    if not conditions:
        return None
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


def query(
    collection,
    query_vector: list[float],
    top_k: int = config.TOP_K_DEFAULT,
    category_l1: str | None = None,
    category_l2: str | None = None,
    category_l3: str | None = None,
) -> dict:
    """유사도 검색. category_l1/l2/l3를 주면 해당 분류 안에서만 검색한다."""
    where = _category_where(category_l1, category_l2, category_l3)
    return collection.query(
        query_embeddings=[query_vector],
        n_results=top_k,
        where=where,
    )
