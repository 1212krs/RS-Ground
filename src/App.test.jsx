import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

// 실제 서버가 없는 테스트 환경이므로 api.js를 가짜(mock)로 바꿔서
// "로그인 안 된 상태"를 흉내낸다.
vi.mock('./api.js', () => ({
  apiMe: vi.fn(() => Promise.reject(new Error('not authenticated'))),
  apiLogin: vi.fn(),
  apiLogout: vi.fn(() => Promise.resolve()),
}))

function renderApp(initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('라우팅 가드', () => {
  it('로그인하지 않은 사용자가 홈(/)에 접근하면 로그인 화면으로 이동한다', async () => {
    renderApp('/')
    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument()
  })

  it('존재하지 않는 주소는 404 페이지를 보여준다', async () => {
    renderApp('/no-such-page')
    expect(await screen.findByText('404')).toBeInTheDocument()
  })
})
