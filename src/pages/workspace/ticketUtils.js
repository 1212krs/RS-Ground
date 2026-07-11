// 칸반 보드(티켓) 관련 상수·날짜 계산 유틸. calendarUtils.js와 같은 원칙으로,
// 외부 라이브러리 없이 네이티브 Date로만 이번 주 범위를 계산한다.

export const COLUMNS = [
  { id: 'TODO', label: 'TODO', hint: '오늘/이번주 할 일' },
  { id: 'IN_PROGRESS', label: 'In Progress', hint: '지금 하는 중' },
  { id: 'DONE', label: 'Done', hint: '완료된 작업(24시간)' },
]

export const PRIORITIES = [
  { id: 'LOW', label: '낮음' },
  { id: 'MEDIUM', label: '보통' },
  { id: 'HIGH', label: '높음' },
]

export const priorityLabel = (id) => PRIORITIES.find((p) => p.id === id)?.label || id

const pad2 = (n) => String(n).padStart(2, '0')
const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// 이번 주(월요일 시작 ~ 일요일)를 'YYYY-MM-DD' 범위로 반환.
export function thisWeekRange() {
  const now = new Date()
  const day = now.getDay() // 0=일요일
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset)
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
  return { start: toDateStr(monday), end: toDateStr(sunday) }
}

export function isInThisWeek(dateStr) {
  if (!dateStr) return false
  const { start, end } = thisWeekRange()
  return dateStr >= start && dateStr <= end
}

// 'YYYY-MM-DD' → '7월 3일'
export function formatDate(dateStr) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}월 ${Number(d)}일`
}

// ISO 문자열(UTC) → '7월 3일 14:20'
export function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
