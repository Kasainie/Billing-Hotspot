import { and, desc, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { customers, mobileMoneyTransactions, payments, pppoeAccounts } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'
import { reconcilePppoeMobileMoney } from '@/lib/pppoe-reconciliation'

export async function GET(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to reconcile mobile-money payments.' }, { status: 401 })
  try {
    const [transactions, accounts, paymentLedger] = await Promise.all([
      db.select({
        id: mobileMoneyTransactions.id,
        transactionId: mobileMoneyTransactions.transactionId,
        billReference: mobileMoneyTransactions.billReference,
        amount: mobileMoneyTransactions.amount,
        phone: mobileMoneyTransactions.phone,
        transactionAt: mobileMoneyTransactions.transactionAt,
        status: mobileMoneyTransactions.status,
        matchReason: mobileMoneyTransactions.matchReason,
        createdAt: mobileMoneyTransactions.createdAt,
      }).from(mobileMoneyTransactions)
        .where(eq(mobileMoneyTransactions.tenantId, session.tenantId))
        .orderBy(desc(mobileMoneyTransactions.createdAt)).limit(200),
      db.select({
        accountNumber: pppoeAccounts.accountNumber,
        customerId: customers.id,
        name: customers.name,
        plan: customers.plan,
        monthlyRate: customers.monthlyRate,
      }).from(pppoeAccounts)
        .innerJoin(customers, eq(customers.id, pppoeAccounts.customerId))
        .where(and(eq(pppoeAccounts.tenantId, session.tenantId), eq(customers.tenantId, session.tenantId)))
        .orderBy(customers.name),
      db.select({
        id: payments.id,
        customerId: payments.customerId,
        amount: payments.amount,
        status: payments.status,
        method: payments.method,
        paidAt: payments.paidAt,
        reference: payments.reference,
        customerName: customers.name,
      }).from(payments)
        .leftJoin(customers, and(eq(customers.id, payments.customerId), eq(customers.tenantId, session.tenantId)))
        .where(eq(payments.tenantId, session.tenantId))
        .orderBy(desc(payments.paidAt)).limit(200),
    ])
    return NextResponse.json({ transactions, accounts, paymentLedger }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load mobile-money reconciliation records', error)
    return NextResponse.json({ error: 'Unable to load mobile-money transactions.' }, { status: 503 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to reconcile mobile-money payments.' }, { status: 401 })
  let input: { transactionId?: unknown; accountNumber?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Payment and customer account are required.' }, { status: 400 })
  }
  const transactionId = typeof input.transactionId === 'string' ? input.transactionId : ''
  const accountNumber = Number(input.accountNumber)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transactionId) ||
      !Number.isSafeInteger(accountNumber) || accountNumber < 1) {
    return NextResponse.json({ error: 'Payment or account number is invalid.' }, { status: 400 })
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [transaction] = await tx.select().from(mobileMoneyTransactions).where(and(
        eq(mobileMoneyTransactions.id, transactionId),
        eq(mobileMoneyTransactions.tenantId, session.tenantId),
      )).for('update').limit(1)
      if (!transaction) return { status: 404 as const, error: 'Payment transaction not found.' }
      if (transaction.status === 'matched') return { status: 409 as const, error: 'This payment has already been reconciled.' }

      const reconciliation = await reconcilePppoeMobileMoney(tx, {
        tenantId: session.tenantId,
        accountNumber,
        amount: transaction.amount,
        transactionId: transaction.transactionId,
        paidAt: transaction.transactionAt || transaction.createdAt,
      })
      if (!reconciliation.matched) {
        await tx.update(mobileMoneyTransactions).set({ matchReason: reconciliation.reason })
          .where(eq(mobileMoneyTransactions.id, transaction.id))
        return { status: 409 as const, error: reconciliation.reason || 'Payment could not be matched.' }
      }

      await tx.update(mobileMoneyTransactions).set({
        status: 'matched',
        customerId: reconciliation.customerId,
        matchReason: null,
      }).where(eq(mobileMoneyTransactions.id, transaction.id))
      return { status: 200 as const, customerId: reconciliation.customerId, expiresAt: reconciliation.expiresAt?.toISOString() }
    })

    if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ customerId: result.customerId, expiresAt: result.expiresAt })
  } catch (error) {
    console.error('Failed to reconcile mobile-money transaction', error)
    return NextResponse.json({ error: 'Unable to reconcile this payment.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
