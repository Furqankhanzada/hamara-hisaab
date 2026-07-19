import { describe, expect, it } from 'vitest'
import { json, makeUser } from '../helpers'

describe('loans / qarz', () => {
  it('tracks repayments, auto-settles at zero, and derives forgiveness', async () => {
    const u = await makeUser()
    const loan = await json('/api/v1/loans', {
      key: u.key, json: { counterparty: 'Ahmed', direction: 'lent', principal: 50000 },
    })
    expect(loan.outstanding).toBe(50000)

    let after = await json(`/api/v1/loans/${loan.id}/payments`, { key: u.key, json: { amount: 20000 } })
    expect(after.outstanding).toBe(30000)
    expect(after.status).toBe('open')

    after = await json(`/api/v1/loans/${loan.id}/payments`, { key: u.key, json: { amount: 30000 } })
    expect(after.outstanding).toBe(0)
    expect(after.status).toBe('settled')
    expect(after.payments).toHaveLength(2)
  })

  it('settle with remainder = forgiven; reopen restores it', async () => {
    const u = await makeUser()
    const loan = await json('/api/v1/loans', {
      key: u.key, json: { counterparty: 'Bilal', direction: 'lent', principal: 30000 },
    })
    await json(`/api/v1/loans/${loan.id}/payments`, { key: u.key, json: { amount: 15000 } })
    await json(`/api/v1/loans/${loan.id}`, { method: 'PATCH', key: u.key, json: { status: 'settled' } })

    const settled = await json('/api/v1/loans?status=settled', { key: u.key })
    expect(settled[0].outstanding).toBe(15000) // the forgiven remainder

    await json(`/api/v1/loans/${loan.id}`, { method: 'PATCH', key: u.key, json: { status: 'open' } })
    const open = await json('/api/v1/loans?status=open', { key: u.key })
    expect(open).toHaveLength(1)
  })

  it('borrowed loans reduce the zakatable base', async () => {
    const u = await makeUser()
    await json('/api/v1/accounts', { key: u.key, json: { name: 'Cash', balance: 100000 } })
    await json('/api/v1/loans', { key: u.key, json: { counterparty: 'Bank', direction: 'borrowed', principal: 40000 } })
    const z = await json('/api/v1/zakat', { key: u.key })
    expect(z.zakatable_base).toBe(60000)
  })
})
