import { API_BASE, authHeaders } from './apiBase'

// RAG 백엔드(FastAPI, backend/rag/api.py)와 통신하는 함수 모음.
// vite.config.js의 server.proxy['/api/rag']를 통해 127.0.0.1:8000으로 전달된다.
async function req(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.error || `요청 실패 (HTTP ${res.status})`)
  return data
}

export const listDocuments = () => req('/api/rag/documents')

export const uploadDocument = (file, { categoryL1 = '', categoryL2 = '', categoryL3 = '' } = {}) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('category_l1', categoryL1)
  formData.append('category_l2', categoryL2)
  formData.append('category_l3', categoryL3)
  return req('/api/rag/documents', { method: 'POST', body: formData })
}

function chatBody({ question, categoryL1 = '', scopeLabel = '', topK } = {}) {
  const body = { question }
  if (categoryL1) body.category_l1 = categoryL1
  if (scopeLabel) body.scope_label = scopeLabel
  if (topK) body.top_k = topK
  return body
}

// 근거 기반 질의응답(일괄). categoryL1을 주면 그 분야 문서만 검색(예: '회계'=회계챗), 없으면 전체(AI챗).
export const chat = (opts = {}) =>
  req('/api/rag/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chatBody(opts)),
  })

// 스트리밍 질의응답. 백엔드가 SSE로 보내는 이벤트를 콜백으로 흘려준다.
//   onSources(sources, engine) : 검색 근거가 도착했을 때(답변 시작 전) 1회
//   onDelta(text)              : 답변 조각이 도착할 때마다
// 반환: 최종 { engine }. 토큰-헤더 인증 때문에 EventSource 대신 fetch 스트림을 쓴다.
export async function chatStream(opts = {}, { onSources, onDelta } = {}) {
  const res = await fetch(API_BASE + '/api/rag/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(chatBody(opts)),
  })
  if (!res.ok || !res.body) {
    let detail = `요청 실패 (HTTP ${res.status})`
    try { const d = await res.json(); detail = d.detail || d.error || detail } catch { /* 본문 없음 */ }
    throw new Error(detail)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let engine = 'ai'

  const handleEvent = (rawEvent) => {
    for (const line of rawEvent.split('\n')) {
      const s = line.trimStart()
      if (!s.startsWith('data:')) continue
      const jsonStr = s.slice(5).trim()
      if (!jsonStr) continue
      let ev
      try { ev = JSON.parse(jsonStr) } catch { continue }
      if (ev.type === 'sources') { engine = ev.engine || engine; onSources?.(ev.sources || [], engine) }
      else if (ev.type === 'delta') onDelta?.(ev.text || '')
      else if (ev.type === 'done') engine = ev.engine || engine
      else if (ev.type === 'error') throw new Error(ev.message || '스트리밍 오류')
    }
  }

  // SSE 이벤트는 빈 줄(\n\n)로 구분된다. 조각 경계를 넘어오는 경우를 위해 버퍼링한다.
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const rawEvent = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      handleEvent(rawEvent)
    }
  }
  if (buf.trim()) handleEvent(buf)   // 마지막에 남은 이벤트 처리
  return { engine }
}
