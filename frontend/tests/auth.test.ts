import { describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js'
import { SupabaseAuthAdapter } from '../src/services/auth'
import { parseSupabaseConfiguration } from '../src/lib/supabase'
import { safeDestination, consumeDestination, rememberDestination } from '../src/app/authNavigation'
import { LocalSavedAdapter } from '../src/services/storage'

function storage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) }, clear: () => values.clear(),
  }
}

const session = { access_token: 'test-access', user: { id: 'alice', email: 'alice@example.test' } } as Session

function fixture() {
  const unsubscribe = vi.fn()
  let listener: ((event: AuthChangeEvent, session: Session | null) => void) | undefined
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: session.user }, error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: { provider: 'google', url: 'https://example.test' }, error: null }),
    signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn().mockImplementation(callback => {
      listener = callback
      return { data: { subscription: { unsubscribe } } }
    }),
  }
  const adapter = new SupabaseAuthAdapter({ auth } as unknown as SupabaseClient)
  return { auth, adapter, unsubscribe, emit: (event: AuthChangeEvent, value: Session | null) => listener?.(event, value) }
}

describe('Supabase configuration and return destinations', () => {
  it('accepts publishable and legacy anon keys and rejects privileged keys', () => {
    expect(parseSupabaseConfiguration({
      VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    }).url).toBe('https://example.supabase.co')
    const anon = 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ role: 'anon' })) + '.signature'
    expect(parseSupabaseConfiguration({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: anon }).key).toBe(anon)
    for (const key of ['sb_secret_test', 'header.' + btoa(JSON.stringify({ role: 'service_role' })) + '.signature']) {
      expect(() => parseSupabaseConfiguration({ VITE_SUPABASE_URL: 'https://example.test', VITE_SUPABASE_PUBLISHABLE_KEY: key })).toThrow(/publishable/)
    }
    expect(() => parseSupabaseConfiguration({})).toThrow(/not configured/)
    expect(() => parseSupabaseConfiguration({ VITE_SUPABASE_URL: 'https://example.test/wrong', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })).toThrow(/project URL/)
  })

  it('allows known frontend destinations and rejects external, encoded, and authentication redirects', () => {
    expect(safeDestination('/account')).toBe('/account')
    expect(safeDestination('/building/example-street')).toBe('/building/example-street')
    expect(safeDestination('/search?q=123+Example')).toBe('/search?q=123+Example')
    for (const url of ['https://evil.test', '//evil.test', '/\evil.test', '/%2f%2fevil.test', '/auth/callback?code=x', '/login', '/signup', '/api/saved', '/saved%0d%0aLocation:evil', '/account#other']) {
      expect(safeDestination(url)).toBe('/')
    }
    const values = storage()
    rememberDestination(values, '/account')
    expect(consumeDestination(values)).toBe('/account')
    expect(consumeDestination(values)).toBe('/')
  })
})

describe('Supabase adapter', () => {
  it.each(['google', 'github'] as const)('starts %s OAuth with the frontend callback', async provider => {
    const { auth, adapter } = fixture()
    await adapter.signInWithOAuth(provider, 'https://hearthstone.test/auth/callback')
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider, options: { redirectTo: 'https://hearthstone.test/auth/callback' } })
  })

  it('keeps email-link login and signup on the same client', async () => {
    const { auth, adapter } = fixture()
    await adapter.signInWithEmail('alice@example.test', 'https://hearthstone.test/auth/callback', true)
    expect(auth.signInWithOtp).toHaveBeenLastCalledWith({
      email: 'alice@example.test', options: { emailRedirectTo: 'https://hearthstone.test/auth/callback', shouldCreateUser: true },
    })
    await adapter.signInWithEmail('alice@example.test', 'https://hearthstone.test/auth/callback', false)
    expect(auth.signInWithOtp.mock.calls[1][0].options.shouldCreateUser).toBe(false)
  })

  it('deduplicates callback processing and verifies the returned user', async () => {
    const { adapter, auth } = fixture()
    const url = new URL('https://hearthstone.test/auth/callback?code=once')
    const first = adapter.completeCallback(url)
    const second = adapter.completeCallback(url)
    expect(first).toBe(second)
    await expect(first).resolves.toMatchObject({ user: { id: 'alice' } })
    expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce()
    expect(auth.getUser).toHaveBeenCalledOnce()
    await adapter.completeCallback(url)
    expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce()
  })

  it('rejects denied, malformed, expired, and unverified callbacks', async () => {
    const { adapter, auth } = fixture()
    await expect(adapter.completeCallback(new URL('https://hearthstone.test/auth/callback?error=access_denied&error_description=private'))).rejects.toThrow(/cancelled/)
    await expect(adapter.completeCallback(new URL('https://hearthstone.test/auth/callback'))).rejects.toThrow(/incomplete/)
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'technical stack' } })
    await expect(adapter.completeCallback(new URL('https://hearthstone.test/auth/callback?code=expired'))).rejects.toThrow(/expired/)
    auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'bob' } }, error: null })
    await expect(adapter.completeCallback(new URL('https://hearthstone.test/auth/callback?code=wrong-user'))).rejects.toThrow(/verified/)
  })

  it('reports provider and sign-out failures without server details', async () => {
    const { adapter, auth } = fixture()
    auth.signInWithOAuth.mockResolvedValueOnce({ data: {}, error: { code: 'provider_disabled', message: 'internal detail' } })
    await expect(adapter.signInWithOAuth('google', 'https://hearthstone.test/auth/callback')).rejects.toThrow(/provider is unavailable/)
    auth.signOut.mockResolvedValueOnce({ error: { message: 'internal detail' } })
    await expect(adapter.signOut()).rejects.toThrow(/could not be signed out/)
  })

  it('forwards auth events and unsubscribes cleanly', () => {
    const { adapter, unsubscribe, emit } = fixture()
    const listener = vi.fn()
    const stop = adapter.onAuthStateChange(listener)
    for (const event of ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'] as const) emit(event, session)
    emit('SIGNED_OUT', null)
    expect(listener).toHaveBeenCalledTimes(5)
    expect(listener).toHaveBeenLastCalledWith('SIGNED_OUT', null)
    stop()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('retrieves the current SDK token and rejects a different account', async () => {
    const { adapter, auth } = fixture()
    expect(await adapter.getAccessToken('alice')).toBe('test-access')
    auth.getSession.mockResolvedValueOnce({ data: { session: { ...session, access_token: 'refreshed' } }, error: null })
    expect(await adapter.getAccessToken('alice')).toBe('refreshed')
    await expect(adapter.getAccessToken('bob')).rejects.toMatchObject({ status: 401 })
  })
})

describe('demo saves', () => {
  it('separates anonymous and signed-in users while retaining existing anonymous saves', async () => {
    const values = storage()
    const adapter = new LocalSavedAdapter(values)
    await adapter.set('legacy-anonymous', true)
    await adapter.set('alice-building', true, 'alice')
    await adapter.set('bob-building', true, 'bob')
    expect(await adapter.list()).toEqual(['legacy-anonymous'])
    expect(await adapter.list(undefined, 'alice')).toEqual(['alice-building'])
    expect(await adapter.list(undefined, 'bob')).toEqual(['bob-building'])
    await adapter.set('alice-building', false, 'alice')
    expect(await adapter.list(undefined, 'alice')).toEqual([])
    expect(await adapter.list(undefined, 'bob')).toEqual(['bob-building'])
  })
})
