import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { customers, radcheck } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'
import { toFreeRadiusExpiration } from '@/lib/hotspot-products'

export async function PATCH(request: NextRequest, context: RouteContext<'/api/customers/[id]/status'>) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to update subscriber status.' }, { status: 401 })
  const { id } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Subscriber id is invalid.' }, { status: 400 })
  }
  let input: { status?: unknown; expiresAt?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Choose active or suspended status.' }, { status: 400 })
  }
  if (input.status !== 'active' && input.status !== 'suspended') {
    return NextResponse.json({ error: 'Choose active or suspended status.' }, { status: 400 })
  }

  try {
    const updated = await db.transaction(async (tx) => {
      const [customer] = await tx.select().from(customers).where(and(
        eq(customers.id, id),
        eq(customers.tenantId, session.tenantId),
      )).for('update').limit(1)
      if (!customer) return { error: 'Subscriber not found.', status: 404 as const }
      if (!customer.radiusUsername) return { error: 'Subscriber has no RADIUS login to update.', status: 409 as const }

      if (input.status === 'suspended') {
        await tx.delete(radcheck).where(and(
          eq(radcheck.tenantId, session.tenantId),
          eq(radcheck.username, customer.radiusUsername),
          eq(radcheck.attribute, 'Auth-Type'),
        ))
        await tx.insert(radcheck).values({
          tenantId: session.tenantId,
          username: customer.radiusUsername,
          attribute: 'Auth-Type',
          op: ':=',
          value: 'Reject',
        })
        const [row] = await tx.update(customers).set({ status: 'suspended' })
          .where(and(eq(customers.id, id), eq(customers.tenantId, session.tenantId))).returning()
        return { row }
      }

      const requestedExpiry = typeof input.expiresAt === 'string' ? new Date(input.expiresAt) : customer.expiresAt
      if (requestedExpiry && (!Number.isFinite(requestedExpiry.getTime()) || requestedExpiry.getTime() <= Date.now())) {
        return { error: 'Activation expiry must be a future date and time.', status: 400 as const }
      }
      if (!requestedExpiry && customer.expiresAt && customer.expiresAt.getTime() <= Date.now()) {
        return { error: 'Set a future expiry date to reactivate this expired subscriber.', status: 400 as const }
      }

      await tx.delete(radcheck).where(and(
        eq(radcheck.tenantId, session.tenantId),
        eq(radcheck.username, customer.radiusUsername),
        eq(radcheck.attribute, 'Auth-Type'),
        eq(radcheck.value, 'Reject'),
      ))
      if (requestedExpiry) {
        const [expirationRule] = await tx.select({ id: radcheck.id }).from(radcheck).where(and(
          eq(radcheck.tenantId, session.tenantId),
          eq(radcheck.username, customer.radiusUsername),
          eq(radcheck.attribute, 'Expiration'),
        )).limit(1)
        if (expirationRule) {
          await tx.update(radcheck).set({ value: toFreeRadiusExpiration(requestedExpiry), op: ':=' })
            .where(eq(radcheck.id, expirationRule.id))
        } else {
          await tx.insert(radcheck).values({
            tenantId: session.tenantId,
            username: customer.radiusUsername,
            attribute: 'Expiration',
            op: ':=',
            value: toFreeRadiusExpiration(requestedExpiry),
          })
        }
      }
      const [row] = await tx.update(customers).set({ status: 'active', expiresAt: requestedExpiry })
        .where(and(eq(customers.id, id), eq(customers.tenantId, session.tenantId))).returning()
      return { row }
    })

    if ('error' in updated) return NextResponse.json({ error: updated.error }, { status: updated.status })
    return NextResponse.json(updated.row)
  } catch (error) {
    console.error('Failed to update subscriber service status', error)
    return NextResponse.json({ error: 'Unable to update subscriber status.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
