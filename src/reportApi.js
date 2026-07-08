// 보고서 백엔드(FastAPI, backend/report/api.py)와 통신하는 함수 모음.
// vite.config.js의 server.proxy['/api/report']를 통해 127.0.0.1:8000으로 전달된다.
async function req(path, options = {}) {
  const res = await fetch(path, options)
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

// 편집 완료된 내용 → hwpx 파일(Blob) 다운로드.
export const generateReport = async (payload) => {
  const res = await fetch('/api/report/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || data.error || `생성 실패 (HTTP ${res.status})`)
  }
  return res.blob()
}
