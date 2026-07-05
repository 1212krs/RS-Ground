import {
  Bot, CalendarDays, CheckCircle2, FilePenLine, Home, LibraryBig, MessageSquareText, NotebookPen, Settings,
} from 'lucide-react'

// 사이드바 내비게이션 구성. 새 화면을 붙일 때 여기에 항목을 추가하고
// App.jsx의 <Route path="..."> 에 실제 페이지를 연결하면 된다.
export const NAV_ITEMS = [
  { id: 'home', label: '홈', icon: Home, path: '/' },
  { id: 'knowledge', label: '지식', icon: LibraryBig, path: '/knowledge' },
  { id: 'chat', label: 'AI 채팅', icon: MessageSquareText, path: '/chat' },
  { id: 'reports', label: '보고서', icon: FilePenLine, path: '/reports' },
  { id: 'agents', label: '에이전트', icon: Bot, path: '/agents' },
]

export const PRODUCTIVITY_ITEMS = [
  { id: 'calendar', label: '일정', icon: CalendarDays, path: '/calendar' },
  { id: 'todos', label: '할 일', icon: CheckCircle2, path: '/todos' },
  { id: 'memos', label: '메모', icon: NotebookPen, path: '/memos' },
]

export const SETTINGS_ITEM = { id: 'settings', label: '설정', icon: Settings, path: '/settings' }

export const PAGE_META = {
  '/': ['오늘의 업무', 'PERSONAL DASHBOARD'],
  '/knowledge': ['지식', 'DOCUMENT LIBRARY'],
  '/chat': ['AI 채팅', 'GROUNDED ANSWERS'],
  '/reports': ['보고서', 'REPORT STUDIO'],
  '/agents': ['에이전트', 'AGENT HUB'],
  '/calendar': ['일정', 'CALENDAR'],
  '/todos': ['할 일', 'TASKS'],
  '/memos': ['메모', 'NOTES'],
  '/settings': ['설정', 'SYSTEM'],
}
