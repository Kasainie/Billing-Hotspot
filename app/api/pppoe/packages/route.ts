import { and, asc, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { packages } from '@/lib/db/schema'
import { resolvePublicTenantId } from '@/lib/db/tenant'

export async function GET(request: NextRequest) {
  try {
    const tenantId = await resolvePublicTenantId(request)
    if (!tenantId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404, headers: { 'cache-control': 'no-store' } })
    const rows = await db.select({
      id: packages.id,
      name: packages.name,
      rateLimit: packages.rateLimit,
      monthlyPrice: packages.monthlyPrice,
      durationSeconds: packages.durationSeconds,
    }).from(packages).where(and(
      eq(packages.type, 'PPPoE'),
      eq(packages.tenantId, tenantId),
      eq(packages.availability, 'live'),
      eq(packages.listed, true),
      eq(packages.active, true),
    )).orderBy(asc(packages.monthlyPrice)).limit(100)
    return NextResponse.json(rows, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'PPPoE packages are temporarily unavailable.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
