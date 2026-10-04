import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hotspotPurchases, radcheck } from '@/lib/db/schema'
import { resolvePublicTenantId } from '@/lib/db/tenant'

export async function GET(request: NextRequest, context: RouteContext<'/api/hotspot/purchases/[id]'>) {
  const tenantId = await resolvePublicTenantId(request)
  if (!tenantId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })
  const { id } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Payment session not found.' }, { status: 404 })
  }

  try {
    const [purchase] = await db.select({
      status: hotspotPurchases.status,
      productName: hotspotPurchases.productName,
      failureReason: hotspotPurchases.failureReason,
      radiusUsername: hotspotPurchases.radiusUsername,
      receipt: hotspotPurchases.receipt,
    }).from(hotspotPurchases).where(and(eq(hotspotPurchases.id, id), eq(hotspotPurchases.tenantId, tenantId))).limit(1)
    if (!purchase) return NextResponse.json({ error: 'Payment session not found.' }, { status: 404 })

    let password: string | null = null
    if (purchase.status === 'completed' && purchase.radiusUsername) {
      const [credential] = await db.select({ value: radcheck.value }).from(radcheck).where(and(
        eq(radcheck.username, purchase.radiusUsername),
        eq(radcheck.tenantId, tenantId),
        eq(radcheck.attribute, 'Cleartext-Password'),
      )).limit(1)
      password = credential?.value || null
    }

    return NextResponse.json({
      status: purchase.status,
      productName: purchase.productName,
      failureReason: purchase.failureReason,
      username: purchase.radiusUsername,
      password,
      receipt: purchase.receipt,
    }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to check payment status.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'