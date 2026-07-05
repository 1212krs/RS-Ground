import { NavLink } from 'react-router-dom'
import { ChevronDown, LogOut, Search, X } from 'lucide-react'
import { NAV_ITEMS, PRODUCTIVITY_ITEMS, SETTINGS_ITEM } from '../../layouts/navConfig.js'
import './Sidebar.css'

export default function Sidebar({ user, onLogout, open, setOpen, onSearch }) {
  const close = () => setOpen(false)
  const navClass = ({ isActive }) => `oa-nav-item ${isActive ? 'active' : ''}`

  return (
    <aside className={`oa-side ${open ? 'open' : ''}`}>
      <div className="oa-side-head">
        <NavLink to="/" className="oa-project" onClick={close}>
          <span className="oa-project-mark">R</span>
          <span className="oa-project-name">Rsa Project</span>
          <ChevronDown size={15} />
        </NavLink>
        <button className="oa-icon mobile-only" onClick={close} aria-label="메뉴 닫기"><X size={18} /></button>
      </div>
      <button className="oa-search" onClick={onSearch}><Search size={16} /><span>검색</span><kbd>Ctrl K</kbd></button>
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
        <div className="oa-promo">
          <strong>새로워진 홈</strong>
          <p>다크 대시보드로 일정과 업무를 한눈에 확인하세요.</p>
          <NavLink to="/" className="oa-promo-btn" onClick={close}>자세히</NavLink>
        </div>
        <button className="oa-org" onClick={onLogout} title="로그아웃">
          <span className="oa-org-mark">{user.name.slice(0, 1)}</span>
          <span className="oa-org-info"><strong>{user.name}</strong><small>개인 워크스페이스</small></span>
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
