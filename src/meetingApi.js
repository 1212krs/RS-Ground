import { API_BASE, authHeaders } from './apiBase'

// 회의록 정리 백엔드(backend/meeting/api.py)와 통신하는 함수 모음.
// 로그인 출입증(토큰)을 authHeaders()로 실어 보낸다(백엔드가 /api/meeting을 토큰으로 보호).
async function req(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.error || `요청 실패 (HTTP ${res.status})`)
  return data
}

// 회의 전문 분석: { title?, transcript } → { id, created_at, analysis }
export const analyzeMeeting = ({ title = '', transcript }) =>
  req('/api/meeting/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, transcript }),
  })

// 저장된 회의 목록: { meetings: [{ id, title, preview, created_at }] }
export const listMeetings = () => req('/api/meeting')

// 회의 1건 상세: { id, title, transcript, analysis, created_at }
export const getMeeting = (id) => req(`/api/meeting/${id}`)

// 회의 삭제
export const removeMeeting = (id) => req(`/api/meeting/${id}`, { method: 'DELETE' })

// 워크스페이스 저장소(/api/store/{key})에 항목들을 이어붙인다(기존 배열 읽어 합쳐 저장).
// key: 'todos'(할 일) | 'events'(일정). 액션 아이템·일정 후보를 홈으로 보낼 때 사용.
export const appendToStore = async (key, newItems) => {
  const cur = await req(`/api/store/${key}`)          // { data: [...] | null }
  const arr = Array.isArray(cur.data) ? cur.data : []
  const merged = [...arr, ...newItems]
  await req(`/api/store/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: merged }),
  })
  return merged.length
}
