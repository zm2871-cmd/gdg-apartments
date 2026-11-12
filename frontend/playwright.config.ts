import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4179'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  use: { ...devices['Desktop Chrome'], baseURL, screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4179 --strictPort',
    url: baseURL,
    env: { VITE_DATA_PROVIDER: 'mock' },
  },
})
