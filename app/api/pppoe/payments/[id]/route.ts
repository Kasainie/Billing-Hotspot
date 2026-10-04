import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { customers, pppoeAccounts, pppoePayments, radcheck } from '@/lib/db/schema'
import { resolvePublicTenantId } from '@/lib/db/tenant'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const tenantId = await resolvePublicTenantId(request)
  if (!tenantId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })
  const { id } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Payment session not found.' }, { status: 404 })
  }

  try {
    const [payment] = await db.select({
      status: pppoePayments.status,
      productName: pppoePayments.productName,
      failureReason: pppoePayments.failureReason,
      receipt: pppoePayments.receipt,
      accountNumber: pppoePayments.accountNumber,
    }).from(pppoePayments).where(and(eq(pppoePayments.id, id), eq(pppoePayments.tenantId, tenantId))).limit(1)
    if (!payment) return NextResponse.json({ error: 'Payment session not found.' }, { status: 404 })

    let username: string | null = null
    let password: string | null = null
    if (payment.status === 'completed') {
      const [account] = await db.select({ customerId: pppoeAccounts.customerId })
        .from(pppoeAccounts).where(and(eq(pppoeAccounts.accountNumber, payment.accountNumber), eq(pppoeAccounts.tenantId, tenantId))).limit(1)
      if (account?.customerId) {
        const [customer] = await db.select({ radiusUsername: customers.radiusUsername }).from(customers)
          .where(and(eq(customers.id, account.customerId), eq(customers.tenantId, tenantId))).limit(1)
        username = customer?.radiusUsername || null
        if (username) {
          const [credential] = await db.select({ value: radcheck.value }).from(radcheck).where(and(
            eq(radcheck.username, username),
            eq(radcheck.tenantId, tenantId),
            eq(radcheck.attribute, 'Cleartext-Password'),
          )).limit(1)
          password = credential?.value || null
        }
      }
    }

    return NextResponse.json({
      status: payment.status,
      productName: payment.productName,
      failureReason: payment.failureReason,
      accountNumber: String(payment.accountNumber),
      username,
      password,
      receipt: payment.receipt,
    }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to check payment status.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
