import { expect, test } from '@playwright/test'

type Weights = { maintenance: number; heat: number; pests: number; bedbugs: number; noise: number }

async function mountApiApp(page: import('@playwright/test').Page) {
  await page.goto('/account')
  await page.evaluate(async () => {
    // @ts-expect-error Vite serves browser modules directly.
    const { default: { createElement } } = await import('/node_modules/.vite/deps/react.js')
    // @ts-expect-error Vite serves browser modules directly.
    const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js')
    // @ts-expect-error Vite serves source modules directly.
    const { default: App } = await import('/src/app/App.tsx')
    // @ts-expect-error Vite serves source modules directly.
    const { createServices } = await import('/src/services/runtime.ts')
    const container = document.createElement('div')
    document.body.replaceChildren(container)
    createRoot(container).render(createElement(App, {
      services: createServices({ VITE_DATA_PROVIDER: 'api', VITE_API_BASE_URL: '/api' }, localStorage),
    }))
  })
}

test('asks a new account for priorities, saves them, and permits later edits', async ({ page }) => {
  let stored: Weights | null = null
  const writes: Weights[] = []
  await page.route('**/api/account', route => {
    if (route.request().method() === 'PATCH') {
      stored = route.request().postDataJSON() as Weights
      writes.push(stored)
      return route.fulfill({ json: { saved: true } })
    }
    return route.fulfill({ json: { email: 'renter@example.com', preferences: stored } })
  })
  await page.route('**/api/saved', route => route.fulfill({ json: { buildings: [], comparisons: [] } }))
  await mountApiApp(page)

  await expect(page.getByRole('heading', { name: 'Set your priorities' })).toBeVisible()
  await expect(page.getByRole('slider')).toHaveCount(5)
  for (const slider of await page.getByRole('slider').all()) {
    await slider.focus()
    await page.keyboard.press('Home')
  }
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByRole('alert')).toHaveText('Choose at least one priority above zero.')
  expect(writes).toHaveLength(0)
  await page.getByRole('slider', { name: 'Heat & hot water' }).focus()
  await page.keyboard.press('End')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/\/saved$/)
  expect(writes).toHaveLength(1)
  expect(writes[0].heat).toBe(5)

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Account' }).click()
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Heat & hot water' })).toHaveValue('5')
  await page.getByRole('slider', { name: 'Heat & hot water' }).focus()
  await page.keyboard.press('Home')
  await page.getByRole('slider', { name: 'Rats & pests' }).focus()
  await page.keyboard.press('End')
  await page.getByRole('button', { name: 'Save priorities' }).click()
  await expect(page.getByText('Your priorities were saved to your account.')).toBeVisible()
  expect(writes).toHaveLength(2)
  expect(writes[1].heat).toBe(0)
  expect(writes[1].pests).toBe(5)
})
