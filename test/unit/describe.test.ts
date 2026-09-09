import { describe, expect, it } from 'vitest'
import { describeEntry } from '../../web/src/local/describe'

// The queue is shown to a human deciding whether to wait or discard, so every queueable path
// needs to read as something they recognise doing — never a bare "POST /transactions".
describe('queued entry labels', () => {
  it('names a transaction by its note, falling back to the category', () => {
    expect(describeEntry('POST', '/transactions', { type: 'expense', amount: 555, note: 'milk run', category: 'Groceries' }))
      .toEqual({ label: 'Expense · milk run', amount: 555 })
    expect(describeEntry('POST', '/transactions', { type: 'income', amount: 75000, category: 'Salary' }))
      .toEqual({ label: 'Income · Salary', amount: 75000 })
    expect(describeEntry('DELETE', '/transactions/abc', {})).toEqual({ label: 'Deleted entry' })
  })

  it('names the loan payment that wedged the real queue', () => {
    expect(describeEntry('POST', '/loans/097e9b10/payments', { amount: 1600, paid_on: '2026-07-30' }))
      .toEqual({ label: 'Loan payment', amount: 1600 })
  })

  it('names loan ledger lines by what they are', () => {
    expect(describeEntry('POST', '/loans/097e9b10/payments', { amount: 50000, kind: 'advance' }))
      .toEqual({ label: 'Loan advance', amount: 50000 })
    expect(describeEntry('DELETE', '/loans/097e9b10/payments/abc', {})).toEqual({ label: 'Deleted loan line' })
    expect(describeEntry('DELETE', '/loans/097e9b10', {})).toEqual({ label: 'Deleted loan' })
    expect(describeEntry('PATCH', '/loans/097e9b10', { counterparty: 'Ahmed' })).toEqual({ label: 'Loan update' })
  })

  it('covers the rest of the queueable paths', () => {
    expect(describeEntry('POST', '/tags', { name: 'milk' }).label).toBe('Tag · milk')
    expect(describeEntry('POST', '/accounts', { name: 'Meezan', balance: 900 }))
      .toEqual({ label: 'Account · Meezan', amount: 900 })
    expect(describeEntry('PUT', '/budgets/cat-1', { monthly_amount: 5000 }))
      .toEqual({ label: 'Budget change', amount: 5000 })
    expect(describeEntry('POST', '/holdings', { instrument: { symbol: 'LUCK' } }).label).toBe('Investment · LUCK')
    expect(describeEntry('POST', '/prices', { price: 340 })).toEqual({ label: 'Price update', amount: 340 })
    expect(describeEntry('PATCH', '/zakat/settings', {}).label).toBe('Zakat settings')
  })

  it('falls back to method + path for anything newly queueable', () => {
    expect(describeEntry('POST', '/something/new?x=1', {})).toEqual({ label: 'POST /something/new' })
  })

  it('leaves amount undefined rather than NaN when the body has none', () => {
    expect(describeEntry('PATCH', '/transactions/abc', { note: 'just a note' }).amount).toBeUndefined()
  })
})
