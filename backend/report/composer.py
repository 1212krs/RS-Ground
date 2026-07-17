# -*- coding: utf-8 -*-
"""제목·내용·참고자료 → 보고서 본문 생성 (Claude API + 대체 생성기).

역할 분담(핵심 설계 원칙):
  - AI(Claude)는 문서의 '내용 데이터'(제목/개요/섹션 블록/표 데이터)만 JSON으로 만든다.
  - hwpx XML 조립은 engine.py(코드)가 전담한다 — AI가 XML을 직접 쓰면 형식이
    조금만 틀려도 한글에서 파일이 안 열리기 때문.

지침 3계층(충돌 시 뒤가 우선):
  기본 규칙(이 파일) < _공통지침.md < 서식이름.md

API 키가 없거나 호출이 실패하면 규칙 기반 '대체 생성기'로 초안을 만들어
흐름이 끊기지 않게 한다(응답의 engine 필드로 구분: "ai" | "fallback").
"""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.request

from .engine import common_guide

API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-opus-4-8"
FILE_CHAR_LIMIT = 6000    # 참고 파일 1개당 프롬프트 주입 한도
TOTAL_CHAR_LIMIT = 15000  # 참고 파일 전체 한도

# Claude 구조화 출력(JSON 스키마) — 응답이 반드시 이 모양이 되도록 강제
COMPOSE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "overview": {"type": "string"},
        "sections": {
            "type": "array",
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "level": {"type": "string", "enum": ["head", "item", "sub"]},
                        "text": {"type": "string"},
                    },
                    "required": ["level", "text"],
                    "additionalProperties": False,
                },
            },
        },
        "table": {
            "anyOf": [
                {"type": "null"},
                {
                    "type": "object",
                    "properties": {
                        "caption": {"type": "string"},
                        "headers": {"type": "array", "items": {"type": "string"}},
                        "rows": {"type": "array",
                                 "items": {"type": "array", "items": {"type": "string"}}},
                        "section": {"type": "integer"},
                    },
                    "required": ["caption", "headers", "rows", "section"],
                    "additionalProperties": False,
                },
            ]
        },
    },
    "required": ["title", "overview", "sections", "table"],
    "additionalProperties": False,
}


def _api_key() -> tuple[str, str]:
    """키 탐색: 환경변수 ANTHROPIC_API_KEY (backend/.env 는 api.py의 load_dotenv가 로드)."""
    k = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    return (k, "env") if k else ("", "")


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    # 기관망 SSL 검사 장비의 인증서(AKI 확장 누락)를 허용하되 검증 자체는 유지.
    # 일반 네트워크에서는 아무 영향 없음.
    ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return ctx


def _compose_system(tpl: dict) -> str:
    labels = tpl["sections"]
    feats = tpl.get("features", {})
    numbered = ", ".join("%d=%s" % (i + 1, lab) for i, lab in enumerate(labels))
    if feats.get("head"):
        rule_levels = (
            "3) 항목은 3단계입니다. level='head'는 대항목(□), level='item'은 중간 항목(○), "
            "level='sub'은 세부(―)입니다. head 아래에 관련 item을, item 아래에 보충 sub를 "
            "배치합니다. 블록 수는 정해진 제한 없이 내용 분량에 맞게 정합니다.\n"
        )
    else:
        rule_levels = (
            "3) 각 섹션은 2~4개의 블록으로 구성합니다. level='item'은 상위 항목(○), "
            "level='sub'은 하위 세부(―)입니다. sub는 바로 위 item을 보충합니다. "
            "level='head'는 사용하지 않습니다.\n"
        )
    if feats.get("table", True):
        rule_table = (
            "5) table: 사용자가 표를 요청하면 4열(단계/주요 내용/추진 시기/담당 등) 표를 생성하고, "
            "요청하지 않으면 null. table.section에는 표 내용이 가장 어울리는 섹션 번호(%s)를 지정합니다. "
            "예: 추진 일정표는 계획·일정 성격의 섹션, 예산 내역은 행정사항 성격의 섹션.\n"
        ) % numbered
    else:
        rule_table = "5) table: 이 서식은 표를 지원하지 않으므로 반드시 null로 둡니다.\n"
    base = (
        "당신은 대한민국 지방자치단체의 보고서를 작성하는 행정 전문가입니다. "
        "주어진 제목과 내용으로 개조식 '%s' 문서 내용을 생성합니다.\n"
        "규칙:\n"
        "1) 문체는 개조식 종결어미(~함, ~임, ~필요)를 사용합니다.\n"
        "2) sections 배열은 반드시 %d개이며 순서는 [%s] 목차에 대응합니다.\n"
        "%s"
        "4) 핵심 항목은 '(구분) 내용' 형태로 시작하면 좋습니다. 예: '(소요예산) ...'.\n"
        "%s"
        "6) 날짜는 '2026. 8.' 형식을 씁니다.\n"
        "7) 사용자가 제목을 제공하면 그 제목을 사용하되, 서식의 제목 규칙이 있으면 그에 맞게 다듬을 수 있습니다.\n"
        "8) 참고 자료가 제공되면 그 안의 사실관계·수치·명칭을 우선 활용합니다. "
        "참고 자료에 없는 구체적 수치를 지어내지 않습니다."
    ) % (tpl["name"], len(labels), ", ".join(labels), rule_levels, rule_table)
    common = common_guide()
    if common:
        base += ("\n\n[공통 작성 지침 — 모든 보고서에 적용. 위 기본 규칙과 충돌하면 이 지침을 우선합니다]\n"
                 + common)
    if tpl.get("guide"):
        base += ("\n\n[이 서식의 작성 지침 — 공통 지침과 충돌하면 이 서식 지침을 최우선합니다]\n"
                 + tpl["guide"])
    return base


def _compose_user(req: dict, tpl: dict) -> str:
    parts = ["제목: %s" % req["title"]]
    if req.get("brief"):
        parts.append("보고서에 담을 내용(사용자 메모):\n%s" % req["brief"])
    used = 0
    for name, text in req.get("files", []):
        take = min(FILE_CHAR_LIMIT, TOTAL_CHAR_LIMIT - used)
        if take <= 0:
            break
        snippet = text.strip()[:take]
        used += len(snippet)
        parts.append("[참고 자료: %s]\n%s" % (name, snippet))
    parts.append("표 포함: %s" % ("예" if req["include_table"] else "아니오"))
    parts.append("위 제목과 내용, 참고 자료를 바탕으로 '%s' 문서를 스키마에 맞춰 생성하세요." % tpl["name"])
    return "\n\n".join(parts)


def _compose_llm(req: dict, tpl: dict) -> dict:
    """Claude Messages API 직접 호출.

    anthropic SDK 대신 표준 라이브러리(urllib)를 쓰는 이유: 배포 의존성 최소화 +
    pip이 막힌 기관망에서도 동작. 구조화 출력(output_config.format)으로 응답이
    반드시 COMPOSE_SCHEMA 모양의 JSON이 되도록 강제한다."""
    key, _src = _api_key()
    if not key:
        raise RuntimeError("API 키 없음 — backend/.env 에 ANTHROPIC_API_KEY=... 를 넣으세요")
    body = {
        "model": MODEL,
        "max_tokens": 8000,
        "system": _compose_system(tpl),
        "messages": [{"role": "user", "content": _compose_user(req, tpl)}],
        "output_config": {"format": {"type": "json_schema", "schema": COMPOSE_SCHEMA}},
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
    doc = json.loads(text)
    # 안전장치: 섹션 수를 템플릿에 맞춰 정규화
    n = len(tpl["sections"])
    secs = doc.get("sections") or []
    doc["sections"] = (secs + [[] for _ in range(n)])[:n]
    if not tpl.get("features", {}).get("head"):
        # □ 단계가 없는 서식에서 head가 나오면 상위 항목(○)으로 강등
        for sec in doc["sections"]:
            for b in sec:
                if b.get("level") == "head":
                    b["level"] = "item"
    if not req["include_table"]:
        doc["table"] = None
    return doc


# ── 대체 생성기: 섹션 이름 키워드 → 자리표시 문구 (API 없이 흐름 테스트용) ──
_FALLBACK_RULES = [
    (("본문",), [("item", "파주시는 {t}을(를) 본격 추진한다고 밝혔다."),
                ("sub", "세부 일정과 참여 방법은 시 누리집에서 확인할 수 있다."),
                ("item", "이번 사업으로 시민들은 더욱 편리한 행정 서비스를 이용할 수 있게 된다."),
                ("item", "시 관계자는 \"시민이 체감할 수 있는 변화를 만들어 가겠다\"고 말했다.")]),
    (("배경", "방향"), [("item", "(추진 배경) {t} 도입·추진 필요성이 증대되고 있음"),
                       ("sub", "대내외 여건 변화와 수요 증가에 선제적으로 대응할 필요가 있음")]),
    (("내용", "추진계획"), [("item", "(주요 내용) {t}을(를) 단계적으로 도입·운영함"),
                          ("item", "(추진 방식) 관계 부서 협업체계를 구성하여 체계적으로 추진함")]),
    (("현황", "문제", "현안"), [("item", "(현황) 현재 관련 업무는 수작업 중심으로 이루어지고 있음"),
                              ("item", "(검토사항) 효율성·정확성 측면에서 개선이 필요한 상황임")]),
    (("계획", "일정"), [("item", "1단계(2026. 8.~9.): 사전 준비 및 세부 계획 수립"),
                       ("item", "2단계(2026. 10.~11.): 시범 운영 및 성과 점검"),
                       ("sub", "시범 결과를 반영하여 개선사항을 도출함"),
                       ("item", "3단계(2026. 12.~): 전면 확대 시행")]),
    (("결과",), [("item", "(추진 결과) {t} 관련 주요 성과를 정리함"),
                ("sub", "세부 실적과 수치는 관계 부서 자료로 보완함")]),
    (("해결", "방안"), [("item", "관련 제도·절차를 정비하여 실효성을 확보함"),
                       ("item", "지속적인 점검·환류 체계를 운영하여 완성도를 높임")]),
    (("행정", "협조", "예산"), [("item", "(소요예산) 사업비를 별도 산정하여 확보함"),
                              ("sub", "세부 내역은 추진 계획 확정 후 조정함"),
                              ("item", "(협조사항) 관계 부서의 적극적인 협조가 필요함")]),
]


def _compose_fallback(req: dict, tpl: dict) -> dict:
    t = (req.get("title") or "신규 사업").strip()
    labels = tpl["sections"]
    sections = []
    for lab in labels:
        blocks = next((b for keys, b in _FALLBACK_RULES if any(k in lab for k in keys)),
                      [("item", "{t} 관련 %s 주요 사항을 검토·정리함" % lab),
                       ("sub", "세부 내용은 관계 부서 협의를 거쳐 확정함")])
        sections.append([(k, v.format(t=t)) for (k, v) in blocks])
    table = None
    if req["include_table"]:
        at = next((i + 1 for i, lab in enumerate(labels) if "계획" in lab or "일정" in lab),
                  len(labels))
        table = {
            "caption": "%s 추진 일정" % t,
            "headers": ["단계", "주요 내용", "추진 시기", "담당"],
            "rows": [["1단계", "계획 수립", "8월~9월", "주관부서"],
                     ["2단계", "시범 운영", "10월~11월", "관계부서"],
                     ["3단계", "확대 시행", "12월~", "전 부서"]],
            "section": at,
        }
    overview = (req.get("brief") or "").strip()[:300] or \
               "%s을(를) 체계적으로 추진하여 행정 효율성과 대민 서비스 품질을 높이고자 함" % t
    return {
        "title": t,
        "overview": overview,
        "sections": [[{"level": k, "text": v} for (k, v) in sec] for sec in sections],
        "table": table,
    }


def compose(req: dict, tpl: dict) -> tuple[str, dict, str]:
    """(engine, doc, fallback_사유) 반환. engine ∈ {"ai", "fallback"}."""
    if not tpl.get("features", {}).get("table", True):
        req = {**req, "include_table": False}  # 표 없는 서식은 표 요청 무시
    try:
        return "ai", _compose_llm(req, tpl), ""
    except Exception as ex:
        print("[report] LLM 미사용(%s: %s) → 대체 생성기" % (type(ex).__name__, ex))
        return "fallback", _compose_fallback(req, tpl), str(ex)


def ai_status() -> dict:
    key, src = _api_key()
    return {"ai_ready": bool(key), "key_source": src}
