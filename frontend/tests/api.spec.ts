import { expect, test } from '@playwright/test'

// Real backend and pipeline database; see "Connect the existing backend" in README.md. Skipped unless E2E_API=1.
test.skip(process.env.E2E_API !== '1', 'Set E2E_API=1 with the Next backend running')

test('searches a real address and opens its pipeline report', async ({ page }) => {
  test.setTimeout(90_000) // the first view of a building ingests city data
  await page.goto('/')
  const input = page.getByRole('combobox', { name: 'NYC address' })
  await input.fill('281 Marcus Garvey Blvd')
  const option = page.getByRole('option', { name: /281 MARCUS GARVEY BOULEVARD/ }).first()
  await expect(option).toBeVisible({ timeout: 15_000 })
  await option.click()
  await expect(page).toHaveURL(/\/building\/3016290001/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: '281 MARCUS GARVEY BOULEVARD' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Data sources and coverage')).toBeVisible()
})
