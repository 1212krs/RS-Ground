import { describe, expect, it } from 'vitest'
import { buildMonthGrid, shiftMonth, sortEventsByTime, groupEventsByDate, toDateStr } from './calendarUtils.js'

describe('calendarUtils', () => {
  it('buildMonthGrid는 항상 42칸(6주)을 만든다', () => {
    expect(buildMonthGrid(2026, 6)).toHaveLength(42) // 2026년 7월
    expect(buildMonthGrid(2026, 1)).toHaveLength(42) // 2026년 2월(28일)
  })

  it('2026년 7월 그리드는 6/28(일)에서 시작한다', () => {
    const cells = buildMonthGrid(2026, 6)
    expect(cells[0].dateStr).toBe('2026-06-28')
    expect(cells[0].inMonth).toBe(false)
    // 7월 1일은 4번째 칸(수요일)
    expect(cells[3].dateStr).toBe('2026-07-01')
    expect(cells[3].inMonth).toBe(true)
  })

  it('윤년 2월(2024)의 29일을 이달 안 날짜로 포함한다', () => {
    const cells = buildMonthGrid(2024, 1)
    const feb29 = cells.find((c) => c.dateStr === '2024-02-29')
    expect(feb29).toBeDefined()
    expect(feb29.inMonth).toBe(true)
    // 평년 2027년 2월엔 29일이 없다
    const cells2027 = buildMonthGrid(2027, 1)
    expect(cells2027.find((c) => c.dateStr === '2027-02-29' && c.inMonth)).toBeUndefined()
  })

  it('shiftMonth를 12번 하면 연도가 넘어간다', () => {
    let cur = { year: 2026, month: 6 }
    for (let i = 0; i < 12; i++) cur = shiftMonth(cur.year, cur.month, 1)
    expect(cur).toEqual({ year: 2027, month: 6 })
  })

  it('shiftMonth는 12월에서 다음 달로 가면 1월/다음 해가 된다', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 })
  })

  it('toDateStr는 0-based month를 1-based로 변환하고 2자리로 채운다', () => {
    expect(toDateStr(2026, 0, 5)).toBe('2026-01-05')
    expect(toDateStr(2026, 11, 31)).toBe('2026-12-31')
  })

  it('sortEventsByTime은 종일 일정을 먼저, 나머지는 시간순으로 둔다', () => {
    const events = [
      { id: 'a', startTime: '14:00' },
      { id: 'b', startTime: null },
      { id: 'c', startTime: '09:30' },
    ]
    expect(sortEventsByTime(events).map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('groupEventsByDate는 날짜별로 묶고 시간순 정렬한다', () => {
    const events = [
      { id: 'a', date: '2026-07-01', startTime: '14:00' },
      { id: 'b', date: '2026-07-01', startTime: '09:00' },
      { id: 'c', date: '2026-07-02', startTime: null },
    ]
    const map = groupEventsByDate(events)
    expect(map.get('2026-07-01').map((e) => e.id)).toEqual(['b', 'a'])
    expect(map.get('2026-07-02').map((e) => e.id)).toEqual(['c'])
  })
})
