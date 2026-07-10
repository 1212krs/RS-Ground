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

// 근거 기반 질의응답. categoryL1을 주면 그 분야 문서만 검색(예: '회계'=회계챗), 없으면 전체(AI챗).
export const chat = ({ question, categoryL1 = '', scopeLabel = '', topK } = {}) => {
  const body = { question }
  if (categoryL1) body.category_l1 = categoryL1
  if (scopeLabel) body.scope_label = scopeLabel
  if (topK) body.top_k = topK
  return req('/api/rag/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
