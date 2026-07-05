import { createContext, useContext, useEffect, useState } from 'react'
import { apiLogout, apiMe } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // 새로고침해도 로그인 상태가 유지되도록 서버에 현재 세션을 확인한다.
  useEffect(() => {
    apiMe().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [])

  const logout = async () => {
    try { await apiLogout() } catch { /* 서버 연결 실패해도 화면은 로그아웃 처리 */ }
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login: setUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 내부에서만 사용할 수 있습니다.')
  return ctx
}
