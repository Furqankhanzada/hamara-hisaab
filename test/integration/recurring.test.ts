import { describe, expect, it } from 'vitest'
import { json, makeUser } from '../helpers'

describe('recurring rules', () => {
  it('materializes a due rule exactly once (idempotent across runs)', async () => {
    const u = await makeUser()
    await json('/api/v1/recurring', {
      key: u.key,
      json: { type: 'expense', amount: 60000, description: 'Rent test', day_of_month: 1, category: 'Rent' },
    })

    const { materializeDueRules } = await import('../../src/services/recurring')
    await materializeDueRules()
    await materializeDueRules() // second run must be a no-op

    const txs = await json('/api/v1/transactions?q=Rent+test', { key: u.key })
    expect(txs).toHaveLength(1)
    expect(txs[0].source).toBe('recurring')
    expect(txs[0].amount).toBe('60000.00')
  })

  it('deactivated rules stop materializing', async () => {
    const u = await makeUser()
    const rule = await json('/api/v1/recurring', {
      key: u.key,
      json: { type: 'expense', amount: 100, description: 'Stopped rule', day_of_month: 1 },
    })
    await json(`/api/v1/recurring/${rule.id}`, { method: 'DELETE', key: u.key })

    const { materializeDueRules } = await import('../../src/services/recurring')
    await materializeDueRules()
    expect(await json('/api/v1/transactions?q=Stopped+rule', { key: u.key })).toHaveLength(0)
  })
})
