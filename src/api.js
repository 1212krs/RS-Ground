// 화면(프론트)에서 백엔드 서버로 요청을 보내는 도구 모음.
// credentials: 'include' → 로그인 증표(쿠키)를 요청에 함께 실어 보낸다. 이게 없으면 로그인이 유지되지 않는다.
async function req(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `요청 실패 (HTTP ${res.status})`)
  return data
}

// 서버가 주는 사용자 정보를 화면에서 쓰기 좋은 모양으로 정리.
const normalize = (u) => ({ id: u.id, loginId: u.loginId, name: u.displayName || u.loginId })

export const apiLogin = async (loginId, password) =>
  normalize((await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ loginId, password }) })).user)

export const apiLogout = () => req('/api/auth/logout', { method: 'POST' })

// 새로고침 시 "지금 로그인 되어 있나?" 확인용. 안 되어 있으면 에러를 던진다.
export const apiMe = async () => normalize((await req('/api/auth/me')).user)
