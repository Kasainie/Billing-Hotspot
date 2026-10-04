import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, packages, payments, pppoeAccounts, radcheck, radreply } from '@/lib/db/schema'
import { toFreeRadiusExpiration } from '@/lib/hotspot-products'

type BillingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function setRadcheckValue(tx: BillingTransaction, tenantId: string, username: string, attribute: string, value: string) {
  const [existing] = await tx.select({ id: radcheck.id }).from(radcheck).where(and(
    eq(radcheck.tenantId, tenantId),
    eq(radcheck.username, username),
    eq(radcheck.attribute, attribute),
  )).limit(1)
  if (existing) {
    await tx.update(radcheck).set({ value, op: ':=' }).where(eq(radcheck.id, existing.id))
  } else {
    await tx.insert(radcheck).values({ tenantId, username, attribute, op: ':=', value })
  }
}

export async function reconcilePppoeMobileMoney(
  tx: BillingTransaction,
  input: { tenantId: string; accountNumber: number; amount: number; transactionId: string; paidAt: Date },
) {
  const [account] = await tx.select().from(pppoeAccounts).where(and(
    eq(pppoeAccounts.tenantId, input.tenantId),
    eq(pppoeAccounts.accountNumber, input.accountNumber),
  )).for('update').limit(1)
  if (!account?.customerId) return { matched: false, customerId: null, reason: 'No active PPPoE subscription is linked to this account number.' }

  const [customer] = await tx.select().from(customers).where(and(
    eq(customers.tenantId, input.tenantId),
    eq(customers.id, account.customerId),
  )).for('update').limit(1)
  if (!customer?.radiusUsername || !customer.plan) return { matched: false, customerId: null, reason: 'The PPPoE account has no provisioned plan.' }
  if (customer.monthlyRate !== input.amount) return { matched: false, customerId: customer.id, reason: `Payment amount does not match the current KSh ${customer.monthlyRate} plan.` }

  const [plan] = await tx.select({
    durationSeconds: packages.durationSeconds,
    devicesPerAccount: packages.devicesPerAccount,
    rateLimit: packages.rateLimit,
    monthlyPrice: packages.monthlyPrice,
  }).from(packages).where(and(
    eq(packages.tenantId, input.tenantId),
    eq(packages.type, 'PPPoE'),
    eq(packages.name, customer.plan),
    eq(packages.monthlyPrice, input.amount),
  )).limit(1)
  if (!plan) return { matched: false, customerId: customer.id, reason: 'The customer’s current PPPoE plan could not be matched to this payment.' }

  const expiresAt = new Date(Math.max(customer.expiresAt?.getTime() || 0, input.paidAt.getTime()) + plan.durationSeconds * 1000)
  await setRadcheckValue(tx, input.tenantId, customer.radiusUsername, 'Expiration', toFreeRadiusExpiration(expiresAt))
  await setRadcheckValue(tx, input.tenantId, customer.radiusUsername, 'Simultaneous-Use', String(plan.devicesPerAccount))
  await tx.delete(radcheck).where(and(
    eq(radcheck.tenantId, input.tenantId),
    eq(radcheck.username, customer.radiusUsername),
    eq(radcheck.attribute, 'Auth-Type'),
    eq(radcheck.value, 'Reject'),
  ))
  await tx.delete(radreply).where(and(
    eq(radreply.tenantId, input.tenantId),
    eq(radreply.username, customer.radiusUsername),
    eq(radreply.attribute, 'Mikrotik-Rate-Limit'),
  ))
  await tx.insert(radreply).values({
    tenantId: input.tenantId,
    username: customer.radiusUsername,
    attribute: 'Mikrotik-Rate-Limit',
    op: '=',
    value: plan.rateLimit,
  })
  await tx.update(customers).set({ status: 'active', expiresAt, monthlyRate: plan.monthlyPrice })
    .where(and(eq(customers.id, customer.id), eq(customers.tenantId, input.tenantId)))
  await tx.insert(payments).values({
    tenantId: input.tenantId,
    customerId: customer.id,
    amount: input.amount,
    status: 'paid',
    method: 'M-Pesa PayBill',
    reference: input.transactionId,
    paidAt: input.paidAt,
  })
  return { matched: true, customerId: customer.id, reason: null, expiresAt }
}
