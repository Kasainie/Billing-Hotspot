import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { customers, pppoeAccounts, radcheck } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getTenantSession(_request)
  if (!session) return NextResponse.json({ error: 'Sign in to view subscriber details.' }, { status: 401 })

  const { id } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Subscriber was not found.' }, { status: 404 })
  }

  try {
    const [customer] = await db.select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      phone: customers.phone,
      radiusUsername: customers.radiusUsername,
      status: customers.status,
      plan: customers.plan,
      monthlyRate: customers.monthlyRate,
      expiresAt: customers.expiresAt,
      createdAt: customers.createdAt,
    }).from(customers).where(and(
      eq(customers.id, id),
      eq(customers.tenantId, session.tenantId),
    )).limit(1)

    if (!customer) return NextResponse.json({ error: 'Subscriber was not found.' }, { status: 404 })
    const [account] = await db.select({ accountNumber: pppoeAccounts.accountNumber })
      .from(pppoeAccounts).where(and(
        eq(pppoeAccounts.customerId, customer.id),
        eq(pppoeAccounts.tenantId, session.tenantId),
      )).limit(1)
    const [credential] = customer.radiusUsername
      ? await db.select({ password: radcheck.value }).from(radcheck).where(and(
        eq(radcheck.username, customer.radiusUsername),
        eq(radcheck.tenantId, session.tenantId),
        eq(radcheck.attribute, 'Cleartext-Password'),
      )).limit(1)
      : []

    return NextResponse.json({
      ...customer,
      accountNumber: account ? String(account.accountNumber) : null,
      radiusPassword: credential?.password || null,
    }, { headers: { 'cache-control': 'no-store, private' } })
  } catch (error) {
    console.error('Failed to load tenant subscriber details', error)
    return NextResponse.json({ error: 'Unable to load subscriber details.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
