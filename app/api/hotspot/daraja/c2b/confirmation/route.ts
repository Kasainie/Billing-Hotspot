import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { mobileMoneyTransactions } from '@/lib/db/schema'
import { resolvePublicTenantId } from '@/lib/db/tenant'
import { authorizeC2bCallback, parseC2bTransaction } from '@/lib/mobile-money-callback'
import { reconcilePppoeMobileMoney } from '@/lib/pppoe-reconciliation'

export async function POST(request: NextRequest) {
  const tenantId = await resolvePublicTenantId(request)
  if (!tenantId) return NextResponse.json({ ResultCode: '1', ResultDesc: 'Workspace not found.' }, { status: 404 })

  let payload: Record<string, unknown>
  try {
    payload = await request.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ ResultCode: '1', ResultDesc: 'Invalid payment callback.' }, { status: 400 })
  }

  try {
    const authorization = await authorizeC2bCallback(request, tenantId, payload)
    if (!authorization.ok) return NextResponse.json({ ResultCode: '1', ResultDesc: authorization.error }, { status: authorization.status })
    const transaction = parseC2bTransaction(payload)
    await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(mobileMoneyTransactions).values({
        tenantId,
        transactionId: transaction.transactionId,
        billReference: transaction.billReference,
        amount: transaction.amount,
        phone: transaction.phone,
        transactionAt: transaction.transactionAt,
        status: 'unmatched',
        matchReason: 'Payment received; checking PPPoE account reference and plan amount.',
        callbackPayload: payload,
      }).onConflictDoNothing({
        target: [mobileMoneyTransactions.tenantId, mobileMoneyTransactions.transactionId],
      }).returning({ id: mobileMoneyTransactions.id })

      if (!inserted) return

      const accountNumber = /^\d{1,10}$/.test(transaction.billReference) ? Number(transaction.billReference) : Number.NaN
      const result = Number.isSafeInteger(accountNumber)
        ? await reconcilePppoeMobileMoney(tx, {
            tenantId,
            accountNumber,
            amount: transaction.amount,
            transactionId: transaction.transactionId,
            paidAt: transaction.transactionAt || new Date(),
          })
        : { matched: false, customerId: null, reason: 'PayBill reference is not a PPPoE account number.' }

      await tx.update(mobileMoneyTransactions).set({
        status: result.matched ? 'matched' : 'unmatched',
        customerId: result.customerId,
        matchReason: result.reason,
      }).where(and(
        eq(mobileMoneyTransactions.id, inserted.id),
        eq(mobileMoneyTransactions.tenantId, tenantId),
      ))
    })
    return NextResponse.json({ ResultCode: '0', ResultDesc: 'Payment received.' })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid ')) {
      return NextResponse.json({ ResultCode: '1', ResultDesc: error.message }, { status: 400 })
    }
    console.error('Unable to reconcile C2B payment callback', error)
    return NextResponse.json({ ResultCode: '1', ResultDesc: 'Payment reconciliation failed.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
