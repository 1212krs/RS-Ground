import { useState } from 'react'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { uid } from '../../utils.js'

const PRIORITIES = [
  { id: 'normal', label: '보통' },
  { id: 'high', label: '중요' },
]

const emptyDraft = () => ({ id: null, title: '', project: '', due: '', priority: 'normal' })

export default function TodosPanel({ todos, setTodos, notify }) {
  const [draft, setDraft] = useState(null)

  const remaining = todos.filter((t) => !t.done).length

  const toggle = (id) => setTodos((list) => list.map((t) => t.id === id ? { ...t, done: !t.done } : t))

  const startNew = () => setDraft(emptyDraft())
  const startEdit = (todo) => setDraft({ ...todo, project: todo.project || '', due: todo.due || '' })

  const save = () => {
    const title = draft.title.trim()
    if (!title) { notify('할 일 제목을 입력하세요.', 'error'); return }
    const payload = { title, project: draft.project.trim(), due: draft.due.trim(), priority: draft.priority }
    if (draft.id != null) {
      setTodos((list) => list.map((t) => t.id === draft.id ? { ...t, ...payload } : t))
      notify('할 일을 수정했습니다.')
    } else {
      setTodos((list) => [{ id: uid('todo'), done: false, ...payload }, ...list])
      notify('할 일을 추가했습니다.')
    }
    setDraft(null)
  }

  const remove = (id) => {
    setTodos((list) => list.filter((t) => t.id !== id))
    setDraft(null)
    notify('할 일을 삭제했습니다.')
  }

  return (
    <div className="wsp">
      <div className="wsp-head">
        <div className="wsp-head-title">
          <h2>할 일</h2>
          <span className="wsp-count">{remaining}개 남음</span>
        </div>
        <button className="wsp-primary" onClick={startNew}><Plus size={16} /> 추가</button>
      </div>

      {draft && (
        <form className="wsp-form" onSubmit={(e) => { e.preventDefault(); save() }}>
          <input
            autoFocus
            className="wsp-form-title"
            value={draft.title}
            maxLength={120}
            placeholder="할 일"
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
          <div className="wsp-form-row">
            <input value={draft.project} maxLength={40} placeholder="프로젝트(선택)" onChange={(e) => setDraft((d) => ({ ...d, project: e.target.value }))} />
            <input value={draft.due} maxLength={20} placeholder="마감(예: 7월 12일)" onChange={(e) => setDraft((d) => ({ ...d, due: e.target.value }))} />
            <select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}>
              {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="wsp-form-act">
            <button type="button" className="wsp-cancel" onClick={() => setDraft(null)}>취소</button>
            <button type="submit" className="wsp-save">저장</button>
          </div>
        </form>
      )}

      <div className="wsp-list">
        {todos.length === 0 && <p className="wsp-empty">할 일이 없습니다. 위의 추가 버튼으로 만들어보세요.</p>}
        {todos.map((todo) => (
          <div key={todo.id} className={`wsp-item todo ${todo.done ? 'done' : ''}`}>
            <button
              className="wsp-check"
              onClick={() => toggle(todo.id)}
              aria-pressed={todo.done}
              aria-label={todo.done ? `${todo.title} 완료 취소` : `${todo.title} 완료로 표시`}
            >{todo.done && <Check size={14} />}</button>
            <div className="wsp-item-body">
              <strong>{todo.title}</strong>
              {todo.project && <span>{todo.project}</span>}
            </div>
            {todo.due && <small className={todo.priority === 'high' ? 'high' : ''}>{todo.due}</small>}
            <div className="wsp-item-act">
              <button onClick={() => startEdit(todo)} aria-label="수정"><Pencil size={15} /></button>
              <button onClick={() => remove(todo.id)} aria-label="삭제"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
