import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  // publicDir: false 修复 frontend/public 是文件非目录导致的 ENOTDIR 报错
  publicDir: false,
})
