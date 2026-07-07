"""업스테이지 임베딩 API 호출 + SQLite 캐시.

핵심 원칙(PRD-RAG.md 4.2절): 같은 텍스트를 같은 모델로 두 번 임베딩하지 않는다.
그리고 문서(저장용)는 embedding-passage, 질문(검색용)은 embedding-query를 반드시 구분해서 쓴다.
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from pathlib import Path

import requests

from . import config


class UpstageAPIError(RuntimeError):
    pass


def _cache_key(model: str, text: str) -> str:
    return hashlib.sha256(f"{model}:{text}".encode("utf-8")).hexdigest()


class EmbeddingCache:
    def __init__(self, db_path: Path = config.CACHE_DB_PATH):
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path)
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS embeddings (
                cache_key TEXT PRIMARY KEY,
                model TEXT NOT NULL,
                vector TEXT NOT NULL
            )
            """
        )
        self._conn.commit()

    def get(self, model: str, text: str) -> list[float] | None:
        key = _cache_key(model, text)
        row = self._conn.execute(
            "SELECT vector FROM embeddings WHERE cache_key = ?", (key,)
        ).fetchone()
        if row is None:
            return None
        return json.loads(row[0])

    def set(self, model: str, text: str, vector: list[float]) -> None:
        key = _cache_key(model, text)
        self._conn.execute(
            "INSERT OR REPLACE INTO embeddings (cache_key, model, vector) VALUES (?, ?, ?)",
            (key, model, json.dumps(vector)),
        )
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()


def _call_upstage_api(texts: list[str], model: str, api_key: str) -> list[list[float]]:
    response = requests.post(
        config.UPSTAGE_API_URL,
        headers={"Authorization": f"Bearer {api_key}"},
        json={"model": model, "input": texts},
        timeout=60,
    )
    if response.status_code != 200:
        raise UpstageAPIError(f"업스테이지 API 오류 {response.status_code}: {response.text}")
    data = response.json()
    return [item["embedding"] for item in data["data"]]


def embed_texts(
    texts: list[str],
    model: str,
    api_key: str | None = None,
    cache: EmbeddingCache | None = None,
    batch_size: int = config.EMBEDDING_BATCH_SIZE,
) -> list[list[float]]:
    """텍스트 목록을 임베딩한다. 캐시에 있으면 API를 호출하지 않는다."""
    api_key = api_key or os.environ.get("UPSTAGE_API_KEY")
    owns_cache = cache is None
    cache = cache or EmbeddingCache()

    try:
        results: list[list[float] | None] = [cache.get(model, text) for text in texts]
        missing_indices = [i for i, v in enumerate(results) if v is None]

        if missing_indices:
            if not api_key:
                raise UpstageAPIError(
                    "UPSTAGE_API_KEY가 설정되어 있지 않습니다 (.env 파일 확인 필요)."
                )
            for batch_start in range(0, len(missing_indices), batch_size):
                batch_indices = missing_indices[batch_start : batch_start + batch_size]
                batch_texts = [texts[i] for i in batch_indices]
                vectors = _call_upstage_api(batch_texts, model=model, api_key=api_key)
                for idx, vector in zip(batch_indices, vectors):
                    results[idx] = vector
                    cache.set(model, texts[idx], vector)

        return [r for r in results if r is not None]
    finally:
        if owns_cache:
            cache.close()


def embed_passages(texts: list[str], **kwargs) -> list[list[float]]:
    return embed_texts(texts, model=config.EMBEDDING_MODEL_PASSAGE, **kwargs)


def embed_query(text: str, **kwargs) -> list[float]:
    return embed_texts([text], model=config.EMBEDDING_MODEL_QUERY, **kwargs)[0]
