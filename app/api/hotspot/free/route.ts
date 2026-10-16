import { randomBytes } from 'node:crypto'
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hotspotPurchases, packages, radcheck, radreply } from '@/lib/db/schema'
import { resolvePublicTenantId } from '@/lib/db/tenant'
import { toFreeRadiusExpiration, toHotspotRadiusReplies } from '@/lib/hotspot-products'

const allowedTypes = ['Hotspot', 'Bundle', 'Trial']
const publicHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
}

function publicJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: publicHeaders })
}

export async function POST(request: NextRequest) {
  let tenantId: string | null
  try {
    tenantId = await resolvePublicTenantId(request)
  } catch (error) {
    console.error('Failed to resolve workspace for free hotspot activation', error)
    return publicJson({ error: 'Unable to activate the free offer. Please try again or contact customer care.' }, 503)
  }
  if (!tenantId) return publicJson({ error: 'Workspace not found.' }, 404)
  let input: { packageId?: unknown; mac?: unknown }
  try {
    input = await request.json() as { packageId?: unknown; mac?: unknown }
  } catch {
    return publicJson({ error: 'Choose a free package to connect.' }, 400)
  }

  const packageId = typeof input.packageId === 'string' ? input.packageId : ''
  const clientMac = typeof input.mac === 'string' ? input.mac.trim().toUpperCase() : ''
  if (!/^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(clientMac)) {
    return publicJson({ error: 'Could not identify this device. Reopen the hotspot login page and try again.' }, 400)
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(packageId)) {
    return publicJson({ error: 'Choose a valid free package.' }, 400)
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
      const [recent] = await tx.select({
        id: hotspotPurchases.id,
        username: hotspotPurchases.radiusUsername,
        durationSeconds: hotspotPurchases.durationSeconds,
        paidAt: hotspotPurchases.paidAt,
        createdAt: hotspotPurchases.createdAt,
      }).from(hotspotPurchases).where(and(
        eq(hotspotPurchases.clientMac, clientMac),
        eq(hotspotPurchases.tenantId, tenantId),
        eq(hotspotPurchases.productId, plan.id),
        eq(hotspotPurchases.status, 'completed'),
        gt(hotspotPurchases.createdAt, since),
      )).orderBy(desc(hotspotPurchases.createdAt)).limit(1)
      if (recent) {
        const activatedAt = recent.paidAt || recent.createdAt
        const now = new Date()
        const offerExpiresAt = activatedAt.getTime() + recent.durationSeconds * 1000
        if (recent.username && offerExpiresAt > now.getTime()) {
          const [credentials] = await tx.select({ password: radcheck.value }).from(radcheck).where(and(
            eq(radcheck.tenantId, tenantId),
            eq(radcheck.username, recent.username),
            eq(radcheck.attribute, 'Cleartext-Password'),
          )).limit(1)
          if (credentials) return { purchaseId: recent.id, username: recent.username, password: credentials.password, reused: true }
          return { error: 'This device has already claimed today’s free offer, but its sign-in details could not be recovered. Contact your network operator.' }
        }

        const retryWindowOpen = now.getTime() - recent.createdAt.getTime() < 24 * 60 * 60 * 1000
        if (recent.username && retryWindowOpen) {
          const sessionResult = await tx.execute(sql`
            select exists (
              select 1
              from public.radacct
              where username = ${recent.username}
                and acctstarttime is not null
            ) as connected
          `)
          const hasConnected = sessionResult.rows[0]?.connected === true
          if (!hasConnected) {
            const [credentials] = await tx.select({ password: radcheck.value }).from(radcheck).where(and(
              eq(radcheck.tenantId, tenantId),
              eq(radcheck.username, recent.username),
              eq(radcheck.attribute, 'Cleartext-Password'),
            )).limit(1)
            if (credentials) {
              const retryExpiresAt = new Date(now.getTime() + recent.durationSeconds * 1000)
              await tx.update(hotspotPurchases).set({ paidAt: now }).where(and(
                eq(hotspotPurchases.id, recent.id),
                eq(hotspotPurchases.tenantId, tenantId),
              ))
              const [expirationCheck] = await tx.select({ id: radcheck.id }).from(radcheck).where(and(
                eq(radcheck.tenantId, tenantId),
                eq(radcheck.username, recent.username),
                eq(radcheck.attribute, 'Expiration'),
              )).limit(1)
              const expirationValue = toFreeRadiusExpiration(retryExpiresAt)
              if (expirationCheck) {
                await tx.update(radcheck).set({ op: ':=', value: expirationValue }).where(eq(radcheck.id, expirationCheck.id))
              } else {
                await tx.insert(radcheck).values({
                  tenantId,
                  username: recent.username,
                  attribute: 'Expiration',
                  op: ':=',
                  value: expirationValue,
                })
              }
              return { purchaseId: recent.id, username: recent.username, password: credentials.password, reused: true }
            }
          }
        }
        return { error: 'This device has already claimed today’s free offer.' }
      }

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
          fupUploadRate: plan.fupUploadRate,
          fupDownloadRate: plan.fupDownloadRate,
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

      return { purchaseId: purchase.id, username, password, reused: false }
    })

    if ('error' in result) return publicJson({ error: result.error }, 409)
    return publicJson(
      { id: result.purchaseId, username: result.username, password: result.password },
      result.reused ? 200 : 201,
    )
  } catch (error) {
    console.error('Failed to activate free hotspot offer', error)
    return publicJson({ error: 'Unable to activate the free offer. Please try again or contact customer care.' }, 503)
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