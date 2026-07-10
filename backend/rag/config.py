"""RAG 파이프라인 공통 설정. 경로·모델명·청킹 값을 한곳에 모아 다른 모듈이 참조한다."""

import os
from pathlib import Path

from security import ensure_no_wildcard


def allowed_origins() -> list[str]:
    """CORS 친구 명단(이 주소들에서 온 브라우저 요청만 허락한다).

    - 기본값: 내 PC 개발용 주소(localhost:5173).
    - 배포 시: 환경변수 FRONTEND_ORIGINS 에 Vercel 화면 주소를 넣으면 명단에 추가된다.
      여러 개면 콤마(,)로 구분. 예) FRONTEND_ORIGINS="https://rs-ground.vercel.app"
    """
    origins = ["http://127.0.0.1:5173", "http://localhost:5173"]
    extra = os.environ.get("FRONTEND_ORIGINS", "")
    origins += [o.strip() for o in extra.split(",") if o.strip()]
    ensure_no_wildcard(origins, "FRONTEND_ORIGINS")
    return origins

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

# 원본 문서 폴더. 이건 git으로 관리되는 "원천"이라 항상 저장소 안(repo/data/raw)을 본다.
RAW_DOCS_DIR = PROJECT_ROOT / "data" / "raw"

# 생성물(벡터DB·임베딩 캐시·청크·지도 좌표)이 저장되는 폴더.
# - 개발(내 PC): 환경변수 없음 → repo/data 아래에 그대로 저장(지금까지와 동일).
# - 배포(Render): RSG_DATA_DIR 환경변수에 영구 디스크 경로(예: /var/data)를 주면
#   생성물이 그 디스크에 저장되어 재배포해도 지워지지 않는다.
DATA_DIR = Path(os.environ.get("RSG_DATA_DIR") or (PROJECT_ROOT / "data"))

CHUNKS_PATH = DATA_DIR / "chunks.jsonl"
CACHE_DB_PATH = DATA_DIR / "cache" / "embeddings.db"
CHROMA_DIR = DATA_DIR / "chroma"

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
