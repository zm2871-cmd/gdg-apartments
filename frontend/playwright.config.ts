import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4179'
// E2E_API=1 runs only api.spec.ts against a running Next backend (npm run dev at the repo root); otherwise mock mode.
const api = process.env.E2E_API === '1'

export default defineConfig({
  testDir: './tests',
  testMatch: api ? '**/api.spec.ts' : '**/*.spec.ts',
  use: { ...devices['Desktop Chrome'], baseURL, screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4179 --strictPort',
    url: baseURL,
    env: api
      ? { VITE_DATA_PROVIDER: 'api', VITE_API_BASE_URL: '/api', HEARTHSTONE_DEV_API_TARGET: process.env.HEARTHSTONE_DEV_API_TARGET ?? 'http://localhost:3000' }
      : { VITE_DATA_PROVIDER: 'mock' },
  },
})
