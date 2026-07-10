// 백엔드(두뇌 서버)의 기본 주소 + 로그인 출입증(토큰) 관리.
//
// [주소]
// - 개발(내 PC): 값이 비어 있음('') → '/api/...' 요청이 vite.config.js의 프록시를
//   타고 http://127.0.0.1:8000 으로 전달된다. 즉 예전과 동일하게 동작한다.
// - 배포(Vercel): 빌드할 때 VITE_API_BASE 환경변수에 Render 백엔드 주소를 넣으면 그쪽으로 간다.
//   주의: 끝에 슬래시(/)를 붙이지 말 것.
//
// [출입증(토큰)]
// - 로그인에 성공하면 백엔드가 토큰을 준다. 이걸 localStorage에 보관해뒀다가,
//   백엔드로 보내는 모든 요청 헤더에 `Authorization: Bearer <토큰>`으로 실어 보낸다.
// - 백엔드는 이 토큰으로 "로그인한 사람"인지 확인한다. 토큰이 없으면 401로 막힌다.
export const API_BASE = import.meta.env.VITE_API_BASE || ''

const TOKEN_KEY = 'rsg_token'

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* storage 사용 불가 시 무시 */ }
}

export function clearToken() {
  setToken(null)
}

// 요청에 붙일 인증 헤더. 토큰이 없으면 빈 객체(=헤더 없음).
// Content-Type은 넣지 않는다 — 파일 업로드(FormData)의 자동 Content-Type을 방해하지 않기 위해.
export function authHeaders() {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}
