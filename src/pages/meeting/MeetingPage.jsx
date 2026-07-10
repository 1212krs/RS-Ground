import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Menu, Sparkles, FileText, Trash2, ChevronLeft, CheckCircle2, CalendarPlus } from 'lucide-react'
import { analyzeMeeting, listMeetings, getMeeting, removeMeeting, appendToStore } from '../../meetingApi.js'
import MindMap from './MindMap.jsx'
import './MeetingPage.css'

const nowIso = () => new Date().toISOString()

export default function MeetingPage() {
  const { notify, onMenu } = useOutletContext()

  const [view, setView] = useState('new')       // 'new' | 'list' | 'result'
  const [backTab, setBackTab] = useState('new')  // result에서 뒤로 갈 곳

  // 새 분석 폼
  const [title, setTitle] = useState('')
  const [transcript, setTranscript] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  // 결과
  const [result, setResult] = useState(null)     // { id, analysis }
  const [selected, setSelected] = useState(null) // 클릭한 노드
  const [checkedActions, setCheckedActions] = useState(() => new Set())
  const [checkedSchedule, setCheckedSchedule] = useState(() => new Set())
  const [addedActions, setAddedActions] = useState(false)
  const [addedSchedule, setAddedSchedule] = useState(false)

  // 지난 회의 목록
  const [meetings, setMeetings] = useState([])
  const [listLoading, setListLoading] = useState(false)

  const loadList = async () => {
    setListLoading(true)
    try {
      const { meetings } = await listMeetings()
      setMeetings(meetings)
    } catch (err) {
      notify(`목록을 불러오지 못했습니다: ${err.message}`, 'error')
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => { if (view === 'list') loadList() }, [view])

  const openResult = (data, from) => {
    setResult(data)
    setSelected(null)
    setCheckedActions(new Set())
    setCheckedSchedule(new Set())
    setAddedActions(false)
    setAddedSchedule(false)
    setBackTab(from)
    setView('result')
  }

  const handleAnalyze = async () => {
    if (!transcript.trim()) { notify('회의 전문을 붙여넣어 주세요.', 'error'); return }
    setAnalyzing(true)
    try {
      const data = await analyzeMeeting({ title, transcript })
      openResult(data, 'new')
      setTitle(''); setTranscript('')
    } catch (err) {
      notify(`분석 실패: ${err.message}`, 'error')
    } finally {
      setAnalyzing(false)
    }
  }

  const openPast = async (id) => {
    try {
      const data = await getMeeting(id)
      openResult({ id: data.id, analysis: data.analysis, transcript: data.transcript, created_at: data.created_at }, 'list')
    } catch (err) {
      notify(`회의를 불러오지 못했습니다: ${err.message}`, 'error')
    }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('이 회의록을 삭제할까요?')) return
    try {
      await removeMeeting(id)
      setMeetings((prev) => prev.filter((m) => m.id !== id))
      notify('삭제했습니다.')
    } catch (err) {
      notify(`삭제 실패: ${err.message}`, 'error')
    }
  }

  const toggle = (set, setter, i) => {
    const next = new Set(set)
    next.has(i) ? next.delete(i) : next.add(i)
    setter(next)
  }

  const addActions = async () => {
    const items = [...checkedActions].map((i) => result.analysis.action_items[i])
    if (!items.length) return
    const todos = items.map((a, k) => ({
      id: `mt-${Date.now()}-${k}`,
      title: `[회의] ${a.text}${a.owner ? ` (담당: ${a.owner})` : ''}`,
      project: '회의',
      due: a.due || '',
      done: false,
      priority: 'normal',
    }))
    try {
      await appendToStore('todos', todos)
      setAddedActions(true)
      notify(`할 일 ${todos.length}개를 홈에 추가했습니다.`)
    } catch (err) {
      notify(`추가 실패: ${err.message}`, 'error')
    }
  }

  const addSchedule = async () => {
    const items = [...checkedSchedule].map((i) => result.analysis.schedule_items[i])
    if (!items.length) return
    const events = items.map((s, k) => ({
      id: `mt-ev-${Date.now()}-${k}`,
      title: s.text,
      date: s.date,
      startTime: s.time || null,
      endTime: null,
      tone: 'coral',
      memo: '회의록에서 추가',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }))
    try {
      await appendToStore('events', events)
      setAddedSchedule(true)
      notify(`일정 ${events.length}개를 홈 캘린더에 추가했습니다.`)
    } catch (err) {
      notify(`추가 실패: ${err.message}`, 'error')
    }
  }

  // 선택한 노드에 대해 보여줄 설명(용어면 미리 만든 설명, 아니면 라벨/안내)
  const selectedInfo = () => {
    if (!selected) return null
    const a = result?.analysis
    if (selected.kind === 'center') return { head: selected.label, body: a?.summary || '회의의 중심 주제입니다.' }
    if (selected.kind === 'branch') return { head: selected.label, body: '이 안건의 세부 항목을 원 밖에서 확인하세요. 용어(진한 테두리)를 누르면 쉬운 설명이 나옵니다.' }
    // leaf
    if (selected.term) {
      const t = (a?.terms || []).find((x) => x.term === selected.label)
      return { head: selected.label, body: t ? t.explanation : '이 용어에 대한 설명이 준비되지 않았습니다.', isTerm: true }
    }
    return { head: selected.label, body: '회의에서 논의된 항목입니다.' }
  }
  const info = selectedInfo()

  return (
    <div className="mt">
      <header className="mt-head">
        <button className="oa-icon mobile-only" onClick={onMenu} aria-label="메뉴"><Menu size={20} /></button>
        <div>
          <h1>회의록 정리</h1>
          <p className="mt-sub">회의 전문을 붙여넣으면 마인드맵·용어 설명·할 일·일정으로 정리합니다.</p>
        </div>
      </header>

      {view !== 'result' && (
        <div className="mt-tabs">
          <button className={view === 'new' ? 'on' : ''} onClick={() => setView('new')}><Sparkles size={14} /> 새 분석</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><FileText size={14} /> 지난 회의</button>
        </div>
      )}

      {/* 새 분석 */}
      {view === 'new' && (
        <section className="mt-card">
          <label className="mt-label">회의 제목 (선택)</label>
          <input className="mt-input" placeholder="예: AI365 7월 1주차 정례회의"
            value={title} onChange={(e) => setTitle(e.target.value)} disabled={analyzing} />
          <label className="mt-label">회의 전문</label>
          <textarea className="mt-textarea" rows={12}
            placeholder="회의 내용 전문을 붙여넣으세요. (음성은 지원하지 않습니다 — 텍스트만)"
            value={transcript} onChange={(e) => setTranscript(e.target.value)} disabled={analyzing} />
          <div className="mt-actions-row">
            <span className="mt-hint">{transcript.length.toLocaleString()}자</span>
            <button className="mt-primary" onClick={handleAnalyze} disabled={analyzing}>
              <Sparkles size={16} /> {analyzing ? '분석 중… (수십 초)' : '분석하기'}
            </button>
          </div>
        </section>
      )}

      {/* 지난 회의 */}
      {view === 'list' && (
        <section className="mt-card">
          {listLoading ? (
            <p className="mt-empty">불러오는 중…</p>
          ) : meetings.length === 0 ? (
            <p className="mt-empty">저장된 회의가 없습니다. '새 분석'에서 첫 회의를 정리해 보세요.</p>
          ) : (
            <ul className="mt-list">
              {meetings.map((m) => (
                <li key={m.id} className="mt-list-item" onClick={() => openPast(m.id)}>
                  <FileText size={16} />
                  <div className="mt-list-info">
                    <strong>{m.title}</strong>
                    {m.preview && <span className="mt-list-preview">{m.preview}</span>}
                    <span className="mt-list-date">{new Date(m.created_at).toLocaleString('ko-KR')}</span>
                  </div>
                  <button className="mt-del" onClick={(e) => handleDelete(m.id, e)} aria-label="삭제"><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 결과 */}
      {view === 'result' && result && (
        <div className="mt-result">
          <button className="mt-back" onClick={() => { setView(backTab); setResult(null) }}>
            <ChevronLeft size={16} /> {backTab === 'list' ? '목록으로' : '새 분석으로'}
          </button>

          <h2 className="mt-title">{result.analysis.title}</h2>
          {result.analysis.summary && <p className="mt-summary">{result.analysis.summary}</p>}

          <div className="mt-mapwrap">
            <div className="mt-mapcanvas">
              <MindMap mindmap={result.analysis.mindmap} selected={selected} onSelect={setSelected} />
            </div>
            <aside className={`mt-panel${info?.isTerm ? ' is-term' : ''}`}>
              {info ? (
                <>
                  <strong>{info.head}</strong>
                  <p>{info.body}</p>
                </>
              ) : (
                <p className="mt-panel-hint">노드를 클릭하면 설명이 여기 나와요. 진한 테두리 = 용어(클릭 시 쉬운 설명).</p>
              )}
            </aside>
          </div>

          {/* 액션 아이템 */}
          {result.analysis.action_items?.length > 0 && (
            <section className="mt-block">
              <h3><CheckCircle2 size={16} /> 액션 아이템</h3>
              <ul className="mt-checklist">
                {result.analysis.action_items.map((a, i) => (
                  <li key={i}>
                    <label>
                      <input type="checkbox" checked={checkedActions.has(i)}
                        disabled={addedActions}
                        onChange={() => toggle(checkedActions, setCheckedActions, i)} />
                      <span>{a.text}
                        {(a.owner || a.due) && <em className="mt-meta">
                          {a.owner && ` · 담당 ${a.owner}`}{a.due && ` · 기한 ${a.due}`}
                        </em>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <button className="mt-secondary" onClick={addActions}
                disabled={addedActions || checkedActions.size === 0}>
                {addedActions ? '할 일에 추가됨' : `선택한 ${checkedActions.size}개를 할 일에 추가`}
              </button>
            </section>
          )}

          {/* 일정 후보 */}
          {result.analysis.schedule_items?.length > 0 && (
            <section className="mt-block">
              <h3><CalendarPlus size={16} /> 일정 후보</h3>
              <ul className="mt-checklist">
                {result.analysis.schedule_items.map((s, i) => (
                  <li key={i}>
                    <label>
                      <input type="checkbox" checked={checkedSchedule.has(i)}
                        disabled={addedSchedule}
                        onChange={() => toggle(checkedSchedule, setCheckedSchedule, i)} />
                      <span>{s.text}<em className="mt-meta"> · {s.date}{s.time && ` ${s.time}`}</em></span>
                    </label>
                  </li>
                ))}
              </ul>
              <button className="mt-secondary" onClick={addSchedule}
                disabled={addedSchedule || checkedSchedule.size === 0}>
                {addedSchedule ? '일정에 추가됨' : `선택한 ${checkedSchedule.size}개를 일정에 추가`}
              </button>
            </section>
          )}

          {/* 원문 */}
          {result.transcript && (
            <details className="mt-raw">
              <summary>회의 전문 보기</summary>
              <pre>{result.transcript}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
