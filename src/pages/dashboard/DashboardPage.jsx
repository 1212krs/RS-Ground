import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Menu, NotebookPen, Plus } from 'lucide-react'
import { calendarEvents, initialTodos } from '../../data.js'
import { uid } from '../../utils.js'
import { useStoredState } from '../../hooks/useStoredState.js'
import './DashboardPage.css'

const CALENDAR_DATES = [29, 30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 1, 2, 3, 4, 5, 6, 7, 8, 9]

export default function DashboardPage() {
  const { notify, onMenu } = useOutletContext()
  const navigate = useNavigate()
  const [todos, setTodos] = useStoredState('ground-todos', initialTodos)
  const [memos, setMemos] = useStoredState('ground-memos', [{ id: 'memo-1', content: 'HWPX 템플릿은 사업계획서와 결과보고서부터 검증하기', date: '오늘 18:24' }])
  const [quickMemo, setQuickMemo] = useState('')

  const toggleTodo = (id) => setTodos((items) => items.map((todo) => todo.id === id ? { ...todo, done: !todo.done } : todo))
  const addMemo = () => {
    if (!quickMemo.trim()) return
    setMemos((items) => [{ id: uid('memo'), content: quickMemo.trim(), date: '방금 전' }, ...items])
    setQuickMemo('')
    notify('메모를 저장했습니다.')
  }

  return (
    <div className="oa">
      <header className="oa-head">
        <button className="oa-icon mobile-only" onClick={onMenu} aria-label="메뉴"><Menu size={20} /></button>
        <h1>홈</h1>
      </header>

      <div className="oa-grid">
        <section className="oa-card oa-cal">
          <div className="oa-cal-head">
            <h2>일정</h2>
            <div className="oa-month"><button aria-label="이전 달"><ArrowLeft size={16} /></button><strong>2026년 6월</strong><button aria-label="다음 달"><ArrowRight size={16} /></button></div>
          </div>
          <div className="oa-week">{['일', '월', '화', '수', '목', '금', '토'].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="oa-days">
            {CALENDAR_DATES.map((date, index) => {
              const event = calendarEvents.find((item) => item.date === date && (!!item.nextMonth === (index > 1)))
              return <button key={`${date}-${index}`} className={`oa-day ${index === 1 ? 'today' : ''} ${index === 0 || index > 31 ? 'muted' : ''}`}><span>{date}</span>{event && <small className={event.tone}>{event.label}</small>}</button>
            })}
          </div>
        </section>

        <aside className="oa-col-side">
          <section className="oa-card oa-feed">
            <div className="oa-feed-head"><h2>할 일</h2><button className="oa-icon" onClick={() => navigate('/todos')} aria-label="할 일 추가"><Plus size={16} /></button></div>
            <div className="oa-todos">
              {todos.map((todo) => (
                <div key={todo.id} className={`oa-todo ${todo.done ? 'done' : ''}`}>
                  <button className="oa-check" onClick={() => toggleTodo(todo.id)}>{todo.done && <Check size={13} />}</button>
                  <div><strong>{todo.title}</strong><span>{todo.project}</span></div>
                  <small className={todo.priority}>{todo.due}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="oa-card oa-memo">
            <div className="oa-feed-head"><h2>메모</h2><NotebookPen size={16} /></div>
            <textarea value={quickMemo} onChange={(e) => setQuickMemo(e.target.value)} placeholder="잊기 전에 적어두세요…" maxLength={300} />
            <div className="oa-memo-act"><span>{quickMemo.length}/300</span><button onClick={addMemo}>저장 <ArrowRight size={14} /></button></div>
            <div className="oa-memo-list">
              {memos.map((memo) => <div key={memo.id} className="oa-memo-item"><span>{memo.date}</span><p>{memo.content}</p></div>)}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
