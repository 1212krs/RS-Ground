import { useState } from 'react'
import { ArrowRight, Check, Pencil, Trash2, X } from 'lucide-react'
import { uid } from '../../utils.js'

// 신규 메모는 createdAt(ISO)에 저장하고 표시할 때 변환한다.
// 기존 메모는 date 문자열('오늘 18:24' 등)을 그대로 쓰므로 둘 다 처리한다.
function memoStamp(memo) {
  if (!memo.createdAt) return memo.date || ''
  const d = new Date(memo.createdAt)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function MemosPanel({ memos, setMemos, notify }) {
  const [quick, setQuick] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')

  const add = () => {
    const content = quick.trim()
    if (!content) return
    setMemos((list) => [{ id: uid('memo'), content, createdAt: new Date().toISOString() }, ...list])
    setQuick('')
    notify('메모를 저장했습니다.')
  }

  const startEdit = (memo) => {
    setEditingId(memo.id)
    setEditText(memo.content)
  }

  const saveEdit = () => {
    const content = editText.trim()
    if (!content) { notify('메모 내용을 입력하세요.', 'error'); return }
    setMemos((list) => list.map((m) => m.id === editingId ? { ...m, content } : m))
    setEditingId(null)
    notify('메모를 수정했습니다.')
  }

  const remove = (id) => {
    setMemos((list) => list.filter((m) => m.id !== id))
    if (editingId === id) setEditingId(null)
    notify('메모를 삭제했습니다.')
  }

  return (
    <div className="wsp">
      <div className="wsp-head">
        <div className="wsp-head-title">
          <h2>메모</h2>
          <span className="wsp-count">{memos.length}개</span>
        </div>
      </div>

      <div className="wsp-memo-new">
        <textarea
          value={quick}
          maxLength={500}
          placeholder="잊기 전에 적어두세요…"
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add() }}
        />
        <div className="wsp-memo-new-act">
          <span>{quick.length}/500</span>
          <button onClick={add} disabled={!quick.trim()}>저장 <ArrowRight size={14} /></button>
        </div>
      </div>

      <div className="wsp-list">
        {memos.length === 0 && <p className="wsp-empty">저장된 메모가 없습니다.</p>}
        {memos.map((memo) => (
          <div key={memo.id} className="wsp-item memo">
            {editingId === memo.id ? (
              <div className="wsp-memo-edit">
                <textarea autoFocus value={editText} maxLength={500} onChange={(e) => setEditText(e.target.value)} />
                <div className="wsp-memo-edit-act">
                  <button className="wsp-icon" onClick={() => setEditingId(null)} aria-label="취소"><X size={16} /></button>
                  <button className="wsp-icon primary" onClick={saveEdit} aria-label="저장"><Check size={16} /></button>
                </div>
              </div>
            ) : (
              <>
                <div className="wsp-item-body">
                  <span className="wsp-memo-stamp">{memoStamp(memo)}</span>
                  <p>{memo.content}</p>
                </div>
                <div className="wsp-item-act">
                  <button onClick={() => startEdit(memo)} aria-label="수정"><Pencil size={15} /></button>
                  <button onClick={() => remove(memo.id)} aria-label="삭제"><Trash2 size={15} /></button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
