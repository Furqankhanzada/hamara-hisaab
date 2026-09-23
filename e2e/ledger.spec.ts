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

  // filters are hidden until the toggle is opened
  await page.getByRole('button', { name: 'Toggle filters' }).click()

  // member filter chips: scoping to yourself keeps your entries; All restores
  await page.getByRole('button', { name: 'E2E', exact: true }).click()
  await expect(page.getByText('e2e groceries run')).toBeVisible()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.getByText('e2e groceries run')).toBeVisible()

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

test('infinite scroll streams older entries from the local mirror', async ({ page }) => {
  await onboard(page)

  // seed 120 entries straight through the API (page.request shares the session cookies),
  // one day apart so ordering is deterministic; entry 119 is the oldest
  for (let i = 0; i < 120; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    await page.request.post('/api/v1/transactions', {
      data: {
        type: 'expense', amount: 10 + i, category: 'Other',
        note: i === 119 ? 'very old entry' : `seed ${i}`,
        occurred_on: d.toLocaleDateString('en-CA'),
      },
    })
  }
  await page.reload() // pull the seeded snapshot into the local mirror

  await page.getByRole('link', { name: 'Ledger' }).click()
  await expect(page.getByText('seed 0', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('very old entry')).toHaveCount(0) // only page 1 rendered

  const sentinel = page.getByTestId('ledger-sentinel')
  for (let i = 0; i < 6 && (await page.getByText('very old entry').count()) === 0; i++) {
    await sentinel.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
  }
  await expect(page.getByText('very old entry')).toBeVisible()
})

test('tag filter chips narrow the ledger and clear from the local mirror', async ({ page }) => {
  await onboard(page)

  await page.request.post('/api/v1/tags', { data: { name: 'meat' } })
  await page.request.post('/api/v1/transactions', {
    data: { type: 'expense', amount: 500, category: 'Groceries', note: 'tagged entry', tags: ['meat'] },
  })
  await page.request.post('/api/v1/transactions', {
    data: { type: 'expense', amount: 250, category: 'Other', note: 'untagged entry' },
  })
  await page.reload() // pull the seeded snapshot into the local mirror

  await page.getByRole('link', { name: 'Ledger' }).click()
  await expect(page.getByText('tagged entry', { exact: true })).toBeVisible()
  await expect(page.getByText('untagged entry', { exact: true })).toBeVisible()

  // filters are hidden until the toggle is opened
  await page.getByRole('button', { name: 'Toggle filters' }).click()

  const meatChip = page.getByRole('button', { name: 'meat', exact: true })
  await expect(meatChip).toHaveAttribute('aria-pressed', 'false')
  await meatChip.click()
  await expect(meatChip).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('tagged entry', { exact: true })).toBeVisible()
  await expect(page.getByText('untagged entry', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'All', exact: true }).last().click()
  await expect(page.getByText('untagged entry', { exact: true })).toBeVisible()
})

test('filter icon toggles the member and tag chip rows', async ({ page }) => {
  await onboard(page)
  await page.request.post('/api/v1/tags', { data: { name: 'meat' } })
  await page.reload() // pull the seeded tag into the local mirror

  await page.getByRole('link', { name: 'Ledger' }).click()

  const toggle = page.getByRole('button', { name: 'Toggle filters' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'E2E', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'meat', exact: true })).toHaveCount(0)

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'E2E', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'meat', exact: true })).toBeVisible()

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'E2E', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'meat', exact: true })).toHaveCount(0)
})
