import { sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantSession } from '@/lib/db/tenant'

function tenantHotspotUserFilter(tenantId: string) {
  return sql`(
    exists (
      select 1
      from public.hotspot_purchases as purchase
      where purchase.tenant_id = ${tenantId}
        and purchase.radius_username = accounting.username
        and purchase.status = 'completed'
    )
    or exists (
      select 1
      from public.vouchers as voucher
      inner join public.packages as plan
        on plan.id = voucher.package_id
        and plan.tenant_id = voucher.tenant_id
      where voucher.tenant_id = ${tenantId}
        and voucher.username = accounting.username
        and plan.type in ('Hotspot', 'Bundle', 'Trial')
    )
    or exists (
      select 1
      from public.customers as customer
      inner join public.packages as plan
        on plan.tenant_id = customer.tenant_id
        and plan.name = customer.plan
      where customer.tenant_id = ${tenantId}
        and customer.radius_username = accounting.username
        and plan.type in ('Hotspot', 'Bundle', 'Trial')
    )
  )`
}

export async function GET(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view hotspot sessions.' }, { status: 401 })

  try {
    const hotspotUserFilter = tenantHotspotUserFilter(session.tenantId)
    const [summary, sessionRows] = await Promise.all([
      db.execute<{ activeSessions: number; connectedDevices: number }>(sql`
        select
          count(*)::int as "activeSessions",
          count(distinct coalesce(nullif(lower(btrim(accounting.callingstationid)), ''), accounting.acctuniqueid))::int as "connectedDevices"
        from public.radacct as accounting
        where accounting.acctstoptime is null
          and ${hotspotUserFilter}
      `),
      db.execute<{
        id: string
        username: string | null
        mac: string | null
        ipAddress: string | null
        startedAt: Date | null
      }>(sql`
        select
          accounting.acctuniqueid as id,
          accounting.username,
          accounting.callingstationid as mac,
          accounting.framedipaddress::text as "ipAddress",
          accounting.acctstarttime as "startedAt"
        from public.radacct as accounting
        where accounting.acctstoptime is null
          and ${hotspotUserFilter}
        order by accounting.acctstarttime desc nulls last
        limit 100
      `),
    ])

    return NextResponse.json({
      connectedDevices: summary.rows[0]?.connectedDevices ?? 0,
      activeSessions: summary.rows[0]?.activeSessions ?? 0,
      sessions: sessionRows.rows.map((row) => ({
        ...row,
        startedAt: row.startedAt?.toISOString() ?? null,
      })),
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load live hotspot sessions', error)
    return NextResponse.json({ error: 'Unable to load live hotspot sessions.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
