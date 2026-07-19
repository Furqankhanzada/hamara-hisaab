import { expect, test } from '@playwright/test'
import { onboard, type } from './util'

test('onboarding → add expense via drawer → visible in ledger and dashboard', async ({ page }) => {
  await onboard(page)

  await page.getByRole('button', { name: 'Add entry' }).click()
  await type(page.getByLabel('Amount'), '1234')
  await page.getByRole('combobox', { name: 'Category' }).click()
  await page.getByRole('option', { name: 'Groceries' }).click()
  await type(page.getByLabel('Note'), 'e2e groceries run')
  await page.getByRole('button', { name: 'Add expense' }).click()
  await expect(page.getByText('Expense added')).toBeVisible()

  await page.getByRole('link', { name: 'Ledger' }).click()
  await expect(page.getByText('e2e groceries run')).toBeVisible()
  await expect(page.getByText('Rs 1,234').first()).toBeVisible()

  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByText('Net this month')).toBeVisible()
  await expect(page.getByText('Rs 1,234').first()).toBeVisible() // net = −1,234
  await expect(page.getByText('Groceries').first()).toBeVisible() // spending by category
})

test('currency select keeps focus and foreign entries land converted', async ({ page }) => {
  await onboard(page)
  await page.getByRole('button', { name: 'Add entry' }).click()

  // regression: InputGroup used to steal focus from the addon select, closing it instantly
  const currency = page.getByLabel('Currency')
  await currency.click()
  await expect(currency).toBeFocused()

  await currency.selectOption('USD')
  await type(page.getByLabel('Amount'), '5')
  await type(page.getByPlaceholder('auto'), '280') // manual rate: no network in tests
  await type(page.getByLabel('Note'), 'foreign entry')
  await page.getByRole('button', { name: 'Add expense' }).click()
  await expect(page.getByText('Expense added')).toBeVisible()

  await page.getByRole('link', { name: 'Ledger' }).click()
  await expect(page.getByText('Rs 1,400').first()).toBeVisible() // 5 × 280
  await expect(page.getByText('$5.00 @ 280.00')).toBeVisible()
})

test('edit an entry from the ledger', async ({ page }) => {
  await onboard(page)

  await page.getByRole('button', { name: 'Add entry' }).click()
  await type(page.getByLabel('Amount'), '500')
  await type(page.getByLabel('Note'), 'to be edited')
  await page.getByRole('button', { name: 'Add expense' }).click()
  await expect(page.getByText('Expense added')).toBeVisible()

  await page.getByRole('link', { name: 'Ledger' }).click()
  await page.getByText('to be edited').click()
  await type(page.getByLabel('Amount'), '750')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Entry updated')).toBeVisible()
  await expect(page.getByText('Rs 750').first()).toBeVisible()
})
