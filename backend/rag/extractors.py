"""여러 문서 형식에서 순수 텍스트를 추출한다.

.txt/.md는 그대로 읽고, .pdf/.docx/.hwpx는 각 형식에 맞는 방식으로 텍스트만 뽑아낸다.
추출된 텍스트는 chunker.py가 청킹할 때 원래 텍스트 파일과 동일하게 취급된다.
"""

from __future__ import annotations

import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import pdfplumber
from docx import Document

PLAIN_TEXT_SUFFIXES = {".txt", ".md"}
SUPPORTED_SUFFIXES = PLAIN_TEXT_SUFFIXES | {".pdf", ".docx", ".hwpx"}


def _local_name(tag: str) -> str:
    """XML 태그에서 네임스페이스를 떼고 이름만 남긴다. 예: '{...}p' -> 'p'."""
    return tag.rsplit("}", 1)[-1]


def _extract_pdf(path: Path) -> str:
    with pdfplumber.open(path) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    return "\n\n".join(pages)


def _extract_docx(path: Path) -> str:
    doc = Document(path)
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            parts.append(" | ".join(cell.text for cell in row.cells))
    return "\n\n".join(parts)


def _extract_hwpx(path: Path) -> str:
    """HWPX는 OOXML처럼 zip 안에 XML(OWPML)로 저장된 문서다.

    Contents/section*.xml 안에서 문단(hp:p) 단위로 텍스트 런(hp:t)을 모아 재구성한다.
    네임스페이스 URI가 버전마다 다를 수 있어 로컬 이름(p, t)만으로 판별한다.
    """
    paragraphs: list[str] = []
    with zipfile.ZipFile(path) as zf:
        section_names = sorted(
            name for name in zf.namelist()
            if name.startswith("Contents/section") and name.endswith(".xml")
        )
        for name in section_names:
            root = ET.fromstring(zf.read(name))
            for elem in root.iter():
                if _local_name(elem.tag) != "p":
                    continue
                run_texts = [
                    t.text for t in elem.iter()
                    if _local_name(t.tag) == "t" and t.text
                ]
                if run_texts:
                    paragraphs.append("".join(run_texts))
    return "\n\n".join(paragraphs)


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in PLAIN_TEXT_SUFFIXES:
        return path.read_text(encoding="utf-8")
    if suffix == ".pdf":
        return _extract_pdf(path)
    if suffix == ".docx":
        return _extract_docx(path)
    if suffix == ".hwpx":
        return _extract_hwpx(path)
    raise ValueError(f"지원하지 않는 파일 형식입니다: {suffix}")
