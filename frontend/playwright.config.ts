import { defineConfig, devices } from '@playwright/test'

const publicURL = 'http://127.0.0.1:4179'
const authURL = 'http://127.0.0.1:4180'
const publicEnvironment = {
  VITE_DATA_PROVIDER: 'mock',
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_PUBLISHABLE_KEY: '',
  VITE_SUPABASE_ANON_KEY: '',
}

export default defineConfig({
  testDir: './tests',
  use: { ...devices['Desktop Chrome'], screenshot: 'only-on-failure' },
  projects: [
    { name: 'public', testMatch: /(?:workspace|auth-missing)\.spec\.ts/, use: { baseURL: publicURL } },
    { name: 'auth', testMatch: '**/auth.spec.ts', use: { baseURL: authURL } },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4179 --strictPort',
      url: publicURL, env: publicEnvironment,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4180 --strictPort',
      url: authURL,
      env: { ...publicEnvironment, VITE_SUPABASE_URL: 'https://auth.hearthstone.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' },
    },
  ],
})
