import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Sidebar from '../components/sidebar/Sidebar.jsx'
import Topbar from '../components/topbar/Topbar.jsx'
import CommandPalette from '../components/command-palette/CommandPalette.jsx'
import Toast from '../components/toast/Toast.jsx'
import { PAGE_META } from './navConfig.js'
import './AppLayout.css'

// 홈처럼 자체 다크 배경·헤더를 쓰는 화면은 상단 Topbar를 숨긴다.
const NO_TOPBAR_PATHS = ['/', '/agents', '/knowledge', '/reports', '/chat']

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    const keydown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(true) }
      if (event.key === 'Escape') setCommandOpen(false)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [])

  const notify = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3200)
  }

  const hideTopbar = NO_TOPBAR_PATHS.includes(location.pathname)
  const [title, subtitle] = PAGE_META[location.pathname] || ['', '']

  return (
    <div className="app-shell">
      <Sidebar user={user} onLogout={logout} open={sidebarOpen} setOpen={setSidebarOpen} onSearch={() => setCommandOpen(true)} />
      <main className={`main-area ${hideTopbar ? 'main-dark' : ''}`}>
        {!hideTopbar && (
          <Topbar
            title={title}
            subtitle={subtitle}
            onMenu={() => setSidebarOpen(true)}
            onSearch={() => setCommandOpen(true)}
            onQuick={() => navigate('/todos')}
          />
        )}
        <Outlet context={{ notify, onMenu: () => setSidebarOpen(true) }} />
      </main>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      <Toast toast={toast} />
    </div>
  )
}
