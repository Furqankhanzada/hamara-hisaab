import { expect, test } from '@playwright/test'
import { onboard, type } from './util'

test('add a manual asset, price it, share it, remove it', async ({ page }) => {
  await onboard(page)
  await page.getByRole('link', { name: 'Invest' }).click()
  await expect(page.getByText('No holdings yet')).toBeVisible()

  // add drawer: kind select is a Base UI combobox
  await page.getByRole('button', { name: 'Add holding' }).click()
  const kind = page.getByRole('combobox')
  await kind.click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.getByRole('option', { name: /Other asset/ }).click()
  await type(page.getByLabel('Name', { exact: true }), 'Gold set')
  await type(page.getByLabel('Units'), '1')
  await type(page.getByLabel('Avg cost / unit'), '100000')
  await page.getByRole('button', { name: 'Add holding' }).last().click()
  await expect(page.getByText('Holding added')).toBeVisible()
  await expect(page.getByText('Gold set')).toBeVisible()

  // manage drawer: rename the display name
  await page.getByText('Gold set').click()
  await type(page.getByLabel('Display name'), 'Gold jewellery')
  await page.getByRole('button', { name: 'Rename' }).click()
  await expect(page.getByText('Name updated')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Gold jewellery')).toBeVisible()

  // manage drawer: set a price → value + gain appear
  await page.getByText('Gold jewellery').click()
  await type(page.getByPlaceholder('per unit'), '120000')
  await page.getByRole('button', { name: 'Set', exact: true }).click()
  await expect(page.getByText('Price recorded')).toBeVisible()
  await expect(page.getByText('Rs 120,000').first()).toBeVisible()
  await expect(page.getByText('+Rs 20,000').first()).toBeVisible()

  // share switch: real state change
  await page.getByText('Gold jewellery').click()
  const share = page.getByRole('switch')
  await expect(share).not.toBeChecked()
  await share.click()
  await expect(page.getByText('Now visible to the household')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('shared', { exact: true })).toBeVisible()

  // remove via confirm dialog
  await page.getByText('Gold jewellery').click()
  await page.getByRole('button', { name: 'Remove holding' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByText('Remove Gold jewellery?')).toBeVisible()
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByText('Holding removed')).toBeVisible()
  await expect(page.getByText('No holdings yet')).toBeVisible()
})
