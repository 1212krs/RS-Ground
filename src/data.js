export const initialTodos = [
  { id: 1, title: 'AI 업무비서 중간보고 검토', project: 'AI 업무비서', due: '오늘', done: false, priority: 'high' },
  { id: 2, title: '번역 평가 문장 200개 정리', project: 'AI 다국어 번역', due: '7월 2일', done: false, priority: 'normal' },
  { id: 3, title: '2분기 예산 집행 증빙 확인', project: 'AI365', due: '7월 4일', done: false, priority: 'normal' },
  { id: 4, title: '보안 지침 개정본 공유', project: '공통 업무', due: '완료', done: true, priority: 'normal' },
]

export const calendarEvents = [
  { date: 30, label: 'MVP 범위 확정', tone: 'lime' },
  { date: 1, label: 'AI365 주간회의', tone: 'blue', nextMonth: true },
  { date: 3, label: '중간보고 제출', tone: 'coral', nextMonth: true },
  { date: 7, label: '번역 평가', tone: 'violet', nextMonth: true },
]
