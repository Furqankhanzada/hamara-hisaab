import { expect, test } from '@playwright/test'
import { onboard, type } from './util'

const shift = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}

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

  // statement drawer: record a repayment, dated and described
  await page.getByText('Ahmed bhai').click()
  await expect(page.getByText('STATEMENT')).toBeVisible()
  await type(page.getByPlaceholder('Repayment amount'), '10000')
  await type(page.getByLabel('Description', { exact: true }), 'Raast transfer')
  await page.getByLabel('Date', { exact: true }).fill(shift(-5))
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(page.getByText('Repayment recorded')).toBeVisible()
  await expect(page.getByText(/Received — Raast transfer/)).toBeVisible()
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

test('one loan per person: lend more, correct it, drop a wrong line', async ({ page }) => {
  await onboard(page)
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Open loans page' }).click()

  // a loan that was already due back yesterday
  await page.getByRole('button', { name: 'Add loan' }).click()
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'I lent' }).click()
  await type(page.getByLabel('Amount'), '125000')
  await type(page.getByLabel('Person'), 'Amanulah')
  await type(page.getByLabel('Note'), 'Old loan given to friend')
  await page.getByLabel('Due back').fill(shift(-1))
  await page.getByRole('button', { name: 'Add loan' }).last().click()
  await expect(page.getByText('Loan added')).toBeVisible()
  await expect(page.getByText('overdue')).toBeVisible()

  await page.getByText('Amanulah').click()

  // the mode toggle is a real control: clicking it selects, and the amount placeholder follows
  const more = page.getByRole('button', { name: 'Lent more' })
  await more.click()
  await expect(more).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByPlaceholder('Amount given')).toBeVisible()

  await type(page.getByPlaceholder('Amount given'), '50000')
  await type(page.getByLabel('Description', { exact: true }), 'shop rent')
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(page.getByText('Added to the loan')).toBeVisible()
  await expect(page.getByText(/Lent more — shop rent/)).toBeVisible()
  await expect(page.getByText('Rs 175,000').first()).toBeVisible() // 125k + 50k, one record

  // correct that line in place: amount, date and description
  await page.getByRole('button', { name: /^Edit/ }).last().click()
  await type(page.getByLabel('Line amount'), '60000')
  await page.getByLabel('Line date').fill(shift(-2))
  await type(page.getByLabel('Line description'), 'shop rent + bijli')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Line updated')).toBeVisible()
  await expect(page.getByText(/Lent more — shop rent \+ bijli/)).toBeVisible()
  await expect(page.getByText('Rs 185,000').first()).toBeVisible() // 125k + 60k

  // fix the misspelled name, the description, and clear the due date
  await page.getByText('Edit details').click()
  await type(page.getByLabel('Person'), 'Amanullah Khan')
  await type(page.getByLabel('Loan description'), 'Old loan, now a shop float')
  await page.getByLabel('Due date').fill('')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Loan updated')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Amanullah Khan/ })).toBeVisible()
  await expect(page.getByText(/Old loan, now a shop float/)).toBeVisible()

  // the advance was a mistake — removing a line asks first, so a stray tap costs nothing
  await page.getByRole('button', { name: /^Remove/ }).last().click()
  const remove = page.getByRole('alertdialog')
  await expect(remove.getByText(/Lent more Rs 60,000/)).toBeVisible() // the edited amount
  await remove.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText(/Lent more — shop rent/)).toBeVisible() // still there

  await page.getByRole('button', { name: /^Remove/ }).last().click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('Line removed')).toBeVisible()
  await expect(page.getByText('Rs 125,000').first()).toBeVisible()

  // Home carries the balances too — the loans page is two taps deep
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByText('Qarz')).toBeVisible()
  await expect(page.getByText('Owed to us')).toBeVisible()
  await expect(page.getByText('Rs 125,000').first()).toBeVisible()
  await page.getByRole('link', { name: 'Open' }).click()
  await expect(page.getByRole('heading', { name: 'Loans / Qarz' })).toBeVisible()

  // money lent out counts as zakatable wealth
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByText('Breakdown').click()
  await expect(page.getByText('lent to Amanullah Khan')).toBeVisible()

  // …until you say it should not: the switch is a real control, so assert it flipped
  await page.getByRole('link', { name: 'Open loans page' }).click()
  await page.getByText('Amanullah Khan').first().click()
  const zakat = page.getByRole('switch', { name: /Counted for zakat/ })
  await expect(zakat).toHaveAttribute('aria-checked', 'true')
  await zakat.click()
  await expect(page.getByText('Excluded from zakat')).toBeVisible()
  await expect(zakat).toHaveAttribute('aria-checked', 'false')

  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByText('Breakdown').click()
  await expect(page.getByText('lent to Amanullah Khan')).toHaveCount(0)
})
