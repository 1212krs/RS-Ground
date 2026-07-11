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
      // 백엔드(auth/rag/report/store/meeting/study/todo 등 모든 /api/* 라우터)를
      // 8000번 포트로 통째로 전달한다. 기능별로 하나씩 나열하면 새 백엔드 패키지를
      // 추가할 때마다 이 파일을 잊어버리기 쉬워서(실제로 meeting·study가 누락돼
      // 있었다), 접두어 하나로 통일했다.
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
})
