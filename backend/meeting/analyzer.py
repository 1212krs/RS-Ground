# -*- coding: utf-8 -*-
"""회의 전문(텍스트) → 구조화 분석(마인드맵·용어 설명·액션 아이템·일정 후보).

설계(보고서 composer.py와 동일 원칙):
  - anthropic SDK 대신 표준 라이브러리(urllib)로 Claude Messages API를 직접 호출한다
    (배포 의존성 최소화 + pip이 막힌 기관망에서도 동작).
  - output_config.format(JSON 스키마)으로 응답이 반드시 ANALYSIS_SCHEMA 모양이 되게 강제한다.
    → 프론트가 다이어그램·목록을 안전하게 그릴 수 있음.
  - 다이어그램은 규칙 기반으로 못 만들기 때문에 보고서와 달리 fallback(대체 생성기)이 없다.
    키가 없거나 호출이 실패하면 RuntimeError를 올려 화면에 오류를 보여준다.

마인드맵은 재귀 스키마(구조화 출력 미지원)를 피하려고 **정확히 3단계**로 못박는다:
  중심(root) → 가지(branch) → 세부(leaf). PRD의 "최대 3단계" 제약과도 일치한다.
"""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.request

API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-5"   # 대화형/구조화라 빠르고 저렴한 최신 Sonnet 사용(PRD 확정)
TRANSCRIPT_CHAR_LIMIT = 30000   # 약 1시간 회의 분량. 초과분은 안내 오류(잘라 쓰지 않음)

# --- Claude 구조화 출력(JSON 스키마) ---------------------------------------

_LEAF = {  # 3단계: 세부 노드. 회의 내용만 담는다(용어 설명은 별도 terms[]로 분리).
    "type": "object",
    "properties": {
        "label": {"type": "string"},
    },
    "required": ["label"],
    "additionalProperties": False,
}
_BRANCH = {  # 2단계: 가지 노드
    "type": "object",
    "properties": {
        "label": {"type": "string"},
        "children": {"type": "array", "items": _LEAF},
    },
    "required": ["label", "children"],
    "additionalProperties": False,
}
_ROOT = {  # 1단계: 중심 주제
    "type": "object",
    "properties": {
        "label": {"type": "string"},
        "children": {"type": "array", "items": _BRANCH},
    },
    "required": ["label", "children"],
    "additionalProperties": False,
}

ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "summary": {"type": "string"},
        "mindmap": _ROOT,
        "terms": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "term": {"type": "string"},
                    "explanation": {"type": "string"},
                },
                "required": ["term", "explanation"],
                "additionalProperties": False,
            },
        },
        "action_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "owner": {"type": "string"},   # 언급 없으면 빈 문자열
                    "due": {"type": "string"},     # 언급 없으면 빈 문자열
                },
                "required": ["text", "owner", "due"],
                "additionalProperties": False,
            },
        },
        "schedule_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "date": {"type": "string"},   # YYYY-MM-DD (구체적 날짜가 있을 때만)
                    "time": {"type": "string"},   # HH:MM 또는 빈 문자열
                },
                "required": ["text", "date", "time"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["title", "summary", "mindmap", "terms", "action_items", "schedule_items"],
    "additionalProperties": False,
}

_SYSTEM = """당신은 한국어 회의록을 정리하는 도우미입니다. 회의 전문을 읽고 아래를 JSON 스키마에 맞춰 만드세요.

1) title: 회의 제목. 사용자가 제목을 줬으면 그대로 쓰고, 없으면 내용을 보고 짧게 지으세요.
2) summary: 회의 핵심을 3~5줄로 요약.
3) mindmap: 회의에서 실제로 논의된 내용만 마인드맵으로. 용어 설명 같은 부가 정보는 절대 넣지 마세요. 반드시 3단계입니다.
   - 중심(label)은 회의의 큰 주제. 8자 내외.
   - 가지(children)는 주요 분야/안건 (보통 3~7개). 4~10자 내외의 짧은 명사구.
   - 세부(가지의 children)는 각 안건의 구체적인 내용을 담은 짧은 문장(예: "임베딩 파이프라인 완료", "GPU 메모리 부족"). 6~16자 내외로, 무슨 일이 있었는지 알 수 있게 구체적으로 쓰세요. 안건당 2~5개.
4) terms: 회의 중 나온 전문 용어나 낯선 개념을 뽑아 회의 맥락에 맞는 쉬운 설명(2~4문장)을 답니다. mindmap과는 별도의 용어 사전이며, mindmap 안에 term 노드를 넣지 마세요.
5) action_items: "누가 무엇을 언제까지" 형태의 할 일. owner(담당자)와 due(기한)는 회의에서 언급됐을 때만 채우고, 없으면 빈 문자열("")로 두세요. 추측하지 마세요.
6) schedule_items: 회의에서 언급된 '구체적 날짜가 있는' 일정만(예: 다음 회의, 마감일). date는 YYYY-MM-DD, 모호한 표현("다음 주쯤")은 넣지 마세요. time은 언급됐을 때만.

전문에 없는 내용을 지어내지 말고, 실제 회의 내용에만 근거하세요."""


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    # 기관망 SSL 검사 장비의 인증서(AKI 확장 누락)를 허용하되 검증 자체는 유지.
    ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return ctx


def _api_key() -> str:
    return os.environ.get("ANTHROPIC_API_KEY", "").strip()


def analyze(transcript: str, title: str = "") -> dict:
    """회의 전문 → 분석 결과(dict). 키 없음·API 오류 시 RuntimeError."""
    transcript = (transcript or "").strip()
    if not transcript:
        raise RuntimeError("회의 전문이 비어 있습니다.")

    key = _api_key()
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY 없음")

    user = "회의 제목: %s\n\n회의 전문:\n%s" % (title.strip() or "(제목 없음)", transcript)
    body = {
        "model": MODEL,
        "max_tokens": 8000,
        "system": _SYSTEM,
        "messages": [{"role": "user", "content": user}],
        "output_config": {"format": {"type": "json_schema", "schema": ANALYSIS_SCHEMA}},
    }
    http_req = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"content-type": "application/json",
                 "anthropic-version": "2023-06-01",
                 "x-api-key": key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(http_req, timeout=180, context=_ssl_context()) as r:
            resp = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")
        try:
            detail = json.loads(detail)["error"]["message"]
        except Exception:
            detail = detail[:200]
        raise RuntimeError("Claude API 오류(HTTP %d): %s" % (e.code, detail))

    text = next(b["text"] for b in resp["content"] if b["type"] == "text")
    return json.loads(text)
