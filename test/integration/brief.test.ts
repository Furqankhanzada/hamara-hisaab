import { describe, expect, it } from 'vitest'
import { json, makeUser, today } from '../helpers'

const shift = (s: string, days: number) => {
  const [y, m, d] = s.split('-').map(Number)
  const x = new Date(y, m - 1, d + days)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

describe('daily brief', () => {
  it('composes yesterday, month, budget warnings, upcoming bills, loans and zakat', async () => {
    const u = await makeUser()
    const t = today()
    const yesterday = shift(t, -1)

    await json('/api/v1/transactions', { key: u.key, json: { type: 'expense', amount: 3000, category: 'Groceries', note: 'sabzi', occurred_on: yesterday } })
    await json('/api/v1/transactions', { key: u.key, json: { type: 'expense', amount: 999, category: 'Fuel', occurred_on: t } })
    await json('/api/v1/transactions', { key: u.key, json: { type: 'income', amount: 200000, category: 'Salary', occurred_on: t.slice(0, 8) + '01' } })

    // over-budget category (Groceries busts a 2500 cap — date-independent) and a comfortable one (Fuel)
    const cats = await json('/api/v1/categories', { key: u.key })
    const idOf = (n: string) => cats.find((c: { name: string; kind: string }) => c.name === n && c.kind === 'expense').id
    await json(`/api/v1/budgets/${idOf('Groceries')}`, { method: 'PUT', key: u.key, json: { monthly_amount: 2500 } })
    await json(`/api/v1/budgets/${idOf('Fuel')}`, { method: 'PUT', key: u.key, json: { monthly_amount: 100000 } })

    // recurring rule due today (unmaterialized) + one far in the future
    const todayDay = Number(t.slice(8))
    await json('/api/v1/recurring', { key: u.key, json: { type: 'expense', amount: 55000, description: 'Rent brief', day_of_month: todayDay } })
    const farDay = todayDay <= 15 ? Math.min(todayDay + 20, 28) : Math.max(todayDay - 20, 1) // >7 days either direction
    await json('/api/v1/recurring', { key: u.key, json: { type: 'expense', amount: 1, description: 'Far away', day_of_month: farDay } })

    await json('/api/v1/loans', { key: u.key, json: { counterparty: 'A', direction: 'lent', principal: 40000 } })
    await json('/api/v1/loans', { key: u.key, json: { counterparty: 'B', direction: 'borrowed', principal: 15000 } })
    await json('/api/v1/zakat/settings', { method: 'PUT', key: u.key, json: { nisab_amount: 180000, next_due_date: shift(t, 10) } })

    const b = await json('/api/v1/reports/brief', { key: u.key })

    expect(b.date).toBe(t)
    expect(b.yesterday.total_spent).toBe(3000)
    expect(b.yesterday.entries).toHaveLength(1)
    expect(b.yesterday.entries[0].note).toBe('sabzi')

    // yesterday can fall in the previous month (on the 1st) — assert accordingly
    const sameMonth = yesterday.slice(0, 7) === t.slice(0, 7)
    expect(b.month_so_far.income).toBe(200000)
    expect(b.month_so_far.expense).toBe(sameMonth ? 3999 : 999)

    const warnCats = b.budgets.warnings.map((w: { category: string }) => w.category)
    if (sameMonth) {
      expect(warnCats).toContain('Groceries') // 3000 spent vs 2500 cap → over, regardless of date
      expect(b.budgets.warnings.find((w: { category: string }) => w.category === 'Groceries').status).toBe('over')
    }
    expect(warnCats).not.toContain('Fuel')

    expect(b.upcoming_bills.map((x: { description: string }) => x.description)).toEqual(['Rent brief'])
    expect(b.upcoming_bills[0].due_on).toBe(t)

    expect(b.loans).toEqual({ they_owe_us: 40000, we_owe: 15000 })
    expect(b.zakat_reminder).toBe(shift(t, 10))

    expect(b.text).toContain('Rs 3,000')
    expect(b.text).toContain('Rent brief')
    expect(b.text).toContain('Zakat')
  })

  it('handles an empty household gracefully', async () => {
    const u = await makeUser()
    const b = await json('/api/v1/reports/brief', { key: u.key })
    expect(b.yesterday.total_spent).toBe(0)
    expect(b.upcoming_bills).toEqual([])
    expect(b.loans).toEqual({ they_owe_us: 0, we_owe: 0 })
    expect(b.zakat_reminder).toBeNull()
    expect(b.text).toContain('no spending recorded')
  })
})
