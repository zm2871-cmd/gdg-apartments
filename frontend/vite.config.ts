import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, process.cwd(), 'HEARTHSTONE_').HEARTHSTONE_DEV_API_TARGET
  return {
    plugins: [react()],
    server: target ? {
      proxy: Object.fromEntries(['/api', '/auth/callback'].map(path => [path, { target, changeOrigin: false }])),
    } : undefined,
  }
})
