import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Plus, Trash2, X } from 'lucide-react'
import { uid } from '../../utils.js'
import {
  WEEKDAYS, TONES, buildMonthGrid, shiftMonth, monthLabel, todayStr, groupEventsByDate, isCustomTone,
} from './calendarUtils.js'

const MAX_VISIBLE = 3 // 셀 안에 최대 몇 개까지 일정을 보여줄지

// 날짜 문자열('YYYY-MM-DD')을 '7월 3일 (금)' 형태로 표시.
function formatDateHeading(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()]
  return `${m}월 ${d}일 (${weekday})`
}

const emptyDraft = (date) => ({ id: null, title: '', date, startTime: '', endTime: '', tone: 'blue', memo: '' })

export default function CalendarPanel({ events, setEvents, notify }) {
  const today = todayStr()
  const [view, setView] = useState(() => {
    const [y, m] = today.split('-').map(Number)
    return { year: y, month: m - 1 }
  })
  const [selectedDate, setSelectedDate] = useState(null)
  const [draft, setDraft] = useState(null) // 편집 중인 일정(신규 또는 기존)

  const cells = useMemo(() => buildMonthGrid(view.year, view.month), [view])
  const byDate = useMemo(() => groupEventsByDate(events), [events])

  const goMonth = (delta) => setView((v) => shiftMonth(v.year, v.month, delta))
  const goToday = () => {
    const [y, m] = today.split('-').map(Number)
    setView({ year: y, month: m - 1 })
  }

  const openDate = (dateStr) => {
    setSelectedDate(dateStr)
    setDraft(null)
  }
  const closeEditor = () => {
    setSelectedDate(null)
    setDraft(null)
  }

  const startNew = (dateStr) => setDraft(emptyDraft(dateStr))
  const startEdit = (event) => setDraft({
    ...event,
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    memo: event.memo || '',
  })

  const saveDraft = () => {
    const title = draft.title.trim()
    if (!title) { notify('일정 제목을 입력하세요.', 'error'); return }
    const now = new Date().toISOString()
    const payload = {
      title,
      date: draft.date,
      startTime: draft.startTime || null,
      endTime: draft.startTime ? (draft.endTime || null) : null,
      tone: draft.tone,
      memo: draft.memo.trim(),
    }
    if (draft.id) {
      setEvents((list) => list.map((e) => e.id === draft.id ? { ...e, ...payload, updatedAt: now } : e))
      notify('일정을 수정했습니다.')
    } else {
      setEvents((list) => [...list, { id: uid('event'), ...payload, createdAt: now, updatedAt: now }])
      notify('일정을 추가했습니다.')
    }
    setDraft(null)
  }

  const deleteEvent = (id) => {
    setEvents((list) => list.filter((e) => e.id !== id))
    setDraft(null)
    notify('일정을 삭제했습니다.')
  }

  const selectedEvents = selectedDate ? (byDate.get(selectedDate) || []) : []

  return (
    <div className={`cal ${selectedDate ? 'editor-open' : ''}`}>
      <div className="cal-main">
        <div className="cal-toolbar">
          <button className="cal-today" onClick={goToday}>오늘</button>
          <div className="cal-nav">
            <button onClick={() => goMonth(-1)} aria-label="이전 달"><ArrowLeft size={16} /></button>
            <strong>{monthLabel(view.year, view.month)}</strong>
            <button onClick={() => goMonth(1)} aria-label="다음 달"><ArrowRight size={16} /></button>
          </div>
        </div>

        <div className="cal-weekrow">
          {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
        </div>

        <div className="cal-grid">
          {cells.map((cell) => {
            const dayEvents = byDate.get(cell.dateStr) || []
            const isToday = cell.dateStr === today
            const isSelected = cell.dateStr === selectedDate
            return (
              <button
                key={cell.dateStr}
                className={`cal-cell ${cell.inMonth ? '' : 'muted'} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => openDate(cell.dateStr)}
              >
                <span className="cal-cell-day">{cell.day}</span>
                <span className="cal-cell-events">
                  {dayEvents.slice(0, MAX_VISIBLE).map((event) => (
                    <span
                      key={event.id}
                      className={`cal-chip ${isCustomTone(event.tone) ? '' : event.tone}`}
                      style={isCustomTone(event.tone) ? { color: event.tone } : undefined}
                    >
                      {event.startTime && <em>{event.startTime}</em>}{event.title}
                    </span>
                  ))}
                  {dayEvents.length > MAX_VISIBLE && (
                    <span className="cal-more">+{dayEvents.length - MAX_VISIBLE}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {selectedDate && (
        <aside className="cal-editor">
          <div className="cal-editor-head">
            <h3>{formatDateHeading(selectedDate)}</h3>
            <button className="cal-icon" onClick={closeEditor} aria-label="닫기"><X size={18} /></button>
          </div>

          {!draft && (
            <div className="cal-editor-body">
              {selectedEvents.length === 0 && <p className="cal-empty">이 날짜에 등록된 일정이 없습니다.</p>}
              <div className="cal-daylist">
                {selectedEvents.map((event) => (
                  <button key={event.id} className="cal-dayitem" onClick={() => startEdit(event)}>
                    <span
                      className={`cal-dot ${isCustomTone(event.tone) ? '' : event.tone}`}
                      style={isCustomTone(event.tone) ? { background: event.tone } : undefined}
                    />
                    <span className="cal-dayitem-body">
                      <strong>{event.title}</strong>
                      {event.startTime && <small>{event.startTime}{event.endTime ? `–${event.endTime}` : ''}</small>}
                    </span>
                  </button>
                ))}
              </div>
              <button className="cal-add" onClick={() => startNew(selectedDate)}>
                <Plus size={16} /> 새 일정
              </button>
            </div>
          )}

          {draft && (
            <form className="cal-form" onSubmit={(e) => { e.preventDefault(); saveDraft() }}>
              <label className="cal-field">
                <span>제목</span>
                <input
                  autoFocus
                  value={draft.title}
                  maxLength={100}
                  placeholder="일정 제목"
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </label>
              <div className="cal-field-row">
                <label className="cal-field">
                  <span>시작</span>
                  <input type="time" value={draft.startTime} onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))} />
                </label>
                <label className="cal-field">
                  <span>종료</span>
                  <input type="time" value={draft.endTime} disabled={!draft.startTime} onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))} />
                </label>
              </div>
              <div className="cal-field">
                <span>색상</span>
                <div className="cal-tones">
                  {TONES.map((tone) => (
                    <button
                      type="button"
                      key={tone.id}
                      className={`cal-tone ${tone.id} ${draft.tone === tone.id ? 'on' : ''}`}
                      onClick={() => setDraft((d) => ({ ...d, tone: tone.id }))}
                      aria-label={tone.label}
                      aria-pressed={draft.tone === tone.id}
                    />
                  ))}
                  <label
                    className={`cal-tone cal-tone-custom ${isCustomTone(draft.tone) ? 'on' : ''}`}
                    style={isCustomTone(draft.tone) ? { background: draft.tone } : undefined}
                    title="다른 색상 선택"
                  >
                    <input
                      type="color"
                      value={isCustomTone(draft.tone) ? draft.tone : '#888888'}
                      onChange={(e) => setDraft((d) => ({ ...d, tone: e.target.value }))}
                      aria-label="다른 색상 선택"
                    />
                  </label>
                </div>
              </div>
              <label className="cal-field">
                <span>메모</span>
                <textarea value={draft.memo} maxLength={500} placeholder="상세 내용(선택)" onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))} />
              </label>
              <div className="cal-form-act">
                {draft.id && (
                  <button type="button" className="cal-del" onClick={() => deleteEvent(draft.id)}>
                    <Trash2 size={15} /> 삭제
                  </button>
                )}
                <div className="cal-form-act-right">
                  <button type="button" className="cal-cancel" onClick={() => setDraft(null)}>취소</button>
                  <button type="submit" className="cal-save">저장</button>
                </div>
              </div>
            </form>
          )}
        </aside>
      )}
    </div>
  )
}
