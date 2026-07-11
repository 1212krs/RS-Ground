import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Plus, Trash2, X } from 'lucide-react'
import { createTicket, deleteTicket, listTickets, moveTicket, updateTicket } from '../../ticketApi.js'
import { COLUMNS, PRIORITIES, formatDate, isInThisWeek, priorityLabel } from './ticketUtils.js'

// '할 일' 탭 — 티켓 기반 칸반 보드. 좌측 Backlog 사이드바 + 우측 3컬럼(TODO/In
// Progress/Done) 보드. 데이터는 backend/todo/api.py(SQLite tickets 테이블)에서
// 온다. 시작일/종료일은 서버가 컬럼 이동에 따라 자동으로 기록하므로 프론트는
// status·index만 보내고 결과를 다시 읽어온다(useServerState의 로컬 배열
// 통짜 저장 방식과 달리, 이 데이터는 전용 백엔드가 진실의 원천이다).

const emptyDraft = () => ({
  id: null, title: '', description: '', priority: 'MEDIUM',
  planned_start_date: '', planned_end_date: '',
})

export default function TodosPanel({ notify }) {
  const [tickets, setTickets] = useState(null) // null = 로딩 중
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'week' | 'overdue'
  const [dropTarget, setDropTarget] = useState(null) // { status, index }

  const refresh = async () => {
    try {
      const data = await listTickets()
      setTickets(data.tickets)
      setLoadError('')
    } catch (err) {
      setLoadError(err.message)
    }
  }

  useEffect(() => { refresh() }, [])

  // 드래그앤드롭 순서 계산의 기준(필터 없는 전체 컬럼별 배열). 필터는 화면 표시에만 적용한다.
  const groupsAll = useMemo(() => {
    const g = { BACKLOG: [], TODO: [], IN_PROGRESS: [], DONE: [] }
    for (const t of tickets || []) g[t.status]?.push(t)
    return g
  }, [tickets])

  const matches = (t) => {
    if (search.trim() && !t.title.toLowerCase().includes(search.trim().toLowerCase())) return false
    if (filter === 'week' && !isInThisWeek(t.planned_end_date)) return false
    if (filter === 'overdue' && !t.is_overdue) return false
    return true
  }

  const groupsShown = useMemo(() => {
    const g = { BACKLOG: [], TODO: [], IN_PROGRESS: [], DONE: [] }
    for (const key of Object.keys(g)) g[key] = groupsAll[key].filter(matches)
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsAll, search, filter])

  const startNew = () => setDraft(emptyDraft())
  const startEdit = (ticket) => setDraft({
    ...ticket,
    description: ticket.description || '',
    planned_start_date: ticket.planned_start_date || '',
    planned_end_date: ticket.planned_end_date || '',
  })
  const closeDraft = () => setDraft(null)

  const save = async () => {
    const title = draft.title.trim()
    if (!title) { notify('제목을 입력하세요.', 'error'); return }
    const payload = {
      title,
      description: draft.description.trim(),
      priority: draft.priority,
      planned_start_date: draft.planned_start_date || null,
      planned_end_date: draft.planned_end_date || null,
    }
    try {
      if (draft.id) {
        await updateTicket(draft.id, payload)
        notify('티켓을 수정했습니다.')
      } else {
        await createTicket(payload)
        notify('티켓을 생성했습니다.')
      }
      setDraft(null)
      await refresh()
    } catch (err) {
      notify(`저장 실패: ${err.message}`, 'error')
    }
  }

  const remove = async (id) => {
    if (!window.confirm('이 티켓을 삭제할까요? 되돌릴 수 없습니다.')) return
    try {
      await deleteTicket(id)
      setDraft(null)
      notify('티켓을 삭제했습니다.')
      await refresh()
    } catch (err) {
      notify(`삭제 실패: ${err.message}`, 'error')
    }
  }

  const handleMove = async (id, status, index) => {
    // 낙관적 업데이트: 컬럼만 즉시 반영해 드래그 반응성을 준다. 실제 순서·시작일/
    // 종료일은 서버가 계산하므로 성공/실패 관계없이 refresh()로 다시 맞춘다.
    setTickets((prev) => (prev || []).map((t) => (t.id === id ? { ...t, status } : t)))
    try {
      await moveTicket(id, status, index)
    } catch (err) {
      notify(`이동 실패: ${err.message}`, 'error')
    } finally {
      await refresh()
    }
  }

  const onDragStart = (e, ticket) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(ticket.id))
  }

  const onCardDragOver = (e, status, index) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget({ status, index })
  }

  const onColumnDragOver = (e, status) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget((cur) => (cur && cur.status === status ? cur : { status, index: groupsAll[status].length }))
  }

  const onDrop = (e, status) => {
    e.preventDefault()
    const id = Number(e.dataTransfer.getData('text/plain'))
    const index = dropTarget && dropTarget.status === status ? dropTarget.index : groupsAll[status].length
    setDropTarget(null)
    if (!id) return
    handleMove(id, status, index)
  }

  if (loadError) {
    return (
      <div className="tk tk-center">
        <p className="tk-error">할 일을 불러오지 못했습니다: {loadError}</p>
        <button className="wsp-primary" onClick={refresh}>다시 시도</button>
      </div>
    )
  }
  if (tickets === null) {
    return <div className="tk tk-center"><p className="tk-loading">불러오는 중...</p></div>
  }

  return (
    <div className="tk">
      <aside className="tk-backlog" onDragOver={(e) => onColumnDragOver(e, 'BACKLOG')} onDrop={(e) => onDrop(e, 'BACKLOG')}>
        <div className="tk-backlog-head">
          <h3>Backlog</h3>
          <span className="wsp-count">{groupsShown.BACKLOG.length}개</span>
        </div>
        <div className="tk-backlog-list">
          {groupsShown.BACKLOG.length === 0 && <p className="tk-empty">대기 중인 할 일이 없습니다.</p>}
          {groupsShown.BACKLOG.map((ticket, idx) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onClick={() => startEdit(ticket)}
              onDragStart={(e) => onDragStart(e, ticket)}
              onDragOver={(e) => onCardDragOver(e, 'BACKLOG', idx)}
            />
          ))}
        </div>
      </aside>

      <div className="tk-board">
        <div className="tk-toolbar">
          <input
            className="tk-search"
            value={search}
            placeholder="티켓 검색"
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="tk-filters">
            <button
              className={`tk-filter ${filter === 'week' ? 'on' : ''}`}
              onClick={() => setFilter((f) => (f === 'week' ? 'all' : 'week'))}
            >이번주 업무</button>
            <button
              className={`tk-filter ${filter === 'overdue' ? 'on' : ''}`}
              onClick={() => setFilter((f) => (f === 'overdue' ? 'all' : 'overdue'))}
            >일정 초과 업무</button>
          </div>
          <button className="wsp-primary tk-new" onClick={startNew}><Plus size={16} /> 새 티켓</button>
        </div>

        <div className="tk-columns">
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              className="tk-column"
              onDragOver={(e) => onColumnDragOver(e, col.id)}
              onDrop={(e) => onDrop(e, col.id)}
            >
              <div className="tk-column-head">
                <h3>{col.label}</h3>
                <span className="wsp-count">{groupsShown[col.id].length}개</span>
              </div>
              <div className="tk-column-body">
                {groupsShown[col.id].length === 0 && <p className="tk-empty">{col.hint}</p>}
                {groupsShown[col.id].map((ticket, idx) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    onClick={() => startEdit(ticket)}
                    onDragStart={(e) => onDragStart(e, ticket)}
                    onDragOver={(e) => onCardDragOver(e, col.id, idx)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {draft && (
        <div className="tk-modal-backdrop" onClick={closeDraft}>
          <form
            className="tk-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); save() }}
          >
            <div className="tk-modal-head">
              <h3>{draft.id ? '티켓 수정' : '새 티켓'}</h3>
              <button type="button" className="cal-icon" onClick={closeDraft} aria-label="닫기"><X size={18} /></button>
            </div>

            <div className="tk-modal-body">
              <label className="cal-field">
                <span>제목</span>
                <input
                  autoFocus
                  value={draft.title}
                  maxLength={200}
                  placeholder="티켓 제목"
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </label>
              <label className="cal-field">
                <span>설명</span>
                <textarea
                  value={draft.description}
                  maxLength={1000}
                  placeholder="상세 내용(선택)"
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </label>
              <div className="cal-field-row">
                <label className="cal-field">
                  <span>우선순위</span>
                  <select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}>
                    {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
                <label className="cal-field">
                  <span>상태</span>
                  <input value={draft.id ? draft.status : 'BACKLOG'} disabled />
                </label>
              </div>
              <div className="cal-field-row">
                <label className="cal-field">
                  <span>계획시작일</span>
                  <input
                    type="date"
                    value={draft.planned_start_date}
                    onChange={(e) => setDraft((d) => ({ ...d, planned_start_date: e.target.value }))}
                  />
                </label>
                <label className="cal-field">
                  <span>계획종료일</span>
                  <input
                    type="date"
                    value={draft.planned_end_date}
                    onChange={(e) => setDraft((d) => ({ ...d, planned_end_date: e.target.value }))}
                  />
                </label>
              </div>
              {draft.id && (
                <div className="cal-field-row">
                  <label className="cal-field">
                    <span>시작일 (자동)</span>
                    <input value={draft.started_at ? formatDate(draft.started_at.slice(0, 10)) : '-'} disabled />
                  </label>
                  <label className="cal-field">
                    <span>종료일 (자동)</span>
                    <input value={draft.completed_at ? formatDate(draft.completed_at.slice(0, 10)) : '-'} disabled />
                  </label>
                </div>
              )}
            </div>

            <div className="cal-form-act">
              {draft.id && (
                <button type="button" className="cal-del" onClick={() => remove(draft.id)}>
                  <Trash2 size={15} /> 삭제
                </button>
              )}
              <div className="cal-form-act-right">
                <button type="button" className="cal-cancel" onClick={closeDraft}>취소</button>
                <button type="submit" className="cal-save">저장</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function TicketCard({ ticket, onClick, onDragStart, onDragOver }) {
  return (
    <button
      className="tk-card"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onClick={onClick}
    >
      <div className="tk-card-title">{ticket.title}</div>
      <div className="tk-card-meta">
        <span className={`tk-priority ${ticket.priority}`}>{priorityLabel(ticket.priority)}</span>
        {ticket.planned_end_date && (
          <span className={`tk-due ${ticket.is_overdue ? 'overdue' : ''}`}>
            {ticket.is_overdue && <AlertTriangle size={12} />}
            {formatDate(ticket.planned_end_date)}
          </span>
        )}
      </div>
    </button>
  )
}
