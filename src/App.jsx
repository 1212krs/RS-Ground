import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import AppLayout from './layouts/AppLayout.jsx'
import { PRODUCTIVITY_ITEMS, NAV_ITEMS, SETTINGS_ITEM } from './layouts/navConfig.js'
import LoginPage from './pages/login/LoginPage.jsx'
import DashboardPage from './pages/dashboard/DashboardPage.jsx'
import ComingSoonPage from './pages/coming-soon/ComingSoonPage.jsx'

// 아직 페이지를 만들지 않은 사이드바 항목들. 완성되는 대로 이 배열에서 빼고
// 실제 페이지 컴포넌트를 <Route>에 연결하면 된다.
const PENDING_NAV = [...NAV_ITEMS.filter((item) => item.id !== 'home'), ...PRODUCTIVITY_ITEMS, SETTINGS_ITEM]

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-boot">불러오는 중…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        {PENDING_NAV.map(({ id, path, label }) => (
          <Route key={id} path={path.slice(1)} element={<ComingSoonPage label={label} />} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
