import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const MOCK_COOKIE = 'rsg_mock_session'

const readBody = (req) => new Promise((resolve, reject) => {
  let data = ''
  req.on('data', (chunk) => { data += chunk })
  req.on('end', () => resolve(data))
  req.on('error', reject)
})

const sendJson = (res, status, obj) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}

const getCookie = (req, name) => {
  const raw = req.headers.cookie || ''
  const match = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

// 진짜 백엔드가 아직 없는 개발 단계에서, 로그인 화면 → 대시보드로 이어지는
// 흐름을 직접 눈으로 확인하기 위한 임시 가짜 인증 서버.
// 아이디/비밀번호를 실제로 검증하지 않고 무조건 로그인에 성공시킨다.
// 진짜 백엔드가 생기면 이 플러그인 전체를 지우고 vite.config.js의 server.proxy에
// 실제 백엔드 주소를 연결하면 된다. (dev 서버에서만 동작하고, 배포 빌드에는 포함되지 않는다.)
function mockAuth() {
  return {
    name: 'mock-auth-dev',
    configureServer(server) {
      server.middlewares.use('/api/auth/login', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        const body = JSON.parse((await readBody(req)) || '{}')
        const loginId = body.loginId || 'admin'
        res.setHeader('Set-Cookie', `${MOCK_COOKIE}=${encodeURIComponent(loginId)}; Path=/; HttpOnly; SameSite=Lax`)
        sendJson(res, 200, { user: { id: 1, loginId, displayName: loginId === 'admin' ? '관리자' : loginId } })
      })

      server.middlewares.use('/api/auth/me', (req, res, next) => {
        if (req.method !== 'GET') return next()
        const loginId = getCookie(req, MOCK_COOKIE)
        if (!loginId) return sendJson(res, 401, { error: '로그인이 필요합니다.' })
        sendJson(res, 200, { user: { id: 1, loginId, displayName: loginId === 'admin' ? '관리자' : loginId } })
      })

      server.middlewares.use('/api/auth/logout', (req, res, next) => {
        if (req.method !== 'POST') return next()
        res.setHeader('Set-Cookie', `${MOCK_COOKIE}=; Path=/; Max-Age=0`)
        sendJson(res, 200, {})
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), mockAuth()],
  // 포트를 고정한다. 포트가 바뀌면 localStorage 기반 상태가 origin 단위로
  // 분리되어 이전 데이터가 사라진 것처럼 보이기 때문이다.
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    // 진짜 백엔드가 붙으면 mockAuth()를 지우고 여기에 /api 프록시를 추가한다.
    proxy: {
      // RAG API (backend/rag/api.py, uvicorn으로 별도 실행 필요). PRD-RAG.md 참고.
      '/api/rag': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
})
