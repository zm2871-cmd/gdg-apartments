import { beforeEach, describe, expect, it, vi } from 'vitest'

const profile = vi.hoisted(() => ({ preferences: null as unknown, readError: false }))

vi.mock('../../src/lib/db', () => {
  const user = { id: 'test-user', email: 'renter@example.test' }
  const db = {
    auth: {
      exchangeCodeForSession: async () => ({ error: null }),
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: profile.preferences === null ? null : { preferences: profile.preferences },
        error: profile.readError ? new Error('database unavailable') : null,
      }) }) }),
      upsert: async (row: { preferences: unknown }) => {
        profile.preferences = row.preferences
        return { error: null }
      },
    }),
  }
  return { requireUser: async () => ({ db, user }), session: async () => db, admin: () => null }
})
vi.mock('../../src/lib/security', () => ({
  guard: () => undefined,
  json: (body: unknown, status = 200) => Response.json(body, { status }),
  failure: () => Response.json({ error: { message: 'Invalid account preferences.' } }, { status: 400 }),
}))
vi.mock('../../src/lib/leases', () => ({ deleteLease: async () => undefined }))

import { GET as accountGet, PATCH } from '../../src/app/api/account/route'
import { GET as callbackGet } from '../../src/app/auth/callback/route'

const weights = { pests: 3, bedbugs: 1, heat: 5, maintenance: 4, noise: 2 }

beforeEach(() => {
  profile.preferences = null
  profile.readError = false
})

describe('account priorities', () => {
  it('accepts only whole-number priorities with at least one selected category', async () => {
    const request = (body: unknown) => new Request('http://localhost/api/account', {
      method: 'PATCH', body: JSON.stringify(body),
    })
    expect((await PATCH(request({ ...weights, heat: 1.5 }))).status).toBe(400)
    expect((await PATCH(request({ pests: 0, bedbugs: 0, heat: 0, maintenance: 0, noise: 0 }))).status).toBe(400)
    expect(profile.preferences).toBeNull()
    expect((await PATCH(request(weights))).status).toBe(200)
    expect((await accountGet(new Request('http://localhost/api/account'))).json()).resolves.toEqual({
      email: 'renter@example.test', preferences: weights,
    })
  })

  it('shows onboarding only when no valid saved priorities exist', async () => {
    const callback = () => callbackGet(new Request('http://localhost/auth/callback?code=valid'))
    expect((await callback()).headers.get('location')).toBe('http://localhost/account')
    profile.preferences = weights
    expect((await callback()).headers.get('location')).toBe('http://localhost/saved')
    profile.preferences = { ...weights, pests: 1.5 }
    expect((await callback()).headers.get('location')).toBe('http://localhost/account')
    profile.readError = true
    expect((await callback()).headers.get('location')).toBe('http://localhost/account')
  })
})
