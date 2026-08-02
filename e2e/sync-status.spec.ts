import { expect, test } from '@playwright/test'
import { onboard, type } from './util'

async function addExpense(page: import('@playwright/test').Page, amount: string, note: string) {
  await page.getByRole('button', { name: 'Add entry' }).click()
  await type(page.getByLabel('Amount'), amount)
  await page.getByRole('combobox', { name: 'Category' }).click()
  await page.getByRole('option', { name: 'Groceries' }).click()
  await type(page.getByLabel('Note'), note)
  await page.getByRole('button', { name: 'Add expense' }).click()
  await expect(page.getByText('Expense added').first()).toBeVisible() // earlier toasts may still be up
  await page.keyboard.press('Escape')
}

/**
 * A dead server with a live network is the case that hid for three days: navigator.onLine stays
 * true, so the app claimed to be syncing. The device being offline and the server being gone are
 * different sentences now, and either way the queue is inspectable.
 */
test('server unreachable: the badge says so, and the queue is inspectable', async ({ page }) => {
  await onboard(page)
  await addExpense(page, '100', 'synced fine')
  await expect(page.getByText(/saved locally|Syncing/)).toHaveCount(0)

  // the network is up, the server is not — exactly what a down container looks like from the phone
  await page.route('**/api/v1/**', (route) => route.abort())

  await addExpense(page, '640', 'while server down')
  await expect(page.getByText('Saved on this device — it will sync when the server is back')).toBeVisible()
  // not "Offline" (the device is online) and not "Syncing" (nothing is being synced)
  await expect(page.getByText("Can't reach server — 1 saved locally")).toBeVisible()

  await addExpense(page, '75', 'also while down')
  await expect(page.getByText("Can't reach server — 2 saved locally")).toBeVisible()

  // tapping the badge answers "what exactly is waiting?"
  await page.getByRole('button', { name: /Can't reach server/ }).click()
  await expect(page.getByText('Waiting to sync (2)')).toBeVisible()
  await expect(page.getByText("They'll be sent automatically once the server is reachable")).toBeVisible()
  await expect(page.getByText('Expense · while server down')).toBeVisible()
  await expect(page.getByText('Expense · also while down')).toBeVisible()
  await expect(page.getByText('Rs 640')).toBeVisible()

  // discard the second one; it never reached the server, so it goes for good
  await page.getByRole('button', { name: 'Discard Expense · also while down' }).click()
  await page.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(page.getByText('Waiting to sync (1)')).toBeVisible()
  await expect(page.getByText('Expense · also while down')).toHaveCount(0)
  await page.keyboard.press('Escape')

  // server comes back: the survivor syncs, the discarded one is gone from the ledger too
  await page.unroute('**/api/v1/**')
  await page.getByRole('button', { name: /Can't reach server/ }).click()
  await page.getByRole('button', { name: 'Try again now' }).click()
  await expect(page.getByText(/saved locally|Syncing|reach server/)).toHaveCount(0, { timeout: 15_000 })

  const res = await page.request.get('/api/v1/transactions')
  const notes = ((await res.json()) as { note: string | null }[]).map((t) => t.note).sort()
  expect(notes).toEqual(['synced fine', 'while server down'])

  await page.reload()
  await page.getByRole('link', { name: 'Ledger' }).click()
  await expect(page.getByText('also while down')).toHaveCount(0) // the mirror rebuilt without it
})
