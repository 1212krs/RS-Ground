import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/protected-route/ProtectedRoute.jsx'
import AppLayout from './layouts/AppLayout.jsx'
import { PRODUCTIVITY_ITEMS, NAV_ITEMS, SETTINGS_ITEM } from './layouts/navConfig.js'

// 방문할 때 코드를 받아오는 페이지들(lazy loading). 페이지 수가 늘어나도
// 처음 접속 시 받는 코드 용량이 커지지 않도록 각 페이지를 별도 파일로 나눠 받는다.
const LoginPage = lazy(() => import('./pages/login/LoginPage.jsx'))
const WorkspacePage = lazy(() => import('./pages/workspace/WorkspacePage.jsx'))
const KnowledgePage = lazy(() => import('./pages/knowledge/KnowledgePage.jsx'))
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage.jsx'))
const ChatPage = lazy(() => import('./pages/chat/ChatPage.jsx'))
const AgentsPage = lazy(() => import('./pages/agents/AgentsPage.jsx'))
const MeetingPage = lazy(() => import('./pages/meeting/MeetingPage.jsx'))
const ComingSoonPage = lazy(() => import('./pages/coming-soon/ComingSoonPage.jsx'))
const NotFoundPage = lazy(() => import('./pages/not-found/NotFoundPage.jsx'))

// 아직 페이지를 만들지 않은 사이드바 항목들. 완성되는 대로 이 배열에서 빼고
// 실제 페이지 컴포넌트를 <Route>에 연결하면 된다.
// 일정·할 일·메모는 홈 워크스페이스(/, /calendar, /todos, /memos)가 함께 처리한다.
const PENDING_NAV = [
  ...NAV_ITEMS.filter((item) => !['home', 'knowledge', 'reports', 'chat', 'agents'].includes(item.id)),
  ...PRODUCTIVITY_ITEMS.filter((item) => !['calendar', 'todos', 'memos'].includes(item.id)),
  SETTINGS_ITEM,
]

function App() {
  return (
    <Suspense fallback={<div className="app-boot">불러오는 중…</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<WorkspacePage />} />
          <Route path="calendar" element={<WorkspacePage />} />
          <Route path="todos" element={<WorkspacePage />} />
          <Route path="memos" element={<WorkspacePage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="meeting" element={<MeetingPage />} />
          {PENDING_NAV.map(({ id, path, label }) => (
            <Route key={id} path={path.slice(1)} element={<ComingSoonPage label={label} />} />
          ))}
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default App
