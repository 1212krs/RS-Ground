import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 포트를 고정한다. 포트가 바뀌면 localStorage 기반 상태가 origin 단위로
  // 분리되어 이전 데이터가 사라진 것처럼 보이기 때문이다.
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    // 백엔드가 붙으면 여기에 /api 프록시를 추가한다.
  },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
})
