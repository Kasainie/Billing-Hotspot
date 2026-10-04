import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { normalizeKenyanPhone } from '@/lib/daraja'
import { db } from '@/lib/db'
import { hotspotPurchases, radcheck } from '@/lib/db/schema'
import { resolvePublicTenantId } from '@/lib/db/tenant'

export async function GET(request: NextRequest) {
  const tenantId = await resolvePublicTenantId(request)
  if (!tenantId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })
  const phoneInput = request.nextUrl.searchParams.get('phone') || ''
  const receipt = (request.nextUrl.searchParams.get('receipt') || '').trim().toUpperCase()
  const phone = normalizeKenyanPhone(phoneInput)
  if (!phone || !/^[A-Z0-9]{8,20}$/.test(receipt)) {
    return NextResponse.json({ error: 'Enter the phone number and M-Pesa receipt used for payment.' }, { status: 400 })
  }

  try {
    const [purchase] = await db.select({ id: hotspotPurchases.id, username: hotspotPurchases.radiusUsername, receipt: hotspotPurchases.receipt })
      .from(hotspotPurchases)
      .where(and(
        eq(hotspotPurchases.phone, phone),
        eq(hotspotPurchases.tenantId, tenantId),
        eq(hotspotPurchases.receipt, receipt),
        eq(hotspotPurchases.status, 'completed'),
      ))
      .limit(1)
    if (!purchase?.username) return NextResponse.json({ error: 'No completed package matches those details.' }, { status: 404 })

    const [credential] = await db.select({ value: radcheck.value }).from(radcheck).where(and(
      eq(radcheck.username, purchase.username),
      eq(radcheck.tenantId, tenantId),
      eq(radcheck.attribute, 'Cleartext-Password'),
    )).limit(1)
    if (!credential) return NextResponse.json({ error: 'Could not retrieve that hotspot account. Contact customer care.' }, { status: 404 })

    return NextResponse.json({ username: purchase.username, password: credential.value, receipt: purchase.receipt }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to look up the payment right now.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'