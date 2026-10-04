import { randomBytes } from 'node:crypto'
import { and, count, eq, gt, inArray, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hotspotPurchases, packages, radcheck, radreply } from '@/lib/db/schema'
import { resolvePublicTenantId } from '@/lib/db/tenant'
import { toFreeRadiusExpiration, toHotspotRadiusReplies } from '@/lib/hotspot-products'

const allowedTypes = ['Hotspot', 'Bundle', 'Trial']

export async function POST(request: NextRequest) {
  const tenantId = await resolvePublicTenantId(request)
  if (!tenantId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })
  let input: { packageId?: unknown; mac?: unknown }
  try {
    input = await request.json() as { packageId?: unknown; mac?: unknown }
  } catch {
    return NextResponse.json({ error: 'Choose a free package to connect.' }, { status: 400 })
  }

  const packageId = typeof input.packageId === 'string' ? input.packageId : ''
  const clientMac = typeof input.mac === 'string' ? input.mac.trim().toUpperCase() : ''
  if (!/^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(clientMac)) {
    return NextResponse.json({ error: 'Could not identify this device. Reopen the hotspot login page and try again.' }, { status: 400 })
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(packageId)) {
    return NextResponse.json({ error: 'Choose a valid free package.' }, { status: 400 })
  }

  const sourceIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${clientMac}))`)
      const [plan] = await tx.select().from(packages).where(and(
        eq(packages.id, packageId),
        eq(packages.tenantId, tenantId),
        eq(packages.monthlyPrice, 0),
        eq(packages.active, true),
        eq(packages.availability, 'live'),
        eq(packages.listed, true),
        inArray(packages.type, allowedTypes),
      )).limit(1)
      if (!plan) return { error: 'This free offer is no longer available. Refresh the hotspot page.' }

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const [recent] = await tx.select({ total: count() }).from(hotspotPurchases).where(and(
        eq(hotspotPurchases.clientMac, clientMac),
        eq(hotspotPurchases.tenantId, tenantId),
        eq(hotspotPurchases.productId, plan.id),
        eq(hotspotPurchases.status, 'completed'),
        gt(hotspotPurchases.createdAt, since),
      ))
      if ((recent?.total || 0) >= 1) return { error: 'This device has already claimed today’s free offer.' }

      const username = `free${randomBytes(6).toString('hex')}`
      const password = randomBytes(12).toString('hex')
      const paidAt = new Date()
      const [purchase] = await tx.insert(hotspotPurchases).values({
        tenantId,
        productId: plan.id,
        productName: plan.name,
        durationSeconds: plan.durationSeconds,
        amount: 0,
        phone: null,
        sourceIp,
        clientMac,
        packageSnapshot: {
          type: plan.type,
          rateLimit: plan.rateLimit,
          devicesPerAccount: plan.devicesPerAccount,
          burstLimit: plan.burstLimit,
          burstThreshold: plan.burstThreshold,
          burstTimeSeconds: plan.burstTimeSeconds,
          fupEnabled: plan.fupEnabled,
          fupLimitBytes: plan.fupLimitBytes,
          scheduleEnabled: plan.scheduleEnabled,
          scheduleSpec: plan.scheduleSpec,
          nasRestrictions: plan.nasRestrictions,
        },
        status: 'completed',
        radiusUsername: username,
        paidAt,
      }).returning({ id: hotspotPurchases.id })

      const checks = [
        { tenantId, username, attribute: 'Cleartext-Password', op: ':=', value: password },
        { tenantId, username, attribute: 'Simultaneous-Use', op: ':=', value: String(plan.devicesPerAccount) },
        { tenantId, username, attribute: 'Expiration', op: ':=', value: toFreeRadiusExpiration(new Date(paidAt.getTime() + plan.durationSeconds * 1000)) },
      ]
      if (plan.scheduleEnabled && plan.scheduleSpec) checks.push({ tenantId, username, attribute: 'Login-Time', op: '==', value: plan.scheduleSpec })
      if (plan.nasRestrictions.length) {
        const nasPattern = plan.nasRestrictions.map((address) => address.replace(/\./g, '\\.')).join('|')
        checks.push({ tenantId, username, attribute: 'NAS-IP-Address', op: '=~', value: `^(${nasPattern})$` })
      }
      await tx.insert(radcheck).values(checks)

      const replies = toHotspotRadiusReplies(username, plan).map((reply) => ({ ...reply, tenantId }))
      await tx.insert(radreply).values(replies)

      return { purchaseId: purchase.id, username, password }
    })

    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 409 })
    return NextResponse.json({ id: result.purchaseId, username: result.username, password: result.password }, {
      status: 201,
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'Unable to activate the free offer. Please try again or contact customer care.' }, { status: 503 })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    },
  })
}

export const dynamic = 'force-dynamic'