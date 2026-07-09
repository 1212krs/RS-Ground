import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Check, LogOut, Pencil, Search, X } from 'lucide-react'
import { NAV_ITEMS, PRODUCTIVITY_ITEMS, SETTINGS_ITEM } from '../../layouts/navConfig.js'
import { useServerState } from '../../hooks/useServerState.js'
import './Sidebar.css'

export default function Sidebar({ user, onLogout, open, setOpen, onSearch }) {
  const close = () => setOpen(false)
  const navClass = ({ isActive }) => `oa-nav-item ${isActive ? 'active' : ''}`

  // 프로젝트 이름은 사용자가 직접 바꿀 수 있고 서버(SQLite)에 저장한다.
  // 기존 localStorage 값('project-name')은 최초 1회 서버로 옮긴다.
  const [projectName, setProjectName] = useServerState('projectName', 'Rsa Project', 'project-name')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(projectName)

  const startEdit = () => { setDraft(projectName); setEditing(true) }
  const saveName = () => {
    const next = draft.trim() || 'Rsa Project'
    setProjectName(next)
    setDraft(next)
    setEditing(false)
  }
  const cancelEdit = () => { setDraft(projectName); setEditing(false) }

  return (
    <aside className={`oa-side ${open ? 'open' : ''}`}>
      <div className="oa-side-head">
        <NavLink to="/" className="oa-project-mark-link" onClick={close} aria-label="홈">
          <span className="oa-project-mark">{(projectName.trim()[0] || 'R').toUpperCase()}</span>
        </NavLink>
        {editing ? (
          <input
            className="oa-project-input"
            value={draft}
            autoFocus
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName()
              if (e.key === 'Escape') cancelEdit()
            }}
            onBlur={saveName}
            aria-label="프로젝트 이름"
          />
        ) : (
          <button className="oa-project-name-btn" onClick={startEdit} title="클릭해서 이름 변경">{projectName}</button>
        )}
        <button
          className="oa-icon oa-project-edit"
          onMouseDown={(e) => e.preventDefault()} /* 입력이 blur되며 저장되지 않도록 */
          onClick={editing ? saveName : startEdit}
          aria-label="프로젝트 이름 변경"
        >
          {editing ? <Check size={14} /> : <Pencil size={13} />}
        </button>
        <button className="oa-icon mobile-only" onClick={close} aria-label="메뉴 닫기"><X size={18} /></button>
      </div>
      <button className="oa-search" onClick={onSearch} aria-label="검색 열기"><Search size={16} /><span>검색</span><kbd>Ctrl K</kbd></button>
      <nav className="oa-nav">
        {NAV_ITEMS.map(({ id, label, icon: Icon, path }) => (
          <NavLink key={id} to={path} end={path === '/'} className={navClass} onClick={close}><Icon size={18} strokeWidth={1.9} /><span>{label}</span></NavLink>
        ))}
        <span className="oa-nav-sep" />
        {PRODUCTIVITY_ITEMS.map(({ id, label, icon: Icon, path }) => (
          <NavLink key={id} to={path} className={navClass} onClick={close}><Icon size={18} strokeWidth={1.9} /><span>{label}</span></NavLink>
        ))}
        <span className="oa-nav-sep" />
        <NavLink to={SETTINGS_ITEM.path} className={navClass} onClick={close}><SETTINGS_ITEM.icon size={18} strokeWidth={1.9} /><span>{SETTINGS_ITEM.label}</span></NavLink>
      </nav>
      <div className="oa-side-foot">
        <button className="oa-org" onClick={onLogout} aria-label="로그아웃">
          <span className="oa-org-mark">{user.name.slice(0, 1)}</span>
          <span className="oa-org-info"><strong>{user.name}</strong><small>개인 워크스페이스</small></span>
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
