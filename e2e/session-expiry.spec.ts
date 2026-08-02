import { expect, test } from '@playwright/test'
import { onboard, type } from './util'

/**
 * The wedge this guards against: a phone whose session had expired kept every queued write, so
 * refresh() answered 'pending' forever, so the app never learned it was signed out, so it sat on
 * "Syncing 2…" for days — showing stale data and never prompting for a login.
 */
test('expired session: queued writes survive, signing in drains them', async ({ page, context }) => {
  const email = await onboard(page)

  await page.getByRole('button', { name: 'Add entry' }).click()
  await type(page.getByLabel('Amount'), '640')
  await page.getByRole('combobox', { name: 'Category' }).click()
  await page.getByRole('option', { name: 'Groceries' }).click()
  await type(page.getByLabel('Note'), 'stranded entry')
  await page.getByRole('button', { name: 'Add expense' }).click()
  await expect(page.getByText('Expense added')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText(/saved locally|Syncing/)).toHaveCount(0) // this one synced fine

  // now queue a write with no server to take it, exactly like the reported case
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Add entry' }).click()
  await type(page.getByLabel('Amount'), '75')
  await page.getByRole('combobox', { name: 'Category' }).click()
  await page.getByRole('option', { name: 'Groceries' }).click()
  await type(page.getByLabel('Note'), 'queued while down')
  await page.getByRole('button', { name: 'Add expense' }).click()
  await expect(page.getByText('Expense added')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Offline — 1 saved locally')).toBeVisible()

  // the session dies while the write waits; the server comes back
  await context.clearCookies()
  await context.setOffline(false)
  await page.reload()

  // reopening must land on the login screen, not on a permanent "Syncing 1…"
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('1 change is saved on this device')).toBeVisible()

  await type(page.getByLabel('Email'), email)
  await type(page.getByLabel('Password'), 'password-123')
  await page.getByRole('button', { name: 'Sign in' }).click()

  // signed in again: the queue drains on its own and the entry reaches the server
  await expect(page.getByText('Net this month')).toBeVisible()
  await expect(page.getByText(/saved locally|Syncing/)).toHaveCount(0, { timeout: 15_000 })
  await expect
    .poll(async () => {
      const res = await page.request.get('/api/v1/transactions')
      const txs = (await res.json()) as { note: string | null }[]
      return txs.map((t) => t.note).sort()
    }, { timeout: 15_000 })
    .toEqual(['queued while down', 'stranded entry'])
})
