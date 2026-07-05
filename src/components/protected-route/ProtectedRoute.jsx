import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

// 로그인하지 않은 사용자가 보호된 화면(대시보드 등)에 들어오면 /login으로 돌려보낸다.
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-boot">불러오는 중…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}
