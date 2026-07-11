// 캘린더 날짜 계산 유틸. 외부 라이브러리 없이 네이티브 Date로만 처리한다(PRD 5.2).
// 핵심 원칙: 저장·비교에 쓰는 값은 항상 'YYYY-MM-DD' 문자열이고, Date 객체는
// 숫자 구성요소(year, month, day)로만 만들어 타임존 파싱 문제를 피한다.

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 일정 색상 태그. 기존 대시보드 팔레트를 그대로 재사용한다.
export const TONES = [
  { id: 'blue', label: '파랑' },
  { id: 'lime', label: '초록' },
  { id: 'coral', label: '주황' },
  { id: 'violet', label: '보라' },
]

// 프리셋(TONES) 외에 사용자가 컬러 피커로 직접 고른 색은 '#rrggbb' 문자열로 저장된다.
export const isCustomTone = (tone) => /^#[0-9a-f]{6}$/i.test(tone || '')

const pad2 = (n) => String(n).padStart(2, '0')

// month는 0-based(0=1월). 'YYYY-MM-DD' 문자열을 만든다.
export const toDateStr = (year, month, day) => `${year}-${pad2(month + 1)}-${pad2(day)}`

export const todayStr = () => {
  const d = new Date()
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate())
}

export const monthLabel = (year, month) => `${year}년 ${month + 1}월`

// year/month(0-based)를 기준으로 항상 6주(42칸) 그리드를 만든다.
// 행 수가 달마다 바뀌어 레이아웃이 출렁이는 것을 막기 위함(PRD 3.2).
// Date에 음수/초과 일자를 넣으면 자동으로 이웃 달·연도로 정규화되므로
// 월말·연말 경계가 자연스럽게 처리된다.
export function buildMonthGrid(year, month) {
  const startWeekday = new Date(year, month, 1).getDay() // 0=일요일
  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, 1 - startWeekday + i)
    cells.push({
      dateStr: toDateStr(d.getFullYear(), d.getMonth(), d.getDate()),
      day: d.getDate(),
      inMonth: d.getMonth() === month,
    })
  }
  return cells
}

// 현재 보고 있는 달에서 한 칸 이동한 {year, month}를 반환(연도 경계 포함).
export function shiftMonth(year, month, delta) {
  const d = new Date(year, month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

// 같은 날짜의 일정을 시간순으로 정렬. 시간이 없는(종일) 일정이 먼저 온다.
export function sortEventsByTime(events) {
  return [...events].sort((a, b) => {
    if (!a.startTime && !b.startTime) return 0
    if (!a.startTime) return -1
    if (!b.startTime) return 1
    return a.startTime.localeCompare(b.startTime)
  })
}

// 일정 배열을 날짜별로 묶은 Map<dateStr, event[]>을 만든다(각 날짜는 시간순 정렬).
export function groupEventsByDate(events) {
  const map = new Map()
  for (const event of events) {
    if (!map.has(event.date)) map.set(event.date, [])
    map.get(event.date).push(event)
  }
  for (const [key, list] of map) map.set(key, sortEventsByTime(list))
  return map
}
