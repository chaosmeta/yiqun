import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  // frontend/public 是一个文件（非目录），禁用 publicDir 避免 Vite 报 ENOTDIR
  publicDir: false,
})
