export const initialMemos = [
  { id: 'memo-1', content: 'HWPX 템플릿은 사업계획서와 결과보고서부터 검증하기', date: '오늘 18:24' },
]

// 캘린더 초기 시드 일정. 사용자가 처음 열었을 때 빈 화면 대신 예시를 보여준다.
// 날짜는 타임존 문제를 피하려고 'YYYY-MM-DD' 문자열로 저장한다(PRD 4.1 참고).
export const seedEvents = [
  { id: 'seed-1', title: 'MVP 범위 확정', date: '2026-06-30', startTime: null, endTime: null, tone: 'lime', memo: '', createdAt: '2026-06-25T00:00:00.000Z', updatedAt: '2026-06-25T00:00:00.000Z' },
  { id: 'seed-2', title: 'AI365 주간회의', date: '2026-07-01', startTime: '10:00', endTime: '11:00', tone: 'blue', memo: '', createdAt: '2026-06-25T00:00:00.000Z', updatedAt: '2026-06-25T00:00:00.000Z' },
  { id: 'seed-3', title: '중간보고 제출', date: '2026-07-03', startTime: null, endTime: null, tone: 'coral', memo: '', createdAt: '2026-06-25T00:00:00.000Z', updatedAt: '2026-06-25T00:00:00.000Z' },
  { id: 'seed-4', title: '번역 평가', date: '2026-07-07', startTime: '14:00', endTime: null, tone: 'violet', memo: '', createdAt: '2026-06-25T00:00:00.000Z', updatedAt: '2026-06-25T00:00:00.000Z' },
]
