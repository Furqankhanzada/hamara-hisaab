import { describe, expect, it } from 'vitest'
import { json, makeUser, thisMonth } from '../helpers'

describe('reports + budgets', () => {
  it('computes monthly totals, category breakdown and budget status', async () => {
    const u = await makeUser()
    const m = thisMonth()
    await json('/api/v1/transactions', { key: u.key, json: { type: 'income', amount: 100000, category: 'Salary', occurred_on: `${m}-01` } })
    await json('/api/v1/transactions', { key: u.key, json: { type: 'expense', amount: 2500, category: 'Groceries', occurred_on: `${m}-02` } })
    await json('/api/v1/transactions', { key: u.key, json: { type: 'expense', amount: 1500, category: 'Fuel', occurred_on: `${m}-03` } })

    const cats = await json('/api/v1/categories', { key: u.key })
    const groc = cats.find((c: { name: string; kind: string }) => c.name === 'Groceries' && c.kind === 'expense')
    await json(`/api/v1/budgets/${groc.id}`, { method: 'PUT', key: u.key, json: { monthly_amount: 40000 } })

    const r = await json(`/api/v1/reports/monthly?month=${m}`, { key: u.key })
    expect(r.income).toBe(100000)
    expect(r.expense).toBe(4000)
    expect(r.net).toBe(96000)
    expect(r.by_category.find((c: { category: string }) => c.category === 'Groceries').total).toBe(2500)
    const b = r.budgets.find((x: { category: string }) => x.category === 'Groceries')
    expect(b.spent).toBe(2500)
    expect(b.remaining).toBe(37500)
  })

  it('overview periods bucket correctly, with previous-period comparison', async () => {
    const u = await makeUser()
    const week = await json('/api/v1/reports/overview?period=week', { key: u.key })
    expect(week.trend).toHaveLength(7)
    expect(week.granularity).toBe('day')
    expect(week.prev).toBeDefined()

    const year = await json('/api/v1/reports/overview?period=year', { key: u.key })
    expect(year.trend).toHaveLength(12)
    expect(year.granularity).toBe('month')
  })

  it('supports custom ranges with adaptive granularity', async () => {
    const u = await makeUser()
    const r = await json('/api/v1/reports/overview?from=2026-07-01&to=2026-07-18', { key: u.key })
    expect(r.period).toBe('custom')
    expect(r.granularity).toBe('day')
    expect(r.trend).toHaveLength(18)

    const long = await json('/api/v1/reports/overview?from=2026-01-01&to=2026-12-31', { key: u.key })
    expect(long.granularity).toBe('month')
    expect(long.trend).toHaveLength(12)
  })

  it('removing a budget with 0 clears it', async () => {
    const u = await makeUser()
    const cats = await json('/api/v1/categories', { key: u.key })
    const fuel = cats.find((c: { name: string; kind: string }) => c.name === 'Fuel' && c.kind === 'expense')
    await json(`/api/v1/budgets/${fuel.id}`, { method: 'PUT', key: u.key, json: { monthly_amount: 9000 } })
    expect(await json('/api/v1/budgets', { key: u.key })).toHaveLength(1)
    await json(`/api/v1/budgets/${fuel.id}`, { method: 'PUT', key: u.key, json: { monthly_amount: 0 } })
    expect(await json('/api/v1/budgets', { key: u.key })).toHaveLength(0)
  })
})
