import { and, eq, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { accounts } from '../db/schema'
import type { Ctx } from '../middleware'

export const visibilityInput = z.enum(['shared', 'private'])
  .default('private')
  .describe("'private' = only you see it; 'shared' = visible to the whole household")

export const accountInput = z.object({
  name: z.string().min(1).describe("e.g. 'Meezan current account', 'Cash wallet'"),
  balance: z.coerce.number().min(0).default(0).describe('Current balance in PKR'),
  zakatable: z.boolean().default(true),
  visibility: visibilityInput,
})

export const accountUpdate = accountInput.partial()

/** shared items, your own items, and legacy unowned rows */
const visibleTo = (userId: string) =>
  or(eq(accounts.visibility, 'shared'), eq(accounts.userId, userId), isNull(accounts.userId))

export async function listAccounts(ctx: Ctx) {
  return db.select().from(accounts)
    .where(and(eq(accounts.householdId, ctx.householdId), visibleTo(ctx.userId)))
    .orderBy(accounts.name)
}

export async function addAccount(ctx: Ctx, input: z.infer<typeof accountInput>) {
  const [row] = await db.insert(accounts).values({
    householdId: ctx.householdId,
    userId: ctx.userId,
    name: input.name,
    balance: input.balance.toFixed(2),
    zakatable: input.zakatable,
    visibility: input.visibility,
  }).returning()
  return row
}

export async function updateAccount(ctx: Ctx, id: string, input: z.infer<typeof accountUpdate>) {
  const [row] = await db.update(accounts).set({
    name: input.name,
    balance: input.balance !== undefined ? input.balance.toFixed(2) : undefined,
    zakatable: input.zakatable,
    visibility: input.visibility,
    updatedAt: new Date(),
  }).where(and(eq(accounts.id, id), eq(accounts.householdId, ctx.householdId), visibleTo(ctx.userId))).returning()
  return row ?? null
}

export async function deleteAccount(ctx: Ctx, id: string) {
  const rows = await db.delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.householdId, ctx.householdId), visibleTo(ctx.userId)))
    .returning({ id: accounts.id })
  return rows.length > 0
}
