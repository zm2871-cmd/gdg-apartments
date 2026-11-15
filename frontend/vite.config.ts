import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, process.cwd(), 'HEARTHSTONE_').HEARTHSTONE_DEV_API_TARGET
  const embedded = process.env.HEARTHSTONE_EMBEDDED_BUILD === '1'
  return {
    plugins: [react()],
    base: embedded ? '/hearthstone/' : '/',
    build: embedded ? { outDir: '../public/hearthstone', emptyOutDir: true } : undefined,
    server: target ? {
      proxy: Object.fromEntries(['/api', '/auth/callback'].map(path => [path, { target, changeOrigin: false }])),
    } : undefined,
  }
})
