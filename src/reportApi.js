import { API_BASE, authHeaders } from './apiBase'

// 보고서 백엔드(FastAPI, backend/report/api.py)와 통신하는 함수 모음.
// vite.config.js의 server.proxy['/api/report']를 통해 127.0.0.1:8000으로 전달된다.
async function req(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.error || `요청 실패 (HTTP ${res.status})`)
  return data
}

// 서식 목록: [{ id, name, sections: [목차...], has_guide }]
export const listTemplates = () => req('/api/report/templates')

// AI(Claude API 키) 연결 상태: { ai_ready, key_source }
export const getReportStatus = () => req('/api/report/status')

// 제목·내용·참고파일 → AI 본문 초안 생성.
// 응답: { engine: 'ai'|'fallback', doc, reason, files_used }
export const composeReport = ({ title, brief, template, includeTable, files = [] }) => {
  const formData = new FormData()
  formData.append('title', title)
  formData.append('brief', brief)
  formData.append('template', template)
  formData.append('include_table', includeTable)
  files.forEach((file) => formData.append('files', file))
  return req('/api/report/compose', { method: 'POST', body: formData })
}

// ── 서식 자동 등록 ──────────────────────────────────────────────
// 백엔드는 실패 사유를 { detail: { message, errors[], warnings[] } } 로 돌려준다.
// 그냥 Error 로 만들면 "[object Object]" 가 되므로 목록을 살려서 던진다.
class TemplateError extends Error {
  constructor(detail, status) {
    const d = typeof detail === 'object' && detail ? detail : {}
    super(d.message || (typeof detail === 'string' ? detail : `요청 실패 (HTTP ${status})`))
    this.errors = d.errors || (typeof detail === 'string' ? [detail] : [])
    this.warnings = d.warnings || []
    this.status = status
  }
}

async function templateReq(path, options) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new TemplateError(data.detail, res.status)
  return data
}

// 샘플 hwpx 검사만 (저장하지 않음). 응답: { ok, sections, features, steps, warnings }
export const checkTemplateFile = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return templateReq('/api/report/templates/check', { method: 'POST', body: formData })
}

// 샘플 hwpx → 서식으로 변환하여 등록. 이미 있으면 status 409 로 실패한다.
export const createTemplate = ({ file, name, guide = '', overwrite = false }) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('name', name)
  formData.append('guide', guide)
  formData.append('overwrite', overwrite)
  return templateReq('/api/report/templates', { method: 'POST', body: formData })
}

// 등록된 서식 삭제 (hwpx + 작성지침 md)
export const deleteTemplate = (id) =>
  templateReq(`/api/report/templates/${encodeURIComponent(id)}`, { method: 'DELETE' })

// 편집 완료된 내용 → hwpx 파일(Blob) 다운로드.
export const generateReport = async (payload) => {
  const res = await fetch(API_BASE + '/api/report/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || data.error || `생성 실패 (HTTP ${res.status})`)
  }
  return res.blob()
}
