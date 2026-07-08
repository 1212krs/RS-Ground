import { useNavigate, useOutletContext } from 'react-router-dom'
import { Menu, MessageSquareText, Globe } from 'lucide-react'
import { AGENTS, UPCOMING_AGENTS } from './agentsConfig.js'
import './AgentsPage.css'

// 에이전트 허브 — 분야별 전용 챗(회계챗 등)으로 들어가는 입구.
// 각 에이전트는 검색 범위(scope)만 다른 같은 채팅 화면(/chat)을 연다.
export default function AgentsPage() {
  const { onMenu } = useOutletContext()
  const navigate = useNavigate()

  const openAgent = (a) =>
    navigate(`/chat?scope=${encodeURIComponent(a.scope)}&label=${encodeURIComponent(a.name)}`)

  return (
    <div className="ag">
      <header className="ag-head">
        <button className="oa-icon mobile-only" onClick={onMenu} aria-label="메뉴"><Menu size={20} /></button>
        <div>
          <h1>에이전트</h1>
          <p className="ag-sub">분야 문서만 근거로 삼는 전용 도우미. 같은 지식 창고를 공유하고 검색 범위만 다릅니다.</p>
        </div>
      </header>

      <div className="ag-grid">
        {/* 전체 검색(AI챗)도 하나의 카드로 노출 */}
        <button className="ag-card" onClick={() => navigate('/chat')}>
          <span className="ag-icon" style={{ background: 'rgba(139,126,232,.16)', color: '#8B7EE8' }}>
            <Globe size={22} />
          </span>
          <strong>AI 채팅 (전체)</strong>
          <span className="ag-desc">모든 문서에서 검색해 답합니다.</span>
          <span className="ag-open"><MessageSquareText size={13} /> 대화 시작</span>
        </button>

        {AGENTS.map((a) => {
          const Icon = a.icon
          return (
            <button key={a.id} className="ag-card" onClick={() => openAgent(a)}>
              <span className="ag-icon" style={{ background: `${a.accent}22`, color: a.accent }}>
                <Icon size={22} />
              </span>
              <strong>{a.name}</strong>
              <span className="ag-desc">{a.desc}</span>
              <span className="ag-open"><MessageSquareText size={13} /> 대화 시작</span>
            </button>
          )
        })}

        {UPCOMING_AGENTS.map((a) => {
          const Icon = a.icon
          return (
            <div key={a.id} className="ag-card ag-card-soon" aria-disabled="true">
              <span className="ag-icon"><Icon size={22} /></span>
              <strong>{a.name}</strong>
              <span className="ag-desc">{a.desc}</span>
              <span className="ag-soon-badge">준비 중</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
