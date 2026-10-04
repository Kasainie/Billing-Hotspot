import { and, desc, eq, isNotNull, isNull, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hotspotPurchases, radcheck, radreply } from '@/lib/db/schema'
import { resolvePublicTenantId } from '@/lib/db/tenant'

const corsHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
}

export async function GET(request: NextRequest) {
  const tenantId = await resolvePublicTenantId(request)
  if (!tenantId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404, headers: corsHeaders })
  const clientMac = (request.nextUrl.searchParams.get('mac') || '').trim().toUpperCase()
  if (!/^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(clientMac)) {
    return NextResponse.json({ error: 'Device address is invalid.' }, { status: 400, headers: corsHeaders })
  }

  try {
    const purchases = await db.select({
      username: hotspotPurchases.radiusUsername,
      paidAt: hotspotPurchases.paidAt,
      durationSeconds: hotspotPurchases.durationSeconds,
    }).from(hotspotPurchases).where(and(
      eq(hotspotPurchases.clientMac, clientMac),
      eq(hotspotPurchases.tenantId, tenantId),
      eq(hotspotPurchases.status, 'completed'),
      isNotNull(hotspotPurchases.radiusUsername),
      isNotNull(hotspotPurchases.paidAt),
    )).orderBy(desc(hotspotPurchases.paidAt)).limit(50)

    const now = Date.now()
    const activePurchase = purchases.find((purchase) => purchase.paidAt && purchase.username &&
      purchase.paidAt.getTime() + purchase.durationSeconds * 1000 > now)
    if (!activePurchase?.username || !activePurchase.paidAt) {
      return NextResponse.json({ active: false }, { headers: corsHeaders })
    }

    const [credential] = await db.select({ password: radcheck.value }).from(radcheck).where(and(
      eq(radcheck.username, activePurchase.username),
      eq(radcheck.tenantId, tenantId),
      eq(radcheck.attribute, 'Cleartext-Password'),
    )).limit(1)
    if (!credential?.password) return NextResponse.json({ active: false }, { headers: corsHeaders })

    const expiresAt = new Date(activePurchase.paidAt.getTime() + activePurchase.durationSeconds * 1000)
    const remainingSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000))
    await db.update(radreply).set({ value: String(remainingSeconds) }).where(and(
      eq(radreply.username, activePurchase.username),
      eq(radreply.tenantId, tenantId),
      eq(radreply.attribute, 'Session-Timeout'),
    ))

    return NextResponse.json({
      active: true,
      username: activePurchase.username,
      password: credential.password,
    }, { headers: corsHeaders })
  } catch {
    return NextResponse.json({ error: 'Unable to check this device package.' }, { status: 503, headers: corsHeaders })
  }
}

export async function POST(request: NextRequest) {
  const tenantId = await resolvePublicTenantId(request)
  if (!tenantId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404, headers: corsHeaders })
  let input: { username?: unknown; mac?: unknown }
  try {
    input = JSON.parse(await request.text()) as { username?: unknown; mac?: unknown }
  } catch {
    return NextResponse.json({ error: 'Login details are invalid.' }, { status: 400, headers: corsHeaders })
  }

  const username = typeof input.username === 'string' ? input.username.trim() : ''
  const clientMac = typeof input.mac === 'string' ? input.mac.trim().toUpperCase() : ''
  if (!/^[a-zA-Z0-9._@-]{3,64}$/.test(username) || !/^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(clientMac)) {
    return NextResponse.json({ error: 'Login details are invalid.' }, { status: 400, headers: corsHeaders })
  }

  try {
    const bound = await db.transaction(async (tx) => {
      const [purchase] = await tx.select({
        id: hotspotPurchases.id,
        clientMac: hotspotPurchases.clientMac,
        paidAt: hotspotPurchases.paidAt,
        durationSeconds: hotspotPurchases.durationSeconds,
      }).from(hotspotPurchases).where(and(
        eq(hotspotPurchases.radiusUsername, username),
        eq(hotspotPurchases.tenantId, tenantId),
        eq(hotspotPurchases.status, 'completed'),
        isNotNull(hotspotPurchases.paidAt),
      )).for('update').limit(1)
      if (!purchase?.paidAt || purchase.paidAt.getTime() + purchase.durationSeconds * 1000 <= Date.now()) return false
      if (purchase.clientMac && purchase.clientMac !== clientMac) return false

      await tx.update(hotspotPurchases).set({ clientMac }).where(and(
        eq(hotspotPurchases.id, purchase.id),
        eq(hotspotPurchases.tenantId, tenantId),
        or(isNull(hotspotPurchases.clientMac), eq(hotspotPurchases.clientMac, clientMac)),
      ))
      return true
    })

    return NextResponse.json({ bound }, { status: bound ? 200 : 409, headers: corsHeaders })
  } catch {
    return NextResponse.json({ error: 'Unable to remember this device.' }, { status: 503, headers: corsHeaders })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    },
  })
}

export const dynamic = 'force-dynamic'