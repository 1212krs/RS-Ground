"""RAG 파이프라인 CLI 진입점.

사용 예:
    python -m rag.pipeline index      문서 청킹 → 임베딩 → ChromaDB 저장 → 시각화까지 전체 실행
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
from .visualize import build_scatter_html, compute_umap_coords, save_coords


def run_index() -> None:
    print(f"[1/5] 문서 청킹 중... ({config.RAW_DOCS_DIR})")
    chunks = chunk_directory()
    if not chunks:
        print(f"경고: {config.RAW_DOCS_DIR}에 지원하는 형식(txt/md/pdf/docx/hwpx)의 문서가 없습니다.", file=sys.stderr)
        return
    write_chunks_jsonl(chunks)
    print(f"  → 청크 {len(chunks)}개 생성, {config.CHUNKS_PATH}에 저장")

    print(f"[2/5] 임베딩 중... (모델: {config.EMBEDDING_MODEL_PASSAGE})")
    cache = EmbeddingCache()
    texts = [c.text for c in chunks]
    vectors = embed_passages(texts, cache=cache)
    cache.close()
    print(f"  → 벡터 {len(vectors)}개 (차원 {len(vectors[0]) if vectors else 0})")

    print(f"[3/5] ChromaDB 저장 중... ({config.CHROMA_DIR})")
    client = get_client()
    collection = reset_collection(client)  # 삭제/축소된 문서의 오래된 청크가 남지 않도록 매번 비우고 다시 채움
    upsert_chunks(collection, chunks, vectors)
    print(f"  → 컬렉션 '{config.COLLECTION_NAME}' 총 {collection.count()}개 문서")

    print("[4/5] UMAP 차원 축소 중...")
    coords = compute_umap_coords(vectors)
    metadatas = [
        {
            "source": c.source,
            "chunk_index": c.chunk_index,
            "category_l1": c.category_l1,
            "text_preview": c.text[:100].replace("\n", " "),
        }
        for c in chunks
    ]
    save_coords(coords, metadatas)
    print(f"  → 좌표 저장: {config.UMAP_COORDS_PATH}")

    print("[5/5] 시각화 HTML 생성 중...")
    points = [{"x": float(x), "y": float(y), **m} for (x, y), m in zip(coords, metadatas)]
    build_scatter_html(points)
    print(f"  → 완료: {config.VISUALIZATION_PATH}")


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

    subparsers.add_parser("index", help="문서 색인 (청킹→임베딩→저장→시각화)")

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
