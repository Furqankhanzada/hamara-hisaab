import { expect, test } from '@playwright/test'
import { onboard, type } from './util'

test('set a budget and see the bar on the dashboard', async ({ page }) => {
  await onboard(page)

  // spend against Groceries first
  await page.getByRole('button', { name: 'Add entry' }).click()
  await type(page.getByLabel('Amount'), '2500')
  await page.getByRole('combobox', { name: 'Category' }).click()
  await page.getByRole('option', { name: 'Groceries' }).click()
  await page.getByRole('button', { name: 'Add expense' }).click()
  await expect(page.getByText('Expense added')).toBeVisible()

  await page.getByRole('link', { name: 'Home' }).click()
  await page.getByRole('link', { name: 'Edit' }).click()

  const groceriesRow = page.locator('form', { hasText: 'Groceries' }).first()
  await type(groceriesRow.getByRole('spinbutton'), '40000')
  await groceriesRow.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/capped at/)).toBeVisible()

  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByText('Rs 2,500').first()).toBeVisible()
  await expect(page.getByText('Rs 40,000').first()).toBeVisible()
})
