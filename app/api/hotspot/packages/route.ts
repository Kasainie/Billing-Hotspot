import { and, asc, eq, inArray } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { packages } from '@/lib/db/schema'
import { resolvePublicTenantId } from '@/lib/db/tenant'
import { toHotspotProduct } from '@/lib/hotspot-products'

export async function GET(request: NextRequest) {
  try {
    const tenantId = await resolvePublicTenantId(request)
    if (!tenantId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404, headers: { 'cache-control': 'no-store' } })
    const rows = await db.select({
      id: packages.id,
      name: packages.name,
      type: packages.type,
      availability: packages.availability,
      listed: packages.listed,
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
      scheduleEnabled: packages.scheduleEnabled,
      scheduleSpec: packages.scheduleSpec,
      nasRestrictions: packages.nasRestrictions,
    }).from(packages)
      .where(and(eq(packages.tenantId, tenantId), eq(packages.active, true), eq(packages.availability, 'live'), eq(packages.listed, true), inArray(packages.type, ['Hotspot', 'Bundle', 'Trial'])))
      .orderBy(asc(packages.monthlyPrice))
      .limit(100)

    return NextResponse.json(rows.map(toHotspotProduct), {
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Internet packages are temporarily unavailable.' }, {
      status: 503,
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    },
  })
}

export const dynamic = 'force-dynamic'