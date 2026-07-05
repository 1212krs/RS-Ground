import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Search } from 'lucide-react'
import { NAV_ITEMS, PRODUCTIVITY_ITEMS } from '../../layouts/navConfig.js'
import './CommandPalette.css'

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  if (!open) return null
  const items = [...NAV_ITEMS, ...PRODUCTIVITY_ITEMS].filter((item) => item.label.includes(query))

  return (
    <div className="command-backdrop" onMouseDown={onClose}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="명령 팔레트" onMouseDown={(e) => e.stopPropagation()}>
        <label><Search size={19} /><input autoFocus aria-label="페이지 또는 기능 검색" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="페이지 또는 기능 검색…" /><kbd>ESC</kbd></label>
        <div>
          {items.map(({ id, label, icon: Icon, path }) => (
            <button key={id} onClick={() => { navigate(path); onClose() }}><Icon size={18} /><span>{label}</span><ArrowRight size={15} /></button>
          ))}
        </div>
      </div>
    </div>
  )
}
