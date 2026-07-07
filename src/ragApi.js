// RAG 백엔드(FastAPI, backend/rag/api.py)와 통신하는 함수 모음.
// vite.config.js의 server.proxy['/api/rag']를 통해 127.0.0.1:8000으로 전달된다.
async function req(path, options = {}) {
  const res = await fetch(path, options)
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
