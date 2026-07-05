import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage.jsx'
import { AuthProvider } from '../../context/AuthContext.jsx'

vi.mock('../../api.js', () => ({
  apiMe: vi.fn(() => Promise.reject(new Error('not authenticated'))),
  apiLogin: vi.fn(() => Promise.reject(new Error('요청 실패 (HTTP 404)'))),
  apiLogout: vi.fn(() => Promise.resolve()),
}))

describe('LoginPage', () => {
  it('Login 버튼을 누르면 아이디/비밀번호 입력 폼이 나타난다', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByLabelText('아이디')).toBeInTheDocument()
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument()
  })
})
