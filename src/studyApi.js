import { API_BASE, authHeaders } from './apiBase'

// 공부 노트 백엔드(backend/study/api.py)와 통신하는 함수 모음 — AI 미사용.
// 로그인 출입증(토큰)을 authHeaders()로 실어 보낸다(백엔드가 /api/study를 토큰으로 보호).
async function req(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.error || `요청 실패 (HTTP ${res.status})`)
  return data
}

// 목록 또는 검색: q가 있으면 키워드 검색. → { notes: [...], query? }
export const listStudies = (q = '') =>
  req(`/api/study${q ? `?q=${encodeURIComponent(q)}` : ''}`)

// 분류(카테고리) 목록: { subjects: [{ id, name, count }] } — 빈 분류도 포함
export const listSubjects = () => req('/api/study/subjects')

// 분류 생성 → { id, name }
export const createSubject = (name) =>
  req('/api/study/subjects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

// 분류 삭제(노트가 남아있으면 409 오류)
export const removeSubject = (id) => req(`/api/study/subjects/${id}`, { method: 'DELETE' })

// 노트 1건 상세(본문 + 첨부 목록)
export const getStudy = (id) => req(`/api/study/${id}`)

// 노트 생성 → { id, created_at, updated_at }
export const createStudy = ({ title, subject = '', tags = [], content = '' }) =>
  req('/api/study', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, subject, tags, content }),
  })

// 노트 수정
export const updateStudy = (id, { title, subject = '', tags = [], content = '' }) =>
  req(`/api/study/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, subject, tags, content }),
  })

// 노트 삭제(첨부 포함)
export const removeStudy = (id) => req(`/api/study/${id}`, { method: 'DELETE' })

// 파일 첨부 → { id, filename, size, created_at }
// FormData 요청은 Content-Type을 수동 지정하면 boundary가 빠져 실패하므로 지정하지 않는다.
export const uploadStudyFile = (noteId, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return req(`/api/study/${noteId}/files`, { method: 'POST', body: fd })
}

// 첨부 삭제
export const removeStudyFile = (fileId) => req(`/api/study/files/${fileId}`, { method: 'DELETE' })

// 첨부 원본 다운로드. 토큰-헤더 인증이라 평범한 링크로는 안 되고, fetch로 받아 blob으로 저장한다.
export const downloadStudyFile = async (fileId, filename) => {
  const res = await fetch(`${API_BASE}/api/study/files/${fileId}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`다운로드 실패 (HTTP ${res.status})`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
