import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type SupabaseEnvironment = {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
  VITE_SUPABASE_ANON_KEY?: string
}

type ClientConfiguration = { url: string; key: string }
type SupabaseSetup = { client: SupabaseClient | null; error: string }

function isPublicKey(key: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true
  try {
    const payload = key.split('.')[1]
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))).role === 'anon'
  } catch {
    return false
  }
}

export function parseSupabaseConfiguration(environment: SupabaseEnvironment): ClientConfiguration {
  const url = environment.VITE_SUPABASE_URL?.trim()
  const key = (environment.VITE_SUPABASE_PUBLISHABLE_KEY || environment.VITE_SUPABASE_ANON_KEY)?.trim()
  if (!url || !key) {
    throw new Error('Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env.local, then restart the frontend.')
  }
  const parsed = new URL(url)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) ||
      parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Use the HTTPS Supabase project URL, or an HTTP local Supabase URL.')
  }
  if (!isPublicKey(key)) {
    throw new Error('Use a Supabase publishable key or legacy anon key for sign-in. Check the public API key in frontend/.env.local.')
  }
  return { url: parsed.origin, key }
}

let cached: { configuration: ClientConfiguration; setup: SupabaseSetup } | undefined

export function getSupabase(environment: SupabaseEnvironment): SupabaseSetup {
  try {
    const configuration = parseSupabaseConfiguration(environment)
    if (cached?.configuration.url === configuration.url && cached.configuration.key === configuration.key) return cached.setup
    const client = createClient(configuration.url, configuration.key, {
      auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
    })
    const setup = { client, error: '' }
    cached = { configuration, setup }
    return setup
  } catch (error) {
    return { client: null, error: error instanceof TypeError ? 'Check the Supabase project URL in frontend/.env.local.' :
      error instanceof Error ? error.message : 'Sign-in configuration is unavailable.' }
  }
}
