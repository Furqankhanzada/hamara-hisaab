import { describe, expect, it } from 'vitest'
import { json, makeUser, today } from '../helpers'

describe('zakat + foreign-currency accounts', () => {
  it('computes 2.5% over converted assets minus borrowed debts', async () => {
    const u = await makeUser()
    // fixed manual rate so the math is deterministic (no external API in tests)
    await json('/api/v1/fx/rates', { key: u.key, json: { currency: 'AED', rate: 76, as_of: today() } })

    await json('/api/v1/accounts', { key: u.key, json: { name: 'Cash', balance: 100000 } })
    await json('/api/v1/accounts', { key: u.key, json: { name: 'Dubai acct', balance: 1000, currency: 'AED' } })
    await json('/api/v1/accounts', { key: u.key, json: { name: 'Car fund', balance: 50000, zakatable: false } })

    const sym = `Z${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    const holding = await json('/api/v1/holdings', {
      key: u.key, json: { instrument: { kind: 'other', name: `gold-${sym}` }, units: 2, avg_cost: 100000 },
    })
    await json('/api/v1/prices', { key: u.key, json: { instrument_id: holding.instrumentId, price: 110000 } })

    await json('/api/v1/loans', { key: u.key, json: { counterparty: 'X', direction: 'borrowed', principal: 26000 } })
    await json('/api/v1/zakat/settings', { key: u.key, method: 'PUT', json: { nisab_amount: 180000 } })

    const z = await json('/api/v1/zakat', { key: u.key })
    // 100000 + (1000×76) + (2×110000) − 26000 = 370,000 ; zakatable=false excluded
    expect(z.zakatable_base).toBe(370000)
    expect(z.above_nisab).toBe(true)
    expect(z.zakat_due).toBeCloseTo(9250, 2)

    const dubai = z.zakatable_assets.accounts.find((a: { name: string }) => a.name === 'Dubai acct')
    expect(dubai.currency).toBe('AED')
    expect(dubai.value).toBe(76000)
  })

  it('foreign accounts list both faces; manual rate wins immediately', async () => {
    const u = await makeUser()
    await json('/api/v1/fx/rates', { key: u.key, json: { currency: 'MYR', rate: 60 } })
    await json('/api/v1/accounts', { key: u.key, json: { name: 'KL acct', balance: 500, currency: 'MYR' } })

    let [acct] = (await json('/api/v1/accounts', { key: u.key })).filter((a: { name: string }) => a.name === 'KL acct')
    expect(acct.rate).toBe(60)
    expect(acct.base_balance).toBe(30000)

    await json('/api/v1/fx/rates', { key: u.key, json: { currency: 'MYR', rate: 65 } })
    ;[acct] = (await json('/api/v1/accounts', { key: u.key })).filter((a: { name: string }) => a.name === 'KL acct')
    expect(acct.base_balance).toBe(32500)
  })

  it('below nisab means no zakat due', async () => {
    const u = await makeUser()
    await json('/api/v1/accounts', { key: u.key, json: { name: 'Cash', balance: 1000 } })
    await json('/api/v1/zakat/settings', { key: u.key, method: 'PUT', json: { nisab_amount: 180000 } })
    const z = await json('/api/v1/zakat', { key: u.key })
    expect(z.above_nisab).toBe(false)
    expect(z.zakat_due).toBe(0)
  })
})
