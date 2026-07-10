"""RAG 파이프라인 CLI 진입점.

사용 예:
    python -m rag.pipeline index      문서 청킹 → 임베딩 → ChromaDB 저장
    python -m rag.pipeline search "질문 텍스트"   저장된 청크 중 유사한 것 검색
"""

from __future__ import annotations

import argparse
import sys

from dotenv import load_dotenv

from . import config
from .chunker import chunk_directory, write_chunks_jsonl
from .embedder import EmbeddingCache, embed_passages, embed_query
from .store import get_client, get_collection, query, reset_collection, upsert_chunks


# 색인 시 한 번에 처리하는 청크 수. 이 단위로 임베딩→저장하고 벡터를 버려서
# 최대 메모리를 낮춘다(저메모리 서버 OOM 방지). 200개면 벡터가 약 6MB 수준이라 가볍다.
INDEX_BATCH = 200


def run_index() -> None:
    print(f"[1/3] 문서 청킹 중... ({config.RAW_DOCS_DIR})")
    chunks = chunk_directory()
    if not chunks:
        print(f"경고: {config.RAW_DOCS_DIR}에 지원하는 형식(txt/md/pdf/docx/hwpx)의 문서가 없습니다.", file=sys.stderr)
        return
    write_chunks_jsonl(chunks)
    print(f"  → 청크 {len(chunks)}개 생성, {config.CHUNKS_PATH}에 저장")

    # [2·3] 메모리 절약: 벡터를 전부 쌓지 않고 배치 단위로 임베딩→저장하고 바로 버린다.
    #       (한꺼번에 하면 저메모리 서버에서 ChromaDB 저장 중 OOM으로 죽는다.)
    print(f"[2/3] 임베딩 + [3/3] ChromaDB 저장 (배치 {INDEX_BATCH}개씩)... ({config.CHROMA_DIR})")
    cache = EmbeddingCache()
    client = get_client()
    collection = reset_collection(client)  # 삭제/축소된 문서의 오래된 청크가 남지 않도록 매번 비우고 다시 채움
    dim = 0
    for start in range(0, len(chunks), INDEX_BATCH):
        batch = chunks[start:start + INDEX_BATCH]
        vecs = embed_passages([c.text for c in batch], cache=cache)
        if vecs and not dim:
            dim = len(vecs[0])
        upsert_chunks(collection, batch, vecs)
        del vecs  # 다음 배치 전에 이 배치 벡터 메모리를 해제
        print(f"  → {min(start + INDEX_BATCH, len(chunks))}/{len(chunks)} 저장")
    cache.close()
    print(f"  → 컬렉션 '{config.COLLECTION_NAME}' 총 {collection.count()}개 문서 (차원 {dim})")
    print("색인 완료. 채팅/검색이 정상 동작합니다.")


def run_search(
    question: str,
    top_k: int = config.TOP_K_DEFAULT,
    category_l1: str | None = None,
    category_l2: str | None = None,
    category_l3: str | None = None,
) -> None:
    cache = EmbeddingCache()
    vector = embed_query(question, cache=cache)
    cache.close()

    client = get_client()
    collection = get_collection(client)
    result = query(
        collection,
        vector,
        top_k=top_k,
        category_l1=category_l1,
        category_l2=category_l2,
        category_l3=category_l3,
    )

    docs = result["documents"][0]
    metas = result["metadatas"][0]
    dists = result["distances"][0]

    print(f'질문: "{question}"\n')
    if not docs:
        print("검색 결과가 없습니다 (분류 필터 조건을 확인하세요).")
        return
    for rank, (doc, meta, dist) in enumerate(zip(docs, metas, dists), start=1):
        preview = doc[:150].replace("\n", " ")
        print(f"{rank}. [{meta['source']} #{meta['chunk_index']}] (거리={dist:.4f})")
        print(f"   {preview}\n")


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="RS-Ground RAG 파이프라인")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("index", help="문서 색인 (청킹→임베딩→ChromaDB 저장)")

    search_parser = subparsers.add_parser("search", help="질문으로 유사 청크 검색")
    search_parser.add_argument("question", type=str)
    search_parser.add_argument("--top-k", type=int, default=config.TOP_K_DEFAULT)
    search_parser.add_argument("--l1", type=str, default=None, help="대분류로 검색 범위 좁히기 (예: 기술)")
    search_parser.add_argument("--l2", type=str, default=None, help="중분류로 검색 범위 좁히기 (예: AI)")
    search_parser.add_argument("--l3", type=str, default=None, help="소분류로 검색 범위 좁히기 (예: AI챗봇)")

    args = parser.parse_args()

    if args.command == "index":
        run_index()
    elif args.command == "search":
        run_search(
            args.question,
            top_k=args.top_k,
            category_l1=args.l1,
            category_l2=args.l2,
            category_l3=args.l3,
        )


if __name__ == "__main__":
    main()
