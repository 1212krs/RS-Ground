import { useRef } from 'react'
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom'
import { CalendarDays, CheckCircle2, Menu, NotebookPen } from 'lucide-react'
import { initialMemos, seedEvents } from '../../data.js'
import { useServerState } from '../../hooks/useServerState.js'
import CalendarPanel from './CalendarPanel.jsx'
import TodosPanel from './TodosPanel.jsx'
import MemosPanel from './MemosPanel.jsx'
import './WorkspacePage.css'

// 홈(/)과 /calendar·/todos·/memos 경로가 모두 이 워크스페이스를 렌더링하고,
// 경로가 활성 패널을 결정한다. 탭 전환은 navigate로 URL을 바꿔 사이드바·새로고침·
// 뒤로가기가 자연스럽게 동작하게 한다(PRD 3.1).
const PANELS = [
  { id: 'calendar', label: '일정', path: '/calendar', icon: CalendarDays },
  { id: 'todos', label: '할 일', path: '/todos', icon: CheckCircle2 },
  { id: 'memos', label: '메모', path: '/memos', icon: NotebookPen },
]

const pathToIndex = (pathname) => {
  const i = PANELS.findIndex((p) => p.path === pathname)
  return i === -1 ? 0 : i // '/' 등 미매칭은 기본 패널(일정)
}

const SWIPE_THRESHOLD = 60 // px

export default function WorkspacePage() {
  const { notify, onMenu } = useOutletContext()
  const navigate = useNavigate()
  const location = useLocation()
  const touch = useRef(null)

  // 서버(SQLite)에 저장. 기존 localStorage 데이터('ground-*')는 최초 1회 서버로 옮긴다.
  const [events, setEvents] = useServerState('events', seedEvents, 'ground-events')
  const [memos, setMemos] = useServerState('memos', initialMemos, 'ground-memos')

  const activeIndex = pathToIndex(location.pathname)

  const goTo = (index) => {
    const clamped = Math.max(0, Math.min(PANELS.length - 1, index))
    if (clamped !== activeIndex) navigate(PANELS[clamped].path)
  }

  const onTouchStart = (e) => { touch.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touch.current == null) return
    const delta = e.changedTouches[0].clientX - touch.current
    touch.current = null
    if (Math.abs(delta) < SWIPE_THRESHOLD) return
    goTo(activeIndex + (delta < 0 ? 1 : -1)) // 왼쪽으로 밀면 다음 패널
  }

  return (
    <div className="ws">
      <header className="ws-head">
        <button className="ws-menu mobile-only" onClick={onMenu} aria-label="메뉴"><Menu size={20} /></button>
        <nav className="ws-tabs" role="tablist">
          {PANELS.map((panel, index) => {
            const Icon = panel.icon
            return (
              <button
                key={panel.id}
                role="tab"
                aria-selected={index === activeIndex}
                className={`ws-tab ${index === activeIndex ? 'active' : ''}`}
                onClick={() => goTo(index)}
              >
                <Icon size={16} strokeWidth={2} /><span>{panel.label}</span>
              </button>
            )
          })}
        </nav>
      </header>

      <div className="ws-viewport" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="ws-track" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
          <section className="ws-slide" aria-hidden={activeIndex !== 0}>
            <CalendarPanel events={events} setEvents={setEvents} notify={notify} />
          </section>
          <section className="ws-slide" aria-hidden={activeIndex !== 1}>
            <TodosPanel notify={notify} />
          </section>
          <section className="ws-slide" aria-hidden={activeIndex !== 2}>
            <MemosPanel memos={memos} setMemos={setMemos} notify={notify} />
          </section>
        </div>
      </div>
    </div>
  )
}
