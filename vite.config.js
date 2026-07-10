import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 로그인은 이제 진짜 백엔드(backend/auth)가 처리한다. 개발 중에도 백엔드를 띄우고
// `/api/auth/*` 요청을 아래 server.proxy로 8000번 포트에 전달한다.
// (예전의 가짜 로그인 mockAuth 플러그인은 제거함 — 진짜 로그인으로 대체.)
// 개발용 로컬 계정은 backend에서: `python -m auth.manage add <아이디> <비번>`

export default defineConfig({
  plugins: [react()],
  // 포트를 고정한다. 포트가 바뀌면 localStorage 기반 상태가 origin 단위로
  // 분리되어 이전 데이터가 사라진 것처럼 보이기 때문이다.
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: {
      // 로그인 API (backend/auth/api.py). 로그인/로그아웃/세션확인.
      '/api/auth': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      // RAG API (backend/rag/api.py, uvicorn으로 별도 실행 필요). PRD-RAG.md 참고.
      '/api/rag': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      // 보고서 API (backend/report/api.py). RAG와 같은 서버(main:app)에서 함께 뜬다.
      '/api/report': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      // 워크스페이스 저장 API (backend/store/api.py). 일정·할 일·메모 영속 저장.
      '/api/store': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
})
