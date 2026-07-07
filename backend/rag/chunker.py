"""문서를 검색 단위(청크)로 분할한다. 문단 경계를 우선 존중하고, 문단이 너무 길면 문장 단위로 더 쪼갠다.

PRD-RAG.md 4.1절: 청킹은 임베딩 모델보다 검색 품질에 더 큰 영향을 준다.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from . import config
from .extractors import SUPPORTED_SUFFIXES, extract_text

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?。])\s+")


@dataclass
class Chunk:
    text: str
    source: str
    chunk_index: int
    char_start: int
    char_end: int
    content_hash: str
    chunk_size: int
    chunk_overlap: int
    created_at: str
    category_l1: str = ""
    category_l2: str = ""
    category_l3: str = ""


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _split_into_paragraphs(text: str) -> list[str]:
    return [p for p in re.split(r"\n\s*\n", text) if p.strip()]


def _split_long_paragraph(paragraph: str, max_size: int) -> list[str]:
    if len(paragraph) <= max_size:
        return [paragraph]
    sentences = _SENTENCE_SPLIT_RE.split(paragraph)
    pieces: list[str] = []
    current = ""
    for sentence in sentences:
        if current and len(current) + len(sentence) + 1 > max_size:
            pieces.append(current.strip())
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        pieces.append(current.strip())

    # 문장 구분자가 없는 문단(표, URL, 코드블록 등)은 위 분할로도 안 잘릴 수 있다.
    # 마지막 안전장치로 여전히 max_size를 넘는 조각을 고정 길이로 강제 분할한다.
    final_pieces: list[str] = []
    for piece in pieces:
        if len(piece) <= max_size:
            final_pieces.append(piece)
        else:
            final_pieces.extend(
                piece[i : i + max_size] for i in range(0, len(piece), max_size)
            )
    return final_pieces


def chunk_text(
    text: str,
    source: str,
    chunk_size: int = config.CHUNK_SIZE,
    chunk_overlap: int = config.CHUNK_OVERLAP,
    category: tuple[str, str, str] = ("", "", ""),
) -> list[Chunk]:
    """텍스트 하나를 문단 우선으로 자르고, 청크 사이에 오버랩을 붙여 문맥 단절을 완화한다."""
    paragraphs = _split_into_paragraphs(text)

    units: list[str] = []
    for paragraph in paragraphs:
        units.extend(_split_long_paragraph(paragraph, chunk_size))

    chunks: list[Chunk] = []
    buffer = ""
    search_from = 0
    now = datetime.now(timezone.utc).isoformat()

    def flush(buffer_text: str) -> None:
        buffer_text = buffer_text.strip()
        if not buffer_text:
            return
        start = text.find(buffer_text, max(search_from - len(buffer_text), 0))
        if start == -1:
            start = text.find(buffer_text)
        end = start + len(buffer_text) if start != -1 else len(buffer_text)
        chunks.append(
            Chunk(
                text=buffer_text,
                source=source,
                chunk_index=len(chunks),
                char_start=max(start, 0),
                char_end=max(end, 0),
                content_hash=_content_hash(buffer_text),
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                created_at=now,
                category_l1=category[0],
                category_l2=category[1],
                category_l3=category[2],
            )
        )

    for unit in units:
        candidate = f"{buffer}\n\n{unit}".strip() if buffer else unit
        if len(candidate) <= chunk_size:
            buffer = candidate
            continue

        flush(buffer)
        overlap_text = buffer[-chunk_overlap:] if chunk_overlap and buffer else ""
        buffer = f"{overlap_text}\n\n{unit}".strip() if overlap_text else unit

    flush(buffer)
    return chunks


def _category_from_path(relative_path: Path) -> tuple[str, str, str]:
    """상위 폴더 계층을 (대분류, 중분류, 소분류) 3단으로 뽑는다. 부족한 단계는 빈 문자열.

    예: 기술/AI/AI챗봇/설계서.md → ("기술", "AI", "AI챗봇")
        예산회계/2025예산.md    → ("예산회계", "", "")
    """
    parts = relative_path.parent.parts
    padded = (list(parts) + ["", "", ""])[:3]
    return (padded[0], padded[1], padded[2])


def chunk_directory(raw_dir: Path = config.RAW_DOCS_DIR) -> list[Chunk]:
    """폴더 안의 지원 형식(txt/md/pdf/docx/hwpx) 파일을 전부 읽어 청크 목록을 만든다. 하위 폴더 경로는 자동으로 category_l1/l2/l3 메타데이터가 된다."""
    all_chunks: list[Chunk] = []
    for path in sorted(raw_dir.rglob("*")):
        if path.suffix.lower() not in SUPPORTED_SUFFIXES:
            continue
        text = extract_text(path)
        relative_path = path.relative_to(raw_dir)
        source = relative_path.as_posix()
        category = _category_from_path(relative_path)
        all_chunks.extend(chunk_text(text, source=source, category=category))
    return all_chunks


def write_chunks_jsonl(chunks: list[Chunk], out_path: Path = config.CHUNKS_PATH) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        for chunk in chunks:
            f.write(json.dumps(asdict(chunk), ensure_ascii=False) + "\n")


def read_chunks_jsonl(path: Path = config.CHUNKS_PATH) -> list[Chunk]:
    chunks = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                chunks.append(Chunk(**json.loads(line)))
    return chunks
