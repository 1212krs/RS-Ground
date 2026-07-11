# -*- coding: utf-8 -*-
"""공부 정리 에이전트의 업로드 파일 → 텍스트 추출.

report/extractors.py(txt/md/csv/hwp/hwpx/docx, bytes 기반)를 재사용하고,
report 쪽에 없는 PDF만 pdfplumber로 직접 처리한다.

report.extract_file_text()는 실패해도 예외 대신 "[사유]" 문자열을 돌려주는 계약이라
(여러 참고파일 중 하나가 실패해도 나머지로 계속 진행하는 보고서 흐름에 맞춘 설계),
여기서는 그 문자열을 감지해 ValueError로 승격한다 — 공부 에이전트는 파일 1개를 올리고
그 결과를 바로 확인하는 흐름이라 실패를 사용자에게 바로 보여줘야 하기 때문이다.
"""

from __future__ import annotations

import io
import os

from report.extractors import extract_file_text

SUPPORTED_SUFFIXES = {".txt", ".md", ".csv", ".pdf", ".docx", ".hwpx", ".hwp"}


def extract_upload_text(name: str, data: bytes) -> str:
    """업로드 파일(bytes) → 텍스트. 실패 시 ValueError."""
    ext = os.path.splitext(name)[1].lower()
    if ext == ".pdf":
        import pdfplumber  # 지연 import: study 패키지 로드 시 불필요한 의존성 강제 방지

        try:
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                text = "\n\n".join(page.extract_text() or "" for page in pdf.pages)
        except Exception as ex:
            raise ValueError("PDF 텍스트 추출 실패(%s): %s" % (type(ex).__name__, ex))
    else:
        text = extract_file_text(name, data)
        if text.startswith("[지원하지 않는 형식") or text.startswith("[텍스트 추출 실패"):
            raise ValueError(text.strip("[]"))

    if not text.strip():
        raise ValueError("파일에서 텍스트를 찾지 못했습니다(스캔 이미지 PDF는 지원하지 않습니다).")
    return text
