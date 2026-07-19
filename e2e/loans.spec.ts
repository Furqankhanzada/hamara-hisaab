import { expect, test } from '@playwright/test'
import { onboard, type } from './util'

test('loan lifecycle: add, repay, settle with forgiveness, reopen', async ({ page }) => {
  await onboard(page)
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Open loans page' }).click()
  await expect(page.getByText('No open loans')).toBeVisible()

  // add drawer — direction select is a Base UI combobox
  await page.getByRole('button', { name: 'Add loan' }).click()
  const direction = page.getByRole('combobox')
  await direction.click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.getByRole('option', { name: 'I lent' }).click()
  await type(page.getByLabel('Amount'), '30000')
  await type(page.getByLabel('Person'), 'Ahmed bhai')
  await page.getByRole('button', { name: 'Add loan' }).last().click()
  await expect(page.getByText('Loan added')).toBeVisible()
  await expect(page.getByText('owes us')).toBeVisible()
  await expect(page.getByText('Rs 30,000').first()).toBeVisible()

  // statement drawer: record a repayment
  await page.getByText('Ahmed bhai').click()
  await expect(page.getByText('STATEMENT')).toBeVisible()
  await type(page.getByPlaceholder('Repayment amount'), '10000')
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(page.getByText('Repayment recorded')).toBeVisible()
  await expect(page.getByText('Received')).toBeVisible()
  await expect(page.getByText('Rs 20,000').first()).toBeVisible() // outstanding

  // settle with forgiveness via confirm dialog
  await page.getByRole('button', { name: 'Settle loan' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByText(/remaining Rs 20,000 will be marked as forgiven/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Settle' }).click()
  await expect(page.getByText('Loan settled')).toBeVisible()

  // settled view shows the forgiven amount; reopen brings it back
  await page.getByRole('button', { name: 'Settled' }).click()
  await expect(page.getByRole('button', { name: 'Settled', pressed: true })).toBeVisible()
  await expect(page.getByText(/forgave/)).toBeVisible()
  await page.getByText('Ahmed bhai').click()
  await page.getByRole('button', { name: 'Reopen loan' }).click()
  await expect(page.getByText('Loan reopened')).toBeVisible()
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.getByText('Ahmed bhai')).toBeVisible()
})
