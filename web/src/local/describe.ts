// Plain-language names for queued writes, so "Syncing 2…" can say *what* the 2 are.
// No imports on purpose: this is pure, and the unit test runs it in node.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

/** A queued outbox entry rendered for humans; `amount` is formatted by the caller (base currency). */
export function describeEntry(method: string, path: string, body: Row): { label: string; amount?: number } {
  const p = path.split('?')[0]
  const num = (v: unknown) => (v == null ? undefined : Number(v))

  if (p === '/transactions' && method === 'POST') {
    const what = body.type === 'income' ? 'Income' : 'Expense'
    const detail = body.note || body.category || null
    return { label: detail ? `${what} · ${detail}` : what, amount: num(body.amount) }
  }
  if (/^\/transactions\/[^/]+$/.test(p))
    return method === 'DELETE' ? { label: 'Deleted entry' } : { label: 'Edited entry', amount: num(body.amount) }

  if (/^\/loans\/[^/]+\/payments$/.test(p))
    return { label: body.kind === 'advance' ? 'Loan advance' : 'Loan payment', amount: num(body.amount) }
  if (/^\/loans\/[^/]+\/payments\/[^/]+$/.test(p)) return { label: 'Deleted loan line' }
  if (p === '/loans') return { label: `Loan · ${body.counterparty ?? 'new'}`, amount: num(body.principal) }
  if (/^\/loans\/[^/]+$/.test(p))
    return method === 'DELETE' ? { label: 'Deleted loan' } : { label: 'Loan update' }

  if (p === '/accounts') return { label: `Account · ${body.name ?? 'new'}`, amount: num(body.balance) }
  if (/^\/accounts\/[^/]+$/.test(p))
    return method === 'DELETE' ? { label: 'Deleted account' } : { label: 'Account update', amount: num(body.balance) }

  if (p === '/holdings') return { label: `Investment · ${body.instrument?.symbol ?? body.instrument?.name ?? 'new'}` }
  if (/^\/holdings\/[^/]+$/.test(p))
    return method === 'DELETE' ? { label: 'Removed investment' } : { label: 'Investment update' }
  if (p === '/prices') return { label: 'Price update', amount: num(body.price) }
  if (/^\/instruments\/[^/]+$/.test(p)) return { label: 'Renamed investment' }

  if (/^\/budgets\/[^/]+$/.test(p)) return { label: 'Budget change', amount: num(body.monthly_amount) }
  if (p === '/recurring') return { label: `Recurring · ${body.description ?? 'new'}`, amount: num(body.amount) }
  if (/^\/recurring\/[^/]+$/.test(p)) return { label: 'Recurring update' }
  if (p === '/tags') return { label: `Tag · ${body.name ?? 'new'}` }
  if (p === '/zakat/settings') return { label: 'Zakat settings' }

  return { label: `${method} ${p}` } // anything newly queueable still shows up, just less prettily
}
