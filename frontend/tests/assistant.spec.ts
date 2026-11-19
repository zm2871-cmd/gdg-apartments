import { expect, test } from '@playwright/test'

// Render the real panel and API adapter through Vite; no live Gemini requests.
async function mountPanel(page: import('@playwright/test').Page, sample = false) {
  await page.goto('/')
  await page.evaluate(async sample => {
    // @ts-expect-error Vite serves browser modules directly.
    const { default: { createElement } } = await import('/node_modules/.vite/deps/react.js')
    // @ts-expect-error Vite serves browser modules directly.
    const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js')
    // @ts-expect-error Vite serves source modules directly.
    const { AssistantPanel } = await import('/src/components/AssistantPanel.tsx')
    // @ts-expect-error Vite serves source modules directly.
    const { ApiAssistantAdapter, ApiClient } = await import('/src/services/api.ts')
    const container = document.createElement('div')
    document.body.replaceChildren(container)
    const root = createRoot(container)
    root.render(createElement(AssistantPanel, {
      building: { id: 'canonical-building', address: 'Test building', borough: 'Brooklyn', sample },
      service: new ApiAssistantAdapter(new ApiClient('/api')),
    }))
    ;(window as unknown as { unmountAssistant: () => void }).unmountAssistant = () => root.unmount()
  }, sample)
  await page.locator('.assistant-panel summary').click()
}

test('renders Markdown and fallback labels, limits questions, and displays server errors', async ({ page }) => {
  const requests: unknown[] = []
  let count = 0
  await page.route('**/api/ai/advice', route => {
    requests.push(route.request().postDataJSON())
    count++
    return route.fulfill({ json: count === 3 ? { error: { message: 'Please retry later.' } } : {
      answer: '**Heat records**\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1)) [external](https://example.com) ![pixel](https://example.com/pixel.png)',
      fallback: count === 2, buildingId: 'canonical-building', checkedAt: '2026-11-19T12:00:00Z',
    }, status: count === 3 ? 429 : 200 })
  })
  await mountPanel(page)
  await expect(page.getByText(/Each question is answered independently/)).toBeVisible()
  const field = page.getByRole('textbox')
  await expect(field).toHaveAttribute('maxlength', '2000')
  for (const text of ['First question', 'Second question', 'Third question']) {
    await field.fill(text)
    await page.getByRole('button', { name: 'Send question' }).click()
    if (text !== 'Third question') await expect(field).toHaveValue('')
  }
  await expect(page.getByRole('alert')).toHaveText('Please retry later.')
  await expect(page.getByText('AI is unavailable. Showing a summary of retrieved records instead.')).toBeVisible()
  await expect(page.locator('.assistant-messages strong').filter({ hasText: 'Heat records' })).toHaveCount(2)
  await expect(page.locator('.assistant-messages script')).toHaveCount(0)
  await expect(page.locator('.assistant-messages a, .assistant-messages img')).toHaveCount(0)
  expect(requests).toEqual(['First question', 'Second question', 'Third question'].map(question => ({ buildingId: 'canonical-building', question })))
})

test('disables sample reports even with an enabled service', async ({ page }) => {
  await mountPanel(page, true)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByText(/currently unavailable for Test building/)).toBeVisible()
})

test('aborts pending requests when the panel unmounts', async ({ page }) => {
  await mountPanel(page)
  await page.evaluate(() => {
    window.fetch = (_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => {
        document.body.dataset.assistantAborted = 'true'
        reject(options.signal?.reason)
      })
    })
  })
  await page.getByRole('textbox').fill('Question')
  await page.getByRole('button', { name: 'Send question' }).click()
  await expect(page.getByRole('status')).toHaveText('Waiting for a response…')
  await page.evaluate(() => (window as unknown as { unmountAssistant: () => void }).unmountAssistant())
  await expect(page.locator('body')).toHaveAttribute('data-assistant-aborted', 'true')
})
