import { API_BASE, authHeaders } from './apiBase'

// '할 일' 칸반 보드 백엔드(backend/todo/api.py)와 통신하는 함수 모음.
// 로그인 출입증(토큰)을 authHeaders()로 실어 보낸다(백엔드가 /api/todo를 토큰으로 보호).
async function req(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.error || `요청 실패 (HTTP ${res.status})`)
  return data
}

// 보드 전체 티켓 목록: { tickets: [...] } (Done은 완료 후 24시간 이내만 포함)
export const listTickets = () => req('/api/todo/tickets')

// 티켓 생성: { title, description?, priority?, planned_start_date?, planned_end_date? }
export const createTicket = (ticket) =>
  req('/api/todo/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticket),
  })

// 티켓 부분 수정 (title/description/priority/planned_start_date/planned_end_date)
export const updateTicket = (id, fields) =>
  req(`/api/todo/tickets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })

// 드래그앤드롭: 컬럼(status) 이동 + 컬럼 내 순서(index) 지정. 시작일/종료일은 서버가 자동 관리.
export const moveTicket = (id, status, index) =>
  req(`/api/todo/tickets/${id}/move`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, index }),
  })

// 티켓 삭제
export const deleteTicket = (id) => req(`/api/todo/tickets/${id}`, { method: 'DELETE' })
