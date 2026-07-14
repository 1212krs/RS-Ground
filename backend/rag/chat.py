# -*- coding: utf-8 -*-
"""근거 기반 질의응답(RAG chat).

흐름: 질문 임베딩 → ChromaDB에서 관련 조각 검색(카테고리 필터 가능) →
      찾은 조각을 근거로 Claude가 한국어 답변 생성 → (답변, 근거 목록) 반환.

설계 원칙:
- '회계챗'처럼 특정 분야만 보는 에이전트와 'AI챗'(전체 검색)이 이 함수 하나를 공유한다.
  차이는 오직 category_l1 필터뿐 — 임베딩 창고(ChromaDB)는 하나를 같이 쓴다.
- API 키가 없거나 호출이 실패하면, 답변 생성만 건너뛰고 '찾은 근거 조각'은 그대로 돌려준다
  (report 탭과 같은 graceful degradation). engine 필드로 구분: "ai" | "fallback" | "no_results".
- Claude 호출은 anthropic SDK 대신 표준 라이브러리(urllib)로 — 배포 의존성 최소화(composer.py와 동일 이유).
"""
from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.request

from . import config
from .embedder import embed_query
from .store import get_client, get_collection, query as store_query

API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-5"   # 대화형이라 빠르고 저렴한 최신 Sonnet 사용
CONTEXT_CHAR_LIMIT = 1200   # 근거 조각 1개당 프롬프트에 넣는 최대 글자 수
PREVIEW_CHARS = 240         # 화면에 돌려줄 근거 미리보기 길이


def _api_key() -> str:
    return os.environ.get("ANTHROPIC_API_KEY", "").strip()


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    # 기관망 SSL 검사 장비의 인증서(AKI 확장 누락)를 허용하되 검증 자체는 유지.
    ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return ctx


def _retrieve(question: str, category_l1: str | None, top_k: int) -> list[dict]:
    """질문과 가장 가까운 조각들을 검색해 [{n, source, chunk_index, text, preview, distance}] 로 반환."""
    vector = embed_query(question)
    collection = get_collection(get_client())
    res = store_query(collection, vector, top_k=top_k, category_l1=category_l1)

    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0]

    hits = []
    for i, (text, meta) in enumerate(zip(docs, metas)):
        hits.append({
            "n": i + 1,
            "source": meta.get("source", ""),
            "chunk_index": meta.get("chunk_index", 0),
            "category_l1": meta.get("category_l1", ""),
            "text": text or "",
            "preview": (text or "").strip().replace("\n", " ")[:PREVIEW_CHARS],
            "distance": round(float(dists[i]), 4) if i < len(dists) else None,
        })
    return hits


def _system_prompt(scope_label: str | None) -> str:
    scope = ("너는 '%s' 분야 문서만 근거로 삼는 전문 도우미다. " % scope_label) if scope_label else \
            "너는 사용자의 지식 문서를 근거로 답하는 도우미다. "
    return (
        scope +
        "아래 '근거 발췌'에 담긴 내용만 사용해 한국어로 정확하게 답한다.\n"
        "규칙:\n"
        "1) 발췌에 없는 내용은 지어내지 말고 '제공된 문서에서 확인되지 않습니다'라고 말한다.\n"
        "2) 답변 문장 끝에 사용한 근거 번호를 [1], [2]처럼 표기한다.\n"
        "3) 숫자·금액·조항은 발췌에 있는 값을 그대로 인용하고 임의로 바꾸지 않는다.\n"
        "4) 간결하고 명확하게, 필요하면 항목으로 정리한다."
    )


def _user_prompt(question: str, hits: list[dict]) -> str:
    parts = ["[질문]\n%s" % question, "\n[근거 발췌]"]
    for h in hits:
        snippet = h["text"].strip()[:CONTEXT_CHAR_LIMIT]
        parts.append("[%d] (출처: %s) %s" % (h["n"], h["source"], snippet))
    parts.append("\n위 근거만 사용해 질문에 답하세요.")
    return "\n\n".join(parts)


def _call_claude(question: str, hits: list[dict], scope_label: str | None) -> str:
    key = _api_key()
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY 없음")
    body = {
        "model": MODEL,
        "max_tokens": 1500,
        "system": _system_prompt(scope_label),
        "messages": [{"role": "user", "content": _user_prompt(question, hits)}],
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
        with urllib.request.urlopen(http_req, timeout=120, context=_ssl_context()) as r:
            resp = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")
        try:
            detail = json.loads(detail)["error"]["message"]
        except Exception:
            detail = detail[:200]
        raise RuntimeError("Claude API 오류(HTTP %d): %s" % (e.code, detail))
    return "".join(b["text"] for b in resp["content"] if b["type"] == "text").strip()


def _stream_claude(question: str, hits: list[dict], scope_label: str | None):
    """Claude를 스트리밍 모드로 호출해 답변 텍스트 조각을 하나씩 내보낸다(제너레이터).

    _call_claude 와 요청 본문은 같고 "stream": True 만 추가한다. 응답은 SSE라서
    한 줄씩 읽어 'content_block_delta'의 text_delta 만 뽑아 yield 한다.
    연결/HTTP 오류는 RuntimeError로 올려 호출부가 fallback 하도록 한다.
    """
    key = _api_key()
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY 없음")
    body = {
        "model": MODEL,
        "max_tokens": 1500,
        "system": _system_prompt(scope_label),
        "messages": [{"role": "user", "content": _user_prompt(question, hits)}],
        "stream": True,
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
        resp = urllib.request.urlopen(http_req, timeout=120, context=_ssl_context())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")
        try:
            detail = json.loads(detail)["error"]["message"]
        except Exception:
            detail = detail[:200]
        raise RuntimeError("Claude API 오류(HTTP %d): %s" % (e.code, detail))

    with resp:
        for raw in resp:                      # HTTPResponse는 줄 단위로 순회 가능
            line = raw.decode("utf-8", "ignore").strip()
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if not payload:
                continue
            try:
                obj = json.loads(payload)
            except json.JSONDecodeError:
                continue
            kind = obj.get("type")
            if kind == "content_block_delta":
                delta = obj.get("delta") or {}
                if delta.get("type") == "text_delta":
                    text = delta.get("text", "")
                    if text:
                        yield text
            elif kind == "error":
                msg = (obj.get("error") or {}).get("message", "스트리밍 오류")
                raise RuntimeError("Claude 스트리밍 오류: %s" % msg)


def stream_answer_question(
    question: str,
    category_l1: str | None = None,
    top_k: int = config.TOP_K_DEFAULT,
    scope_label: str | None = None,
):
    """answer_question 의 스트리밍 버전(제너레이터).

    이벤트 dict를 순서대로 yield 한다(api.py가 이를 SSE로 감싼다):
      {"type":"sources", "engine", "sources"}  ← 검색 근거를 먼저 보냄(화면에 즉시 표시)
      {"type":"delta",   "text"}               ← 답변 조각(여러 번)
      {"type":"done",    "engine"}             ← 최종 engine("ai"|"fallback"|"no_results"|"error")
    """
    hits = _retrieve(question, category_l1, top_k)
    sources = [{k: h[k] for k in ("n", "source", "chunk_index", "category_l1", "preview", "distance")}
               for h in hits]

    if not hits:
        yield {"type": "sources", "engine": "no_results", "sources": []}
        yield {"type": "delta",
               "text": "관련된 내용을 지식 문서에서 찾지 못했습니다. 문서를 올렸는지, 검색 분야가 맞는지 확인해 주세요."}
        yield {"type": "done", "engine": "no_results"}
        return

    # 근거는 첫 토큰을 기다리지 않고 먼저 내려보낸다.
    yield {"type": "sources", "engine": "ai", "sources": sources}

    streamed_any = False
    try:
        for chunk in _stream_claude(question, hits, scope_label):
            streamed_any = True
            yield {"type": "delta", "text": chunk}
        yield {"type": "done", "engine": "ai"}
    except Exception as ex:
        print("[chat] 스트리밍 미사용(%s: %s) → 근거만 반환" % (type(ex).__name__, ex))
        if streamed_any:
            # 이미 일부가 나갔으면 전체 fallback로 덮지 않고 끊김만 알린다.
            yield {"type": "delta", "text": "\n\n⚠️ 답변 생성이 중간에 중단되었습니다."}
            yield {"type": "done", "engine": "error"}
        else:
            joined = "\n\n".join("[%d] (%s) %s" % (h["n"], h["source"], h["preview"]) for h in hits)
            yield {"type": "delta",
                   "text": "AI 답변 생성은 지금 사용할 수 없어, 질문과 가장 관련 있는 문서 근거만 보여드립니다:\n\n" + joined}
            yield {"type": "done", "engine": "fallback"}


def answer_question(
    question: str,
    category_l1: str | None = None,
    top_k: int = config.TOP_K_DEFAULT,
    scope_label: str | None = None,
) -> dict:
    """질문 → {engine, answer, sources}. scope_label은 답변 톤을 위한 분야명(예: '회계')."""
    hits = _retrieve(question, category_l1, top_k)
    sources = [{k: h[k] for k in ("n", "source", "chunk_index", "category_l1", "preview", "distance")}
               for h in hits]

    if not hits:
        return {"engine": "no_results",
                "answer": "관련된 내용을 지식 문서에서 찾지 못했습니다. 문서를 올렸는지, 검색 분야가 맞는지 확인해 주세요.",
                "sources": []}

    try:
        answer = _call_claude(question, hits, scope_label)
        return {"engine": "ai", "answer": answer, "sources": sources}
    except Exception as ex:
        print("[chat] LLM 미사용(%s: %s) → 근거만 반환" % (type(ex).__name__, ex))
        # 답변 생성은 실패했지만, 찾은 근거는 사용자에게 그대로 보여준다.
        joined = "\n\n".join("[%d] (%s) %s" % (h["n"], h["source"], h["preview"]) for h in hits)
        return {"engine": "fallback",
                "answer": "AI 답변 생성은 지금 사용할 수 없어, 질문과 가장 관련 있는 문서 근거만 보여드립니다:\n\n" + joined,
                "sources": sources, "reason": str(ex)}
