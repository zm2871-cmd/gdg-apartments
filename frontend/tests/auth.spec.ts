import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const authOrigin = 'https://auth.hearthstone.test'
const users = {
  alice: { id: '00000000-0000-4000-a000-000000000001', email: 'alice@example.test', name: 'Alice Renter' },
  bob: { id: '00000000-0000-4000-a000-000000000002', email: 'bob@example.test', name: 'Bob Renter' },
}

async function mockSupabase(context: BrowserContext) {
  const state = { user: 'alice' as keyof typeof users, exchanges: 0, providers: [] as string[], signup: [] as boolean[], deny: false, failLogout: false, failExchange: false, refreshes: 0, profileName: '' }
  function user() {
    const selected = users[state.user]
    return {
      id: selected.id, email: selected.email, aud: 'authenticated', role: 'authenticated',
      app_metadata: { provider: 'google' }, user_metadata: { full_name: state.profileName || selected.name },
      created_at: '2026-01-01T00:00:00Z', identities: [],
    }
  }
  function tokens() {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ iss: authOrigin + '/auth/v1', sub: user().id, aud: 'authenticated', role: 'authenticated', exp })).toString('base64url'),
      'test-signature'].join('.')
    return { access_token: token, refresh_token: 'test-refresh-token', expires_in: 3600, expires_at: exp, token_type: 'bearer', user: user() }
  }

  await context.route(authOrigin + '/auth/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json' }
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return }
    if (url.pathname.endsWith('/authorize')) {
      state.providers.push(url.searchParams.get('provider')!)
      expect(url.searchParams.get('code_challenge_method')).toBe('s256')
      expect(url.searchParams.get('code_challenge')).toBeTruthy()
      const redirect = new URL(url.searchParams.get('redirect_to')!)
      expect(redirect.pathname).toBe('/auth/callback')
      redirect.search = state.deny ? '?error=access_denied&error_description=internal-details' : '?code=' + state.user + '-' + state.providers.length
      await route.fulfill({ status: 302, headers: { ...headers, location: redirect.toString() } })
      return
    }
    if (url.pathname.endsWith('/token')) {
      const body = request.postDataJSON()
      if (url.searchParams.get('grant_type') === 'refresh_token') state.refreshes++
      else {
        state.exchanges++
        expect(body.code_verifier).toBeTruthy()
      }
      await route.fulfill({ status: state.failExchange ? 400 : 200, headers,
        body: JSON.stringify(state.failExchange ? { error: 'invalid_grant', error_description: 'internal-details' } : tokens()) })
      return
    }
    if (url.pathname.endsWith('/user')) {
      if (request.method() === 'PUT') state.profileName = request.postDataJSON().data.full_name
      await route.fulfill({ status: 200, headers, body: JSON.stringify(user()) })
      return
    }
    if (url.pathname.endsWith('/otp')) {
      state.signup.push(request.postDataJSON().create_user)
      await route.fulfill({ status: 200, headers, body: '{}' })
      return
    }
    if (url.pathname.endsWith('/logout')) {
      await route.fulfill({ status: state.failLogout ? 503 : 204, headers,
        body: state.failLogout ? JSON.stringify({ message: 'internal-details' }) : undefined })
      return
    }
    await route.abort()
  })
  return state
}

async function signIn(page: Page, provider = 'Google', next = '/account') {
  await page.goto('/login?next=' + encodeURIComponent(next))
  await page.getByRole('button', { name: 'Continue with ' + provider }).click()
  await expect(page).toHaveURL(new RegExp(next.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&') + '$'))
}

async function signOut(page: Page, name = 'Alice Renter') {
  const menu = page.getByLabel('Account menu for ' + name)
  await menu.click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: 'Log In', exact: true })).toBeVisible()
}

for (const provider of ['Google', 'GitHub']) {
  test(provider + ' OAuth returns to the intended page and persists after refresh', async ({ context, page }) => {
    const state = await mockSupabase(context)
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login\?next=%2Faccount/)
    await page.getByRole('button', { name: 'Continue with ' + provider }).click()
    await expect(page).toHaveURL(/\/account$/)
    await expect(page.getByRole('heading', { name: 'Alice Renter' })).toBeVisible()
    expect(state.providers).toEqual([provider.toLowerCase()])
    expect(state.exchanges).toBe(1)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Alice Renter' })).toBeVisible()
    expect(state.exchanges).toBe(1)
    await signOut(page)
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login\?next=%2Faccount/)
  })
}

test('email signup and login use Supabase links and keep the intended destination', async ({ context, page }) => {
  const state = await mockSupabase(context)
  await page.goto('/signup?next=%2Faccount')
  await page.getByRole('textbox', { name: 'Email address' }).fill('alice@example.test')
  await page.getByRole('button', { name: 'Send signup link' }).click()
  await expect(page.getByRole('status')).toContainText('a sign-in link is on its way')
  expect(state.signup).toEqual([true])
  await page.goto('/auth/callback?code=email-signup')
  await expect(page).toHaveURL(/\/account$/)
  await signOut(page)
  await page.goto('/login?next=%2Fsaved')
  await page.getByRole('textbox', { name: 'Email address' }).fill('alice@example.test')
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(page.getByRole('status')).toContainText('a sign-in link is on its way')
  expect(state.signup).toEqual([true, false])
  await page.goto('/auth/callback?code=email-login')
  await expect(page).toHaveURL(/\/saved$/)
})

test('denied and expired callbacks show recoverable errors and never accept an external destination', async ({ context, page }) => {
  const state = await mockSupabase(context)
  state.deny = true
  await page.goto('/login?next=https%3A%2F%2Fevil.test')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page).toHaveURL(/\/login\?next=%2F&error=callback$/)
  await expect(page.getByRole('alert')).toContainText('cancelled')
  expect(state.exchanges).toBe(0)
  state.deny = false
  state.failExchange = true
  await page.getByRole('button', { name: 'Continue with GitHub' }).click()
  await expect(page).toHaveURL(/error=callback/)
  await expect(page.getByRole('alert')).toContainText('expired')
  await expect(page.getByText('internal-details')).toHaveCount(0)
  expect(state.exchanges).toBe(1)
})

test('demo saves stay separate for anonymous visitors and different authenticated users', async ({ context, page }) => {
  const state = await mockSupabase(context)
  await page.goto('/building/example-street')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()
  await signIn(page)
  await page.goto('/saved')
  await expect(page.getByRole('heading', { name: 'No saved properties yet' })).toBeVisible()
  await page.goto('/building/sample-avenue')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()
  await signOut(page)
  state.user = 'bob'
  await signIn(page, 'GitHub')
  await page.goto('/saved')
  await expect(page.getByRole('heading', { name: 'No saved properties yet' })).toBeVisible()
  await signOut(page, 'Bob Renter')
  await page.goto('/saved')
  await expect(page.getByRole('heading', { name: '123 Example Street' })).toBeVisible()
  state.user = 'alice'
  await signIn(page)
  await page.goto('/saved')
  await expect(page.getByRole('heading', { name: '48 Sample Avenue' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '123 Example Street' })).toHaveCount(0)
})

test('sign-out reports partial failure and successful sign-out updates other tabs', async ({ context, page }) => {
  const state = await mockSupabase(context)
  await signIn(page)
  const second = await context.newPage()
  await second.goto('/account')
  await expect(second.getByRole('heading', { name: 'Alice Renter' })).toBeVisible()
  state.failLogout = true
  await page.getByRole('button', { name: 'Sign out', exact: true }).last().click()
  await expect(page).toHaveURL(/\/login\?error=signout$/)
  await expect(page.getByRole('alert')).toContainText('signed out on this device')
  await expect(page.getByRole('heading', { name: 'Alice Renter' })).toHaveCount(0)
  state.failLogout = false
  await signIn(page)
  await second.goto('/account')
  await expect(second.getByRole('heading', { name: 'Alice Renter' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out', exact: true }).last().click()
  await expect(page).toHaveURL(/\/$/)
  await expect(second).toHaveURL(/\/login\?next=%2Faccount/)
})

test('token refresh and user updates refresh the account UI through SDK auth events', async ({ context, page }) => {
  const state = await mockSupabase(context)
  await signIn(page)
  state.profileName = 'Alice Renewed'
  await page.evaluate(async () => {
    const modulePath = '/src/lib/supabase.ts'
    const { getSupabase } = await import(modulePath)
    const { client } = getSupabase({ VITE_SUPABASE_URL: 'https://auth.hearthstone.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })
    const { error } = await client.auth.refreshSession()
    if (error) throw error
  })
  await expect(page.getByRole('heading', { name: 'Alice Renewed' })).toBeVisible()
  expect(state.refreshes).toBe(1)
  await page.evaluate(async () => {
    const modulePath = '/src/lib/supabase.ts'
    const { getSupabase } = await import(modulePath)
    const { client } = getSupabase({ VITE_SUPABASE_URL: 'https://auth.hearthstone.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })
    const { error } = await client.auth.updateUser({ data: { full_name: 'Alice Updated' } })
    if (error) throw error
  })
  await expect(page.getByRole('heading', { name: 'Alice Updated' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Alice Updated' })).toBeVisible()
})
