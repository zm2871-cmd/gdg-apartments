import { expect, test } from '@playwright/test'

test('explains missing Supabase configuration while public pages and mock saves remain usable', async ({ page }) => {
  await page.goto('/account')
  await expect(page).toHaveURL(/\/login\?next=%2Faccount/)
  await expect(page.getByRole('alert')).toContainText('Sign-in is not configured')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeDisabled()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Sign Up' }).click()
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await page.goto('/saved')
  await expect(page.getByRole('heading', { name: 'Saved properties', exact: true })).toBeVisible()
  await page.goto('/compare')
  await expect(page.getByRole('heading', { name: 'Compare buildings' })).toBeVisible()
})

test('strips callback errors and rejects an external return destination', async ({ page }) => {
  await page.goto('/auth/callback?error=access_denied&error_description=server-internals&next=https%3A%2F%2Fevil.test')
  await expect(page).toHaveURL(/\/login\?next=%2F&error=callback$/)
  await expect(page.getByText('The sign-in request was cancelled or could not be verified. Please try again.')).toBeVisible()
  await expect(page.getByText('server-internals')).toHaveCount(0)
})
