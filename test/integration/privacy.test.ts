import { describe, expect, it } from 'vitest'
import { inviteCodeOf, json, makeUser, req } from '../helpers'

describe('wealth privacy inside a household', () => {
  it('private wealth items are invisible and untouchable for the other member; shared ones visible', async () => {
    const a = await makeUser({ name: 'A' })
    const b = await makeUser({ inviteCode: await inviteCodeOf(a), name: 'B' })

    const priv = await json('/api/v1/accounts', { key: a.key, json: { name: 'A private', balance: 50000 } })
    await json('/api/v1/accounts', { key: a.key, json: { name: 'Joint', balance: 20000, visibility: 'shared' } })

    const bSees = await json('/api/v1/accounts', { key: b.key })
    expect(bSees.map((x: { name: string }) => x.name)).toEqual(['Joint'])

    // modifying an invisible account is a 404, not a forbidden hint
    expect((await req(`/api/v1/accounts/${priv.id}`, { method: 'PATCH', key: b.key, json: { balance: 1 } })).status).toBe(404)

    // zakat: B counts only Joint; A counts both
    expect((await json('/api/v1/zakat', { key: b.key })).zakatable_base).toBe(20000)
    expect((await json('/api/v1/zakat', { key: a.key })).zakatable_base).toBe(70000)
  })

  it('holdings: private by default, shared on demand', async () => {
    const a = await makeUser({ name: 'A' })
    const b = await makeUser({ inviteCode: await inviteCodeOf(a), name: 'B' })

    const sym = `T${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    const holding = await json('/api/v1/holdings', {
      key: a.key,
      json: { instrument: { kind: 'other', name: `asset-${sym}` }, units: 1, avg_cost: 1000 },
    })
    expect((await json('/api/v1/portfolio', { key: b.key })).holdings).toHaveLength(0)

    await json(`/api/v1/holdings/${holding.id}`, { method: 'PATCH', key: a.key, json: { visibility: 'shared' } })
    expect((await json('/api/v1/portfolio', { key: b.key })).holdings).toHaveLength(1)
  })

  it('the daily ledger stays fully shared', async () => {
    const a = await makeUser({ name: 'A' })
    const b = await makeUser({ inviteCode: await inviteCodeOf(a), name: 'B' })
    await json('/api/v1/transactions', { key: a.key, json: { type: 'expense', amount: 900, category: 'Fuel' } })
    expect(await json('/api/v1/transactions', { key: b.key })).toHaveLength(1)
  })
})
