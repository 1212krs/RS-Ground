"""RAG 파이프라인 공통 설정. 경로·모델명·청킹 값을 한곳에 모아 다른 모듈이 참조한다."""

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

RAW_DOCS_DIR = PROJECT_ROOT / "data" / "raw"
CHUNKS_PATH = PROJECT_ROOT / "data" / "chunks.jsonl"
CACHE_DB_PATH = PROJECT_ROOT / "data" / "cache" / "embeddings.db"
CHROMA_DIR = PROJECT_ROOT / "data" / "chroma"
UMAP_COORDS_PATH = PROJECT_ROOT / "data" / "umap_coords.json"
VISUALIZATION_PATH = PROJECT_ROOT / "output" / "embedding_map.html"

# 업스테이지 임베딩 API. 문서(저장용)와 질문(검색용)은 반드시 다른 모델을 쓴다 — PRD-RAG.md 4.2절.
UPSTAGE_API_URL = "https://api.upstage.ai/v1/embeddings"
EMBEDDING_MODEL_PASSAGE = "embedding-passage"
EMBEDDING_MODEL_QUERY = "embedding-query"
EMBEDDING_DIMENSIONS = 4096

# 업스테이지 배치 API 제한(요청당 텍스트 개수). 정확한 현재값은 구현 시 공식 문서로 재확인할 것.
EMBEDDING_BATCH_SIZE = 100

CHUNK_SIZE = 600
CHUNK_OVERLAP = 80

COLLECTION_NAME = "rs_ground_docs"

# ChromaDB 컬렉션 생성 시 거리 방식. 생성 후에는 변경 불가하므로 반드시 코사인으로 고정한다.
CHROMA_DISTANCE_METRIC = "cosine"

TOP_K_DEFAULT = 5
