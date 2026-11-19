import { expect, test } from '@playwright/test'

const first = 'nyc-000000000000000000000001'
const second = 'nyc-000000000000000000000002'
const checkedAt = '2026-11-19T12:00:00.000Z'
const weights = { maintenance: 0, heat: 5, pests: 0, bedbugs: 0, noise: 0 }

function report(id: string) {
  return {
    identity: { id, address: id === first ? '1 First Street, Brooklyn, NY' : '2 Second Street, Brooklyn, NY',
      borough: 'Brooklyn', lat: 40.71, lng: -73.9, confidence: 'building', lotUnits: 20 },
    checkedAt, demo: false,
    records: id === first ? [{ id: 'violations:heat-1', source: 'HPD violations', category: 'heat',
      kind: 'violation', scope: 'building', date: checkedAt, status: 'Open',
      description: 'Heat violation reported', url: 'https://data.cityofnewyork.us/d/wvxf-dwi5' }] : [],
    coverage: [{ source: 'HPD violations', status: 'ok', checkedAt, count: id === first ? 1 : 0 }],
    scores: [],
  }
}

test('ranks selected saved buildings and shows the records behind the order', async ({ page }) => {
  const requests: unknown[] = []
  await page.route('**/api/account', route => route.fulfill({ json: { email: 'renter@example.com', preferences: weights } }))
  await page.route('**/api/saved', route => route.fulfill({ json: {
    buildings: [{ building_id: first }, { building_id: second }], comparisons: [],
  } }))
  await page.route('**/api/buildings/*', route => route.fulfill({ json: report(decodeURIComponent(route.request().url().split('/').at(-1)!)) }))
  await page.route('**/api/compare', route => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ json: {
      reports: [report(first), report(second)], common: ['heat'], missing: ['maintenance', 'pests', 'bedbugs', 'noise'],
      ranked: [{ id: first, value: 1 }, { id: second, value: 0 }], method: 'relative_shortlist',
      details: { status: 'ranked', reason: 'Relative order uses comparable official records.', categories: [{
        category: 'heat', comparable: true, reason: null, sources: ['HPD violations'], measure: 'per_100_units',
        values: [{ id: first, burden: 2, evidenceIds: ['violations:heat-1'] }, { id: second, burden: 0, evidenceIds: [] }],
      }] },
    } })
  })
  await page.goto('/compare')
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
  await expect(page.getByRole('heading', { name: 'Compare saved buildings' })).toBeVisible()
  await page.getByRole('button', { name: '1 First Street' }).click()
  await page.getByRole('button', { name: '2 Second Street' }).click()
  const summary = page.locator('.compare-summary')
  await expect(summary.getByRole('heading', { name: 'Your shortlist, based on recorded issues' })).toBeVisible()
  await expect(summary.getByText('Compared: Heat & hot water.')).toBeVisible()
  await expect(summary.getByText(/Left out:.*Nearby noise/)).toBeVisible()
  await expect(summary.locator('ol li').first()).toContainText('2 Second Street')
  await summary.getByText('How the ranking was calculated and what records support it').click()
  await expect(summary.getByText('Heat violation reported')).toBeVisible()
  await expect(summary.getByRole('link', { name: 'HPD violations' })).toHaveAttribute('href', 'https://data.cityofnewyork.us/d/wvxf-dwi5')
  expect(requests).toEqual([{ ids: [first, second], weights }])
})
