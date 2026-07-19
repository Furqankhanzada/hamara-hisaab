import { expect, test } from '@playwright/test'
import { onboard, type } from './util'

test('theme toggle applies and persists', async ({ page }) => {
  await onboard(page)
  await page.getByRole('link', { name: 'More' }).click()

  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Dark', pressed: true })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/) // persisted

  await page.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('invite code rotates; API keys create and revoke', async ({ page }) => {
  await onboard(page)
  await page.getByRole('link', { name: 'More' }).click()

  const invite = page.locator('input[readonly]')
  const before = await invite.inputValue()
  await page.getByRole('button', { name: 'Rotate invite code' }).click()
  await expect(page.getByText('Invite code rotated')).toBeVisible()
  await expect(invite).not.toHaveValue(before)

  await type(page.getByPlaceholder(/Key name/), 'hermes-e2e')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByText(/Copy this key now/)).toBeVisible()
  await expect(page.getByText('hermes-e2e')).toBeVisible()

  await page.getByRole('button', { name: 'Revoke' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByText('Revoke "hermes-e2e"?')).toBeVisible()
  await dialog.getByRole('button', { name: 'Revoke' }).click()
  await expect(page.getByText('Key revoked')).toBeVisible()
})

test('accounts: add, edit balance inline, share; zakat reacts', async ({ page }) => {
  await onboard(page)
  await page.getByRole('link', { name: 'More' }).click()

  await type(page.getByPlaceholder('Account name'), 'Meezan current')
  await type(page.getByPlaceholder('0'), '100000')
  await page.getByRole('button', { name: 'Add account' }).click()
  await expect(page.getByText('Account added')).toBeVisible()

  // inline balance edit + share toggle inside the edit state
  await page.getByRole('button', { name: 'Rs 100,000' }).click()
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await expect(page.getByText('Now visible to the household')).toBeVisible()
  await expect(page.getByText('shared', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Rs 100,000' }).click()
  const balance = page.locator('form input[type="number"]').first()
  await type(balance, '120000')
  await page.getByRole('button', { name: 'Save', exact: true }).first().click()
  await expect(page.getByText('Meezan current updated')).toBeVisible()
  await expect(page.getByText('Rs 120,000').first()).toBeVisible()

  // zakat settings + computed summary
  await type(page.getByLabel('Nisab'), '50000')
  await page.getByRole('button', { name: 'Save' }).last().click()
  await expect(page.getByText('Zakat settings saved')).toBeVisible()
  await expect(page.getByText(/Zakat due:/)).toBeVisible()
  await expect(page.getByText('Rs 3,000').first()).toBeVisible() // 2.5% of 120,000
})

test('recurring rule: add and stop via confirm', async ({ page }) => {
  await onboard(page)
  await page.getByRole('link', { name: 'More' }).click()

  await type(page.getByPlaceholder('Description, e.g. Rent'), 'House rent')
  await type(page.getByPlaceholder('Amount Rs'), '55000')
  await type(page.getByPlaceholder('Day'), '5')
  await page.getByRole('button', { name: 'Add recurring' }).click()
  await expect(page.getByText('Recurring rule added')).toBeVisible()
  await expect(page.getByText('House rent')).toBeVisible()
  await expect(page.getByText('day 5')).toBeVisible()

  await page.getByRole('button', { name: 'Stop' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByText('Stop "House rent"?')).toBeVisible()
  await dialog.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByText('Recurring rule stopped')).toBeVisible()
  await expect(page.getByText('day 5')).toHaveCount(0)
})

test('sign out returns to the login screen', async ({ page }) => {
  await onboard(page)
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})
