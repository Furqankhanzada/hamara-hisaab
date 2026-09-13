import { and, eq, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { loanPayments, loans } from '../db/schema'
import { todayIn } from '../util'
import type { Ctx } from '../middleware'
import { visibilityInput } from './accounts'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const loanInput = z.object({
  id: z.string().uuid().optional().describe('Client-generated id — makes offline-sync replays idempotent'),
  counterparty: z.string().min(1).describe('Who the loan is with, e.g. "Ahmed bhai"'),
  direction: z.enum(['lent', 'borrowed']).describe("'lent' = they owe us, 'borrowed' = we owe them"),
  principal: z.coerce.number().positive().describe('Opening amount in PKR — lend more later with an advance instead of a second loan'),
  start_date: dateStr.optional().describe('Defaults to today'),
  due_date: dateStr.optional().describe('When it is expected back — overdue loans surface in the daily brief'),
  zakatable: z.boolean().default(true).describe('Counts in the zakat calculation — money lent as an asset, money borrowed as a deduction. Turn off for a debt you do not expect to see again.'),
  visibility: visibilityInput,
  note: z.string().optional().describe('What it was for, so the statement reads back later'),
})

export const loanUpdate = z.object({
  counterparty: z.string().min(1).optional(),
  principal: z.coerce.number().positive().optional().describe('Corrects the opening amount — does not add new money, use an advance for that'),
  start_date: dateStr.optional(),
  due_date: dateStr.nullable().optional().describe('null clears the due date'),
  note: z.string().optional(),
  status: z.enum(['open', 'settled']).optional().describe("'settled' closes it; any remainder counts as forgiven"),
  zakatable: z.boolean().optional().describe('Whether it counts in the zakat calculation'),
  visibility: z.enum(['shared', 'private']).optional(),
})

export const loanPaymentUpdate = z.object({
  amount: z.coerce.number().positive().optional(),
  kind: z.enum(['repayment', 'advance']).optional().describe('Fixes a line logged as the wrong type'),
  paid_on: dateStr.optional(),
  note: z.string().optional(),
})

const loanVisibleTo = (userId: string) => or(eq(loans.visibility, 'shared'), eq(loans.userId, userId))

export const loanPaymentInput = z.object({
  id: z.string().uuid().optional().describe('Client-generated id — makes offline-sync replays idempotent'),
  amount: z.coerce.number().positive().describe('Amount in PKR'),
  kind: z.enum(['repayment', 'advance']).default('repayment')
    .describe("'repayment' pays the loan down; 'advance' is more money lent/borrowed on the same loan"),
  paid_on: dateStr.optional().describe('Defaults to today'),
  note: z.string().optional().describe('What this line was, so the statement reads back later'),
})

export async function addLoan(ctx: Ctx, input: z.infer<typeof loanInput>) {
  const [row] = await db.insert(loans).values({
    id: input.id,
    householdId: ctx.householdId,
    userId: ctx.userId,
    counterparty: input.counterparty,
    direction: input.direction,
    principal: input.principal.toFixed(2),
    startDate: input.start_date ?? todayIn(ctx.timezone),
    dueDate: input.due_date,
    zakatable: input.zakatable,
    visibility: input.visibility,
    note: input.note,
  }).onConflictDoNothing().returning()
  if (!row) return getLoan(ctx, input.id!) // offline replay of an already-applied create
  return { ...row, paid: 0, advanced: 0, outstanding: Number(row.principal) }
}

type LoanRow = { [k: string]: unknown; id: string; status: string; outstanding: number }

/** Outstanding runs as a ledger: opening principal, plus later advances, less repayments. */
export async function listLoans(ctx: Ctx, status?: 'open' | 'settled') {
  const { rows } = await db.execute<LoanRow>(sql`
    select l.*, coalesce(p.paid, 0)::float8 as paid, coalesce(p.advanced, 0)::float8 as advanced,
           (l.principal + coalesce(p.advanced, 0) - coalesce(p.paid, 0))::float8 as outstanding
    from loans l
    left join (
      select loan_id,
             coalesce(sum(amount) filter (where kind = 'repayment'), 0) as paid,
             coalesce(sum(amount) filter (where kind = 'advance'), 0) as advanced
      from loan_payments group by loan_id) p on p.loan_id = l.id
    where l.household_id = ${ctx.householdId}
      and (l.visibility = 'shared' or l.user_id = ${ctx.userId})
      ${status ? sql`and l.status = ${status}` : sql``}
    order by l.start_date desc`)
  return rows
}

export async function getLoan(ctx: Ctx, id: string) {
  const all = await listLoans(ctx)
  const loan = all.find(l => l.id === id)
  if (!loan) return null
  const payments = await db.select().from(loanPayments).where(eq(loanPayments.loanId, id)).orderBy(loanPayments.paidOn)
  return { ...loan, payments }
}

export async function updateLoan(ctx: Ctx, id: string, patch: z.infer<typeof loanUpdate>) {
  const { principal, start_date, due_date, ...rest } = patch
  const [row] = await db.update(loans).set({
    ...rest,
    ...(principal !== undefined && { principal: principal.toFixed(2) }),
    ...(start_date !== undefined && { startDate: start_date }),
    ...(due_date !== undefined && { dueDate: due_date }),
  }).where(and(eq(loans.id, id), eq(loans.householdId, ctx.householdId), loanVisibleTo(ctx.userId))).returning()
  return row ? getLoan(ctx, id) : null
}

/** The loan row, only if it is visible to this user — the gate on every payment-level write. */
async function visibleLoan(ctx: Ctx, id: string) {
  const [loan] = await db.select().from(loans)
    .where(and(eq(loans.id, id), eq(loans.householdId, ctx.householdId), loanVisibleTo(ctx.userId)))
  return loan ?? null
}

export async function deleteLoan(ctx: Ctx, id: string) {
  if (!(await visibleLoan(ctx, id))) return false
  await db.delete(loans).where(eq(loans.id, id)) // loan_payments cascade
  return true
}

export async function addLoanPayment(ctx: Ctx, loanId: string, input: z.infer<typeof loanPaymentInput>) {
  const loan = await visibleLoan(ctx, loanId)
  if (!loan) return null
  await db.insert(loanPayments).values({
    id: input.id,
    loanId,
    amount: input.amount.toFixed(2),
    kind: input.kind,
    paidOn: input.paid_on ?? todayIn(ctx.timezone),
    note: input.note,
  }).onConflictDoNothing()
  // only new money revives a loan someone had written off; a late repayment leaves it settled
  return restatus(ctx, loanId, input.kind === 'advance')
}

export async function updateLoanPayment(ctx: Ctx, loanId: string, paymentId: string, patch: z.infer<typeof loanPaymentUpdate>) {
  if (!(await visibleLoan(ctx, loanId))) return null
  const { amount, paid_on, ...rest } = patch
  const [row] = await db.update(loanPayments).set({
    ...rest,
    ...(amount !== undefined && { amount: amount.toFixed(2) }),
    ...(paid_on !== undefined && { paidOn: paid_on }),
  }).where(and(eq(loanPayments.id, paymentId), eq(loanPayments.loanId, loanId))).returning()
  if (!row) return null
  return restatus(ctx, loanId, true)
}

export async function deleteLoanPayment(ctx: Ctx, loanId: string, paymentId: string) {
  if (!(await visibleLoan(ctx, loanId))) return null
  const [gone] = await db.delete(loanPayments)
    .where(and(eq(loanPayments.id, paymentId), eq(loanPayments.loanId, loanId))).returning()
  if (!gone) return null
  return restatus(ctx, loanId, true)
}

/** Settle or reopen after the statement changed. `revive` reopens a settled loan whose balance is
 *  back above zero — true for corrections (an edited or removed line), since the settle was based
 *  on figures that no longer exist. Re-settling is one tap; a wrong balance left standing is worse. */
async function restatus(ctx: Ctx, loanId: string, revive: boolean) {
  const updated = await getLoan(ctx, loanId)
  if (!updated) return null
  const outstanding = Number(updated.outstanding)
  if (updated.status === 'open' && outstanding <= 0) return setStatus(ctx, loanId, 'settled')
  if (updated.status === 'settled' && revive && outstanding > 0) return setStatus(ctx, loanId, 'open')
  return updated
}

async function setStatus(ctx: Ctx, id: string, status: 'open' | 'settled') {
  await db.update(loans).set({ status }).where(eq(loans.id, id))
  return getLoan(ctx, id)
}
