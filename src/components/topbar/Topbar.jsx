import { Menu, Plus, Search } from 'lucide-react'
import './Topbar.css'

export default function Topbar({ title, subtitle, onMenu, onSearch, onQuick }) {
  return (
    <header className="topbar">
      <button className="icon-button mobile-only" onClick={onMenu} aria-label="메뉴"><Menu size={21} /></button>
      <div className="page-title"><span>{subtitle}</span><h1>{title}</h1></div>
      <div className="top-actions">
        <button className="search-trigger" onClick={onSearch} aria-label="전체 검색"><Search size={17} /><span>전체 검색</span><kbd>⌘ K</kbd></button>
        <button className="quick-button" onClick={onQuick} aria-label="빠른 추가"><Plus size={18} /> <span>빠른 추가</span></button>
      </div>
    </header>
  )
}
