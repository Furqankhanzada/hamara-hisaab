import { describe, expect, it } from 'vitest'
import { json, makeUser, req, today } from '../helpers'

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
    // a loan with only plain repayments reads exactly as it did before advances existed
    expect(after.paid).toBe(50000)
    expect(after.advanced).toBe(0)
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

  it('lending more goes on the same statement as an advance', async () => {
    const u = await makeUser()
    const loan = await json('/api/v1/loans', {
      key: u.key, json: { counterparty: 'Amanullah', direction: 'lent', principal: 125000, note: 'Old loan given to friend' },
    })
    await json(`/api/v1/loans/${loan.id}/payments`, {
      key: u.key, json: { amount: 90000, paid_on: '2026-09-01', note: 'Raast transfer' },
    })
    let l = await json(`/api/v1/loans/${loan.id}`, { key: u.key })
    expect(l.outstanding).toBe(35000)

    l = await json(`/api/v1/loans/${loan.id}/payments`, {
      key: u.key, json: { amount: 50000, kind: 'advance', paid_on: '2026-09-05', note: 'shop rent' },
    })
    expect(l.advanced).toBe(50000)
    expect(l.paid).toBe(90000)
    expect(l.outstanding).toBe(85000) // 125000 + 50000 - 90000
    expect(l.payments).toHaveLength(2)
    expect(l.payments.find((p: { kind: string }) => p.kind === 'advance').note).toBe('shop rent')

    // repaying the whole running balance settles it, not just the opening principal
    l = await json(`/api/v1/loans/${loan.id}/payments`, { key: u.key, json: { amount: 85000 } })
    expect(l.outstanding).toBe(0)
    expect(l.status).toBe('settled')
  })

  it('an advance revives a settled loan', async () => {
    const u = await makeUser()
    const loan = await json('/api/v1/loans', { key: u.key, json: { counterparty: 'Kamran', direction: 'lent', principal: 10000 } })
    let l = await json(`/api/v1/loans/${loan.id}/payments`, { key: u.key, json: { amount: 10000 } })
    expect(l.status).toBe('settled')

    l = await json(`/api/v1/loans/${loan.id}/payments`, { key: u.key, json: { amount: 4000, kind: 'advance' } })
    expect(l.status).toBe('open')
    expect(l.outstanding).toBe(4000)

    // a plain repayment on a settled (forgiven) loan does not resurrect it
    const other = await json('/api/v1/loans', { key: u.key, json: { counterparty: 'Nadia', direction: 'lent', principal: 8000 } })
    await json(`/api/v1/loans/${other.id}`, { method: 'PATCH', key: u.key, json: { status: 'settled' } })
    const paid = await json(`/api/v1/loans/${other.id}/payments`, { key: u.key, json: { amount: 1000 } })
    expect(paid.status).toBe('settled')
  })

  it('corrects a mis-entered loan and deletes a wrong statement line', async () => {
    const u = await makeUser()
    const loan = await json('/api/v1/loans', { key: u.key, json: { counterparty: 'Amanulah', direction: 'lent', principal: 12500 } })

    const fixed = await json(`/api/v1/loans/${loan.id}`, {
      method: 'PATCH', key: u.key,
      json: { counterparty: 'Amanullah Khan', principal: 125000, start_date: '2026-08-22', due_date: '2026-12-31', note: 'shop float' },
    })
    expect(fixed.counterparty).toBe('Amanullah Khan')
    expect(fixed.outstanding).toBe(125000)
    expect(fixed.start_date).toBe('2026-08-22')
    expect(fixed.due_date).toBe('2026-12-31')
    expect(fixed.note).toBe('shop float')
    expect(await json(`/api/v1/loans/${loan.id}`, { method: 'PATCH', key: u.key, json: { due_date: null } })
      .then((l: { due_date: string | null }) => l.due_date)).toBeNull()

    // wrong repayment: delete it and the balance comes back
    const settled = await json(`/api/v1/loans/${loan.id}/payments`, { key: u.key, json: { amount: 125000 } })
    expect(settled.status).toBe('settled')
    const back = await json(`/api/v1/loans/${loan.id}/payments/${settled.payments[0].id}`, { method: 'DELETE', key: u.key })
    expect(back.status).toBe('open') // deleting the line that settled it reopens the loan
    expect(back.outstanding).toBe(125000)
    expect(back.payments).toHaveLength(0)
  })

  it('deletes a loan with its statement, and only for someone who can see it', async () => {
    const u = await makeUser()
    const loan = await json('/api/v1/loans', { key: u.key, json: { counterparty: 'Typo', direction: 'lent', principal: 100 } })
    await json(`/api/v1/loans/${loan.id}/payments`, { key: u.key, json: { amount: 40 } })

    const stranger = await makeUser()
    expect((await req(`/api/v1/loans/${loan.id}`, { method: 'DELETE', key: stranger.key })).status).toBe(404)
    expect((await req(`/api/v1/loans/${loan.id}/payments/x`, { method: 'DELETE', key: stranger.key })).status).toBe(404)

    expect(await json(`/api/v1/loans/${loan.id}`, { method: 'DELETE', key: u.key })).toEqual({ deleted: true })
    expect((await req(`/api/v1/loans/${loan.id}`, { key: u.key })).status).toBe(404)
    expect(await json('/api/v1/loans', { key: u.key })).toHaveLength(0)
  })

  it('corrects a statement line in place', async () => {
    const u = await makeUser()
    const loan = await json('/api/v1/loans', { key: u.key, json: { counterparty: 'Jhon', direction: 'lent', principal: 5000 } })
    const withLine = await json(`/api/v1/loans/${loan.id}/payments`, { key: u.key, json: { amount: 1000 } })
    const lineId = withLine.payments[0].id
    await json(`/api/v1/loans/${loan.id}/payments`, { key: u.key, json: { amount: 500, kind: 'advance' } })

    const fixed = await json(`/api/v1/loans/${loan.id}/payments/${lineId}`, {
      method: 'PATCH', key: u.key, json: { amount: 1200, paid_on: '2026-09-01', note: 'on naya pay' },
    })
    const line = fixed.payments.find((p: { id: string }) => p.id === lineId)
    expect(line.amount).toBe('1200.00')
    expect(line.paidOn).toBe('2026-09-01')
    expect(line.note).toBe('on naya pay')
    expect(fixed.outstanding).toBe(4300) // 5000 + 500 advance - 1200 repaid
    expect(fixed.payments).toHaveLength(2) // the other line is untouched

    // editing the balance to zero settles it, and editing it back up reopens it
    const settled = await json(`/api/v1/loans/${loan.id}/payments/${lineId}`, {
      method: 'PATCH', key: u.key, json: { amount: 5500 },
    })
    expect(settled.status).toBe('settled')
    const reopened = await json(`/api/v1/loans/${loan.id}/payments/${lineId}`, {
      method: 'PATCH', key: u.key, json: { amount: 1000 },
    })
    expect(reopened.status).toBe('open')
    expect(reopened.outstanding).toBe(4500)

    // a line on someone else's private loan is not editable
    const stranger = await makeUser()
    expect((await req(`/api/v1/loans/${loan.id}/payments/${lineId}`, {
      method: 'PATCH', key: stranger.key, json: { amount: 1 },
    })).status).toBe(404)
  })

  it('a loan can be kept out of the zakat calculation', async () => {
    const u = await makeUser()
    await json('/api/v1/accounts', { key: u.key, json: { name: 'Cash', balance: 100000 } })
    const lent = await json('/api/v1/loans', { key: u.key, json: { counterparty: 'Doubtful', direction: 'lent', principal: 30000 } })
    const borrowed = await json('/api/v1/loans', { key: u.key, json: { counterparty: 'Bank', direction: 'borrowed', principal: 40000 } })
    expect(lent.zakatable).toBe(true) // counted unless you say otherwise

    let z = await json('/api/v1/zakat', { key: u.key })
    expect(z.zakatable_base).toBe(90000)

    // a receivable you have written off stops being wealth — without pretending you forgave it
    await json(`/api/v1/loans/${lent.id}`, { method: 'PATCH', key: u.key, json: { zakatable: false } })
    z = await json('/api/v1/zakat', { key: u.key })
    expect(z.zakatable_assets.receivables).toEqual([])
    expect(z.zakatable_base).toBe(60000)
    // and it is still an open loan, still owed
    const open = await json('/api/v1/loans?status=open', { key: u.key })
    expect(open.map((l: { counterparty: string }) => l.counterparty).sort()).toEqual(['Bank', 'Doubtful'])

    // the flag works the same on the debt side — excluded means not deducted
    await json(`/api/v1/loans/${borrowed.id}`, { method: 'PATCH', key: u.key, json: { zakatable: false } })
    z = await json('/api/v1/zakat', { key: u.key })
    expect(z.deductible_debts).toEqual([])
    expect(z.zakatable_base).toBe(100000)

    // created excluded from the start
    const off = await json('/api/v1/loans', {
      key: u.key, json: { counterparty: 'Never', direction: 'lent', principal: 9000, zakatable: false },
    })
    expect(off.zakatable).toBe(false)
    z = await json('/api/v1/zakat', { key: u.key })
    expect(z.zakatable_base).toBe(100000)
  })

  it('overdue loans surface in the daily brief', async () => {
    const u = await makeUser()
    await json('/api/v1/loans', {
      key: u.key, json: { counterparty: 'Late', direction: 'lent', principal: 20000, due_date: '2020-01-01' },
    })
    await json('/api/v1/loans', {
      key: u.key, json: { counterparty: 'Fine', direction: 'lent', principal: 5000, due_date: today() },
    })
    const b = await json('/api/v1/reports/brief', { key: u.key })
    expect(b.loans.overdue.map((l: { counterparty: string }) => l.counterparty)).toEqual(['Late'])
    expect(b.text).toContain('Overdue qarz: Late Rs 20,000')
  })

  it('zakat: borrowed money comes off the base, lent money stays in it', async () => {
    const u = await makeUser()
    await json('/api/v1/accounts', { key: u.key, json: { name: 'Cash', balance: 100000 } })
    await json('/api/v1/loans', { key: u.key, json: { counterparty: 'Bank', direction: 'borrowed', principal: 40000 } })
    const lent = await json('/api/v1/loans', { key: u.key, json: { counterparty: 'Ahmed', direction: 'lent', principal: 30000 } })

    let z = await json('/api/v1/zakat', { key: u.key })
    expect(z.zakatable_assets.receivables).toEqual([{ counterparty: 'Ahmed', value: 30000 }])
    expect(z.deductible_debts).toEqual([{ counterparty: 'Bank', value: 40000 }])
    expect(z.zakatable_base).toBe(90000) // 100000 cash + 30000 owed to us - 40000 we owe

    // a repayment shrinks the receivable (the cash side is tracked separately)
    await json(`/api/v1/loans/${lent.id}/payments`, { key: u.key, json: { amount: 10000 } })
    z = await json('/api/v1/zakat', { key: u.key })
    expect(z.zakatable_base).toBe(80000)

    // forgiving what is left drops it out of the base entirely
    await json(`/api/v1/loans/${lent.id}`, { method: 'PATCH', key: u.key, json: { status: 'settled' } })
    z = await json('/api/v1/zakat', { key: u.key })
    expect(z.zakatable_assets.receivables).toEqual([])
    expect(z.zakatable_base).toBe(60000)
  })
})
