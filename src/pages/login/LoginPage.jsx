import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Bot, Database, FilePenLine, MessageSquareText, WandSparkles,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { apiLogin } from '../../api.js'
import './LoginPage.css'

const LOGIN_FEATURES = [
  { icon: FilePenLine, label: '문서작성', tint: 'violet', shape: 'circle' },
  { icon: Database, label: 'RAG', tint: 'green', shape: 'square' },
  { icon: MessageSquareText, label: '챗봇', tint: 'orange', shape: 'pentagon' },
  { icon: Bot, label: '에이전트', tint: 'yellow', shape: 'square' },
  { icon: WandSparkles, label: 'SKILL', tint: 'blue', shape: 'circle' },
]

function LoginForm({ onBack }) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [loginId, setLoginId] = useState('admin')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setLoading(true); setError('')
    try {
      const user = await apiLogin(loginId, password)
      login(user)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || '로그인에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="nx nx-auth">
      <form className="nx-card" onSubmit={submit}>
        <button type="button" className="nx-card-back" onClick={onBack}><ArrowLeft size={16} /> 뒤로</button>
        <span className="nx-logo">R</span>
        <h1 className="nx-card-title">로그인</h1>
        <p className="nx-card-sub">계정 정보를 입력하세요.</p>
        <label>아이디<input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" autoFocus /></label>
        <label>비밀번호<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="admin1234" /></label>
        {error && <p className="nx-form-error">{error}</p>}
        <button type="submit" className="nx-login full" disabled={loading}>{loading ? '로그인 중…' : '로그인'}</button>
      </form>
    </main>
  )
}

export default function LoginPage() {
  const [showForm, setShowForm] = useState(false)

  if (showForm) return <LoginForm onBack={() => setShowForm(false)} />

  return (
    <main className="nx">
      <header className="nx-nav">
        <div className="nx-nav-bar">
          <span className="nx-logo">R</span>
          <a href="#">Project</a>
          <a href="#">Navigators</a>
          <a href="#">Rewards</a>
          <a href="#">FAQ</a>
        </div>
        <button type="button" className="nx-login" onClick={() => setShowForm(true)}>Login</button>
      </header>

      <section className="nx-hero">
        <h1 className="nx-title">Your data runs<br />the world</h1>
        <p className="nx-sub">Decentralize AI by gamifying<br />data collection</p>
      </section>

      <div className="nx-tiles">
        {LOGIN_FEATURES.map(({ icon: Icon, label, tint, shape }) => (
          <div key={label} className={`nx-tile tint-${tint} shape-${shape}`} role="img" aria-label={label}>
            <Icon size={68} strokeWidth={2.2} />
          </div>
        ))}
      </div>
    </main>
  )
}
