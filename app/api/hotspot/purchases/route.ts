import { and, count, eq, gt, inArray } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { initiateStkPush, normalizeKenyanPhone } from '@/lib/daraja'
import { db } from '@/lib/db'
import { hotspotPurchases, packages } from '@/lib/db/schema'
import { resolvePublicTenantId } from '@/lib/db/tenant'
import { getTenantDarajaConfiguration } from '@/lib/db/tenant-payments'
import { toHotspotProduct } from '@/lib/hotspot-products'

export async function POST(request: NextRequest) {
  const tenantId = await resolvePublicTenantId(request)
  if (!tenantId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })
  let darajaConfiguration
  try {
    darajaConfiguration = await getTenantDarajaConfiguration(tenantId)
  } catch (error) {
    console.error('Failed to load tenant Daraja configuration', error)
    return NextResponse.json({ error: 'Workspace payment credentials could not be loaded.' }, { status: 503 })
  }
  if (!darajaConfiguration) {
    return NextResponse.json({ error: 'M-Pesa payments are not available yet. Please contact customer care.' }, { status: 503 })
  }

  let input: { packageId?: unknown; phone?: unknown; mac?: unknown }
  try {
    input = await request.json() as { packageId?: unknown; phone?: unknown; mac?: unknown }
  } catch {
    return NextResponse.json({ error: 'Choose a package and enter your M-Pesa number.' }, { status: 400 })
  }

  const phone = typeof input.phone === 'string' ? normalizeKenyanPhone(input.phone) : null
  const packageId = typeof input.packageId === 'string' ? input.packageId : ''
  const clientMac = typeof input.mac === 'string' ? input.mac.trim().toUpperCase() : null
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(packageId) || !phone) {
    return NextResponse.json({ error: 'Choose an active package and enter a valid Kenyan M-Pesa number.' }, { status: 400 })
  }
  if (input.mac !== undefined && (!clientMac || !/^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(clientMac))) {
    return NextResponse.json({ error: 'Could not identify this device. Reopen the hotspot login page and try again.' }, { status: 400 })
  }

  try {
    const [plan] = await db.select({
      id: packages.id,
      name: packages.name,
      type: packages.type,
      downloadMbps: packages.downloadMbps,
      uploadMbps: packages.uploadMbps,
      rateLimit: packages.rateLimit,
      monthlyPrice: packages.monthlyPrice,
      durationSeconds: packages.durationSeconds,
      devicesPerAccount: packages.devicesPerAccount,
      burstLimit: packages.burstLimit,
      burstThreshold: packages.burstThreshold,
      burstTimeSeconds: packages.burstTimeSeconds,
      fupEnabled: packages.fupEnabled,
      fupLimitBytes: packages.fupLimitBytes,
      fupUploadRate: packages.fupUploadRate,
      fupDownloadRate: packages.fupDownloadRate,
      scheduleEnabled: packages.scheduleEnabled,
      scheduleSpec: packages.scheduleSpec,
      nasRestrictions: packages.nasRestrictions,
    }).from(packages).where(and(
      eq(packages.id, packageId),
      eq(packages.tenantId, tenantId),
      eq(packages.active, true),
      eq(packages.availability, 'live'),
      eq(packages.listed, true),
      inArray(packages.type, ['Hotspot', 'Bundle', 'Trial']),
    )).limit(1)
    if (!plan) return NextResponse.json({ error: 'This package is no longer available. Refresh the hotspot page.' }, { status: 404 })
    const product = toHotspotProduct(plan)

    const since = new Date(Date.now() - 60 * 60 * 1000)
    const [recent] = await db.select({ total: count() }).from(hotspotPurchases).where(and(
      eq(hotspotPurchases.phone, phone),
      eq(hotspotPurchases.tenantId, tenantId),
      gt(hotspotPurchases.createdAt, since),
      inArray(hotspotPurchases.status, ['initiating', 'pending']),
    ))
    if ((recent?.total || 0) >= 3) {
      return NextResponse.json({ error: 'There are already several payment prompts for this number. Wait a few minutes or contact customer care.' }, { status: 429 })
    }

    const [purchase] = await db.insert(hotspotPurchases).values({
      tenantId,
      productId: product.id,
      productName: product.name,
      durationSeconds: product.durationSeconds,
      amount: product.price,
      phone,
      clientMac,
      packageSnapshot: {
        type: plan.type,
        rateLimit: product.rateLimit,
        devicesPerAccount: product.devicesPerAccount,
        burstLimit: product.burstLimit,
        burstThreshold: product.burstThreshold,
        burstTimeSeconds: product.burstTimeSeconds,
        fupEnabled: product.fupEnabled,
        fupLimitBytes: product.fupLimitBytes,
        fupUploadRate: product.fupUploadRate,
        fupDownloadRate: product.fupDownloadRate,
        scheduleEnabled: product.scheduleEnabled,
        scheduleSpec: product.scheduleSpec,
        nasRestrictions: product.nasRestrictions,
      },
      status: 'initiating',
    }).returning({ id: hotspotPurchases.id })

    try {
      const stk = await initiateStkPush({
        phone,
        amount: product.price,
        purchaseId: purchase.id,
        productName: product.name,
        configuration: darajaConfiguration,
      })
      await db.update(hotspotPurchases).set({
        status: 'pending',
        merchantRequestId: stk.merchantRequestId,
        checkoutRequestId: stk.checkoutRequestId,
      }).where(and(eq(hotspotPurchases.id, purchase.id), eq(hotspotPurchases.tenantId, tenantId)))
      return NextResponse.json({ id: purchase.id, status: 'pending', message: stk.customerMessage }, { status: 202, headers: { 'cache-control': 'no-store' } })
    } catch (error) {
      await db.update(hotspotPurchases).set({ status: 'failed', failureReason: error instanceof Error ? error.message.slice(0, 180) : 'Unable to start payment.' }).where(and(eq(hotspotPurchases.id, purchase.id), eq(hotspotPurchases.tenantId, tenantId)))
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start M-Pesa payment.' }, { status: 502 })
    }
  } catch {
    return NextResponse.json({ error: 'M-Pesa checkout is unavailable. Please try again later.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'