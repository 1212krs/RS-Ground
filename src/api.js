import { API_BASE, authHeaders, setToken, clearToken } from './apiBase'

// 화면(프론트)에서 백엔드 서버로 요청을 보내는 도구 모음.
// 로그인 출입증(토큰)을 authHeaders()로 요청에 실어 보낸다. 토큰이 없으면 백엔드가 401로 막는다.
async function req(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options.headers || {}) },
    ...options,
  })
  // 출입증이 없거나 만료되면 보관 중이던 토큰을 비운다(다음 세션 확인 때 로그인 화면으로 유도됨).
  if (res.status === 401) clearToken()
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || data.detail || `요청 실패 (HTTP ${res.status})`)
  return data
}

// 서버가 주는 사용자 정보를 화면에서 쓰기 좋은 모양으로 정리.
const normalize = (u) => ({ id: u.id, loginId: u.loginId, name: u.displayName || u.loginId })

// 로그인 성공 시 백엔드가 { user, token }을 준다. 토큰을 보관하고 사용자만 화면에 넘긴다.
export const apiLogin = async (loginId, password) => {
  const { user, token } = await req('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ loginId, password }),
  })
  setToken(token)
  return normalize(user)
}

export const apiLogout = async () => {
  try { await req('/api/auth/logout', { method: 'POST' }) } finally { clearToken() }
}

// 새로고침 시 "지금 로그인 되어 있나?" 확인용. 안 되어 있으면 에러를 던진다.
export const apiMe = async () => normalize((await req('/api/auth/me')).user)
