import { sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantSession } from '@/lib/db/tenant'
import { tenantSessionUserFilter } from '@/lib/hotspot-session-tenant-filter'
import { parseRouterTimestamp } from '@/lib/router-monitoring'

function parseRadiusExpiration(value: string | null) {
  const match = value?.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4}) (\d{2}):(\d{2})$/)
  if (!match) return null
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [, day, month, year, hour, minute] = match
  const monthIndex = months.indexOf(month)
  if (monthIndex < 0) return null
  const expiry = new Date(Date.UTC(Number(year), monthIndex, Number(day), Number(hour), Number(minute)))
  if (expiry.getUTCFullYear() !== Number(year) ||
      expiry.getUTCMonth() !== monthIndex ||
      expiry.getUTCDate() !== Number(day) ||
      expiry.getUTCHours() !== Number(hour) ||
      expiry.getUTCMinutes() !== Number(minute)) return null
  return expiry
}

export async function GET(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view hotspot sessions.' }, { status: 401 })

  try {
    const tenantUserFilter = tenantSessionUserFilter(session.tenantId)
    const [summary, sessionRows] = await Promise.all([
      db.execute<{
        activeSessions: number
        connectedDevices: number
        downloadBytes: string
        uploadBytes: string
        totalBytes: string
      }>(sql`
        select
          count(*)::int as "activeSessions",
          count(distinct coalesce(nullif(lower(btrim(accounting.callingstationid)), ''), accounting.acctuniqueid))::int as "connectedDevices",
          coalesce(sum(accounting.acctoutputoctets), 0)::text as "downloadBytes",
          coalesce(sum(accounting.acctinputoctets), 0)::text as "uploadBytes",
          coalesce(sum(coalesce(accounting.acctinputoctets, 0) + coalesce(accounting.acctoutputoctets, 0)), 0)::text as "totalBytes"
        from public.radacct as accounting
        where accounting.acctstoptime is null
          and ${tenantUserFilter}
      `),
      db.execute<{
        id: string
        username: string | null
        customerId: string | null
        voucherId: string | null
        mac: string | null
        ipAddress: string | null
        startedAt: Date | string | null
        lastActivityAt: Date | string | null
        phone: string | null
        customerName: string | null
        plan: string | null
        expiresAt: Date | string | null
        radiusExpiration: string | null
        customerStatus: string | null
        serviceType: 'PPPoE' | 'Hotspot'
        router: string | null
        routerId: string | null
        routerSessionId: string | null
        routerSessionType: 'hotspot' | 'pppoe' | null
        downloadBytes: string
        uploadBytes: string
      }>(sql`
        select
          accounting.acctuniqueid as id,
          accounting.username,
          customer.id as "customerId",
          voucher.id as "voucherId",
          accounting.callingstationid as mac,
          accounting.framedipaddress::text as "ipAddress",
          accounting.acctstarttime as "startedAt",
          accounting.acctupdatetime as "lastActivityAt",
          customer.phone,
          customer.name as "customerName",
          coalesce(customer.plan, (
            select voucher_plan.name
            from public.vouchers as voucher
            inner join public.packages as voucher_plan
              on voucher_plan.id = voucher.package_id
              and voucher_plan.tenant_id = voucher.tenant_id
            where voucher.tenant_id = ${session.tenantId}
              and voucher.username = accounting.username
            limit 1
          )) as plan,
          coalesce(customer.expires_at, (
            select voucher.expires_at
            from public.vouchers as voucher
            where voucher.tenant_id = ${session.tenantId}
              and voucher.username = accounting.username
            limit 1
          )) as "expiresAt",
          (
            select expiration.value
            from public.radcheck as expiration
            where expiration.tenant_id = ${session.tenantId}
              and expiration.username = accounting.username
              and expiration.attribute = 'Expiration'
            order by expiration.id desc
            limit 1
          ) as "radiusExpiration",
          coalesce(
            customer.status,
            case when exists (
              select 1
              from public.radcheck as auth_rule
              where auth_rule.tenant_id = ${session.tenantId}
                and auth_rule.username = accounting.username
                and auth_rule.attribute = 'Auth-Type'
                and auth_rule.value = 'Reject'
            ) then 'suspended' end,
            voucher.status
          ) as "customerStatus",
          case
            when exists (
              select 1
              from public.customers as pppoe_customer
              where pppoe_customer.tenant_id = ${session.tenantId}
                and pppoe_customer.radius_username = accounting.username
                and (
                  exists (
                    select 1 from public.pppoe_accounts as pppoe_account
                    where pppoe_account.tenant_id = pppoe_customer.tenant_id
                      and pppoe_account.customer_id = pppoe_customer.id
                  )
                  or exists (
                    select 1 from public.packages as pppoe_plan
                    where pppoe_plan.tenant_id = pppoe_customer.tenant_id
                      and pppoe_plan.name = pppoe_customer.plan
                      and pppoe_plan.type = 'PPPoE'
                  )
                )
            ) then 'PPPoE'
            else 'Hotspot'
          end as "serviceType",
          accounting.nasipaddress::text as router,
          router_session."routerId",
          router_session."routerSessionId",
          router_session."routerSessionType",
          coalesce(accounting.acctoutputoctets, 0)::text as "downloadBytes",
          coalesce(accounting.acctinputoctets, 0)::text as "uploadBytes"
        from public.radacct as accounting
        left join public.customers as customer
          on customer.tenant_id = ${session.tenantId}
          and customer.radius_username = accounting.username
        left join lateral (
          select candidate.id, candidate.status
          from public.vouchers as candidate
          where candidate.tenant_id = ${session.tenantId}
            and candidate.username = accounting.username
          order by candidate.created_at desc
          limit 1
        ) as voucher on true
        left join lateral (
          select
            remote.router_id as "routerId",
            remote.router_session_id as "routerSessionId",
            remote.session_type as "routerSessionType"
          from public.router_remote_sessions as remote
          inner join public.router_monitors as monitor
            on monitor.id = remote.router_id
            and monitor.tenant_id = ${session.tenantId}
            and monitor.enabled = true
          where remote.username = accounting.username
            and remote.observed_at >= clock_timestamp() - interval '30 seconds'
            and monitor.connector_last_seen_at >= clock_timestamp() - interval '30 seconds'
            and remote.session_type = case
              when exists (
                select 1
                from public.customers as pppoe_customer
                where pppoe_customer.tenant_id = ${session.tenantId}
                  and pppoe_customer.radius_username = accounting.username
                  and (
                    exists (
                      select 1 from public.pppoe_accounts as pppoe_account
                      where pppoe_account.tenant_id = pppoe_customer.tenant_id
                        and pppoe_account.customer_id = pppoe_customer.id
                    )
                    or exists (
                      select 1 from public.packages as pppoe_plan
                      where pppoe_plan.tenant_id = pppoe_customer.tenant_id
                        and pppoe_plan.name = pppoe_customer.plan
                        and pppoe_plan.type = 'PPPoE'
                    )
                  )
              ) then 'pppoe'
              else 'hotspot'
            end
          order by remote.observed_at desc
          limit 1
        ) as router_session on true
        where accounting.acctstoptime is null
          and ${tenantUserFilter}
        order by accounting.acctstarttime desc nulls last
        limit 100
      `),
    ])

    return NextResponse.json({
      connectedDevices: summary.rows[0]?.connectedDevices ?? 0,
      activeSessions: summary.rows[0]?.activeSessions ?? 0,
      downloadBytes: summary.rows[0]?.downloadBytes ?? '0',
      uploadBytes: summary.rows[0]?.uploadBytes ?? '0',
      totalBytes: summary.rows[0]?.totalBytes ?? '0',
      sessions: sessionRows.rows.map((row) => ({
        ...row,
        startedAt: parseRouterTimestamp(row.startedAt)?.toISOString() ?? null,
        lastActivityAt: parseRouterTimestamp(row.lastActivityAt)?.toISOString() ?? null,
        expiresAt: (parseRouterTimestamp(row.expiresAt) ?? parseRadiusExpiration(row.radiusExpiration))?.toISOString() ?? null,
        routerSessionType: row.routerSessionType,
      })),
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load live hotspot sessions', error)
    return NextResponse.json({ error: 'Unable to load live hotspot sessions.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
