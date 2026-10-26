import { sql, type SQL } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantSession } from '@/lib/db/tenant'
import { tenantSessionUserFilter } from '@/lib/hotspot-session-tenant-filter'
import { parseRouterTimestamp } from '@/lib/router-monitoring'
import { radiusAccountingFreshnessPredicate } from '@/lib/radius-accounting'

type ReportStatus = 'online' | 'offline' | 'expired'

function parseDate(value: string | null, name: string) {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid ${name} date.`)
  }
  return value
}

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export async function GET(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view session reports.' }, { status: 401 })

  try {
    const params = request.nextUrl.searchParams
    const from = parseDate(params.get('from'), 'start')
    const to = parseDate(params.get('to'), 'end')
    if (from && to && from > to) {
      return NextResponse.json({ error: 'The start date must be on or before the end date.' }, { status: 400 })
    }

    const status = params.get('status') || 'all'
    if (!['all', 'online', 'offline', 'expired'].includes(status)) {
      return NextResponse.json({ error: 'Choose a valid session status.' }, { status: 400 })
    }

    const search = (params.get('search') || '').trim().slice(0, 120)
    const requestedPage = Number.parseInt(params.get('page') || '1', 10)
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 100_000)
      : 1
    const pageSize = 50
    const exportFormat = params.get('format')
    const dateFilters: SQL[] = [tenantSessionUserFilter(session.tenantId)]
    if (from) dateFilters.push(sql`accounting.acctstarttime >= ${from}::date`)
    if (to) dateFilters.push(sql`accounting.acctstarttime < (${to}::date + interval '1 day')`)

    const resultFilters: SQL[] = []
    if (status === 'online') resultFilters.push(sql`session_status = 'online'`)
    if (status === 'offline') resultFilters.push(sql`session_status = 'offline'`)
    if (status === 'expired') resultFilters.push(sql`session_status = 'expired'`)
    if (search) {
      const searchPattern = `%${search}%`
      resultFilters.push(sql`(
        coalesce(customer_name, '') ilike ${searchPattern}
        or coalesce(phone, '') ilike ${searchPattern}
        or coalesce(username, '') ilike ${searchPattern}
        or coalesce(mac, '') ilike ${searchPattern}
        or coalesce(ip_address, '') ilike ${searchPattern}
        or coalesce(router, '') ilike ${searchPattern}
        or coalesce(plan, '') ilike ${searchPattern}
      )`)
    }

    const reportCte = sql`
      with session_records as (
        select
          accounting.acctuniqueid as id,
          accounting.username,
          customer.id as customer_id,
          customer.name as customer_name,
          customer.phone,
          coalesce(customer.plan, voucher_plan.name) as plan,
          coalesce(customer.expires_at, voucher.expires_at) as expires_at,
          coalesce(customer.status, voucher.status) as customer_status,
          accounting.callingstationid as mac,
          accounting.framedipaddress::text as ip_address,
          accounting.nasipaddress::text as router,
          accounting.acctstarttime as started_at,
          accounting.acctstoptime as ended_at,
          accounting.acctupdatetime as last_activity_at,
          accounting.acctsessiontime as session_seconds,
          accounting.acctterminatecause as terminate_cause,
          coalesce(accounting.acctoutputoctets, 0)::text as download_bytes,
          coalesce(accounting.acctinputoctets, 0)::text as upload_bytes,
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
          end as service_type
        from public.radacct as accounting
        left join public.customers as customer
          on customer.tenant_id = ${session.tenantId}
          and customer.radius_username = accounting.username
        left join lateral (
          select voucher_row.package_id, voucher_row.expires_at, voucher_row.status
          from public.vouchers as voucher_row
          where voucher_row.tenant_id = ${session.tenantId}
            and voucher_row.username = accounting.username
          order by voucher_row.expires_at desc nulls last
          limit 1
        ) as voucher on true
        left join public.packages as voucher_plan
          on voucher_plan.id = voucher.package_id
          and voucher_plan.tenant_id = ${session.tenantId}
        where ${sql.join(dateFilters, sql` and `)}
      ),
      classified_sessions as (
        select
          session_records.*,
          case
            when ended_at is null
              and ${radiusAccountingFreshnessPredicate(sql`last_activity_at`, sql`started_at`)} then 'online'
            when ended_at is null then 'offline'
            when lower(coalesce(terminate_cause, '')) in ('session-timeout', 'idle-timeout')
              or (expires_at is not null and expires_at <= ended_at) then 'expired'
            else 'offline'
          end as session_status,
          coalesce(
            session_seconds,
            case when started_at is not null
              then greatest(0, extract(epoch from (
                coalesce(
                  ended_at,
                  case when ${radiusAccountingFreshnessPredicate(sql`last_activity_at`, sql`started_at`)}
                    then now()
                    else coalesce(last_activity_at, started_at)
                  end
                ) - started_at
              ))::bigint)
              else null
            end
          ) as duration_seconds
        from session_records
      ),
      filtered_sessions as (
        select * from classified_sessions
        ${resultFilters.length ? sql`where ${sql.join(resultFilters, sql` and `)}` : sql``}
      )
    `

    if (exportFormat === 'csv' || exportFormat === 'json') {
      const report = await db.execute<{
        id: string
        username: string | null
        customer_name: string | null
        phone: string | null
        service_type: string
        session_status: ReportStatus
        plan: string | null
        mac: string | null
        ip_address: string | null
        router: string | null
        started_at: Date | string | null
        ended_at: Date | string | null
        last_activity_at: Date | string | null
        duration_seconds: string | number | null
        download_bytes: string
        upload_bytes: string
        terminate_cause: string | null
        expires_at: Date | string | null
        customer_status: string | null
      }>(sql`${reportCte} select * from filtered_sessions order by started_at desc nulls last, id`)
      const columns = [
        'Session ID', 'Subscriber', 'Username', 'Phone', 'Service', 'Status', 'Plan',
        'Device MAC', 'IP address', 'Router', 'Started at', 'Ended at', 'Last accounting update', 'Duration seconds',
        'Download bytes', 'Upload bytes', 'Total bytes', 'Termination cause', 'Account expiry',
        'Account status',
      ]
      const rows = report.rows.map((row) => [
        row.id,
        row.customer_name,
        row.username,
        row.phone,
        row.service_type,
        row.session_status,
        row.plan,
        row.mac,
        row.ip_address,
        row.router,
        parseRouterTimestamp(row.started_at)?.toISOString() ?? '',
        parseRouterTimestamp(row.ended_at)?.toISOString() ?? '',
        parseRouterTimestamp(row.last_activity_at)?.toISOString() ?? '',
        row.duration_seconds,
        row.download_bytes,
        row.upload_bytes,
        (BigInt(row.download_bytes || 0) + BigInt(row.upload_bytes || 0)).toString(),
        row.terminate_cause,
        parseRouterTimestamp(row.expires_at)?.toISOString() ?? '',
        row.customer_status,
      ])
      if (exportFormat === 'json') {
        return NextResponse.json({ columns, rows }, { headers: { 'cache-control': 'no-store' } })
      }
      const csv = [columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
      return new NextResponse(`\uFEFF${csv}`, {
        headers: {
          'cache-control': 'no-store',
          'content-disposition': 'attachment; filename="session-report.csv"',
          'content-type': 'text/csv; charset=utf-8',
        },
      })
    }

    const offset = (page - 1) * pageSize
    const [summary, report] = await Promise.all([
      db.execute<{
        total_sessions: string
        online_sessions: string
        offline_sessions: string
        expired_sessions: string
        unique_devices: string
        download_bytes: string
        upload_bytes: string
      }>(sql`${reportCte}
        select
          count(*)::text as total_sessions,
          count(*) filter (where session_status = 'online')::text as online_sessions,
          count(*) filter (where session_status = 'offline')::text as offline_sessions,
          count(*) filter (where session_status = 'expired')::text as expired_sessions,
          count(distinct coalesce(nullif(lower(btrim(mac)), ''), id))::text as unique_devices,
          coalesce(sum(download_bytes::numeric), 0)::text as download_bytes,
          coalesce(sum(upload_bytes::numeric), 0)::text as upload_bytes
        from filtered_sessions
      `),
      db.execute<{
        id: string
        username: string | null
        customer_id: string | null
        customer_name: string | null
        phone: string | null
        service_type: string
        session_status: ReportStatus
        customer_status: string | null
        plan: string | null
        mac: string | null
        ip_address: string | null
        router: string | null
        started_at: Date | string | null
        ended_at: Date | string | null
        last_activity_at: Date | string | null
        duration_seconds: string | number | null
        download_bytes: string
        upload_bytes: string
        terminate_cause: string | null
        expires_at: Date | string | null
      }>(sql`${reportCte}
        select * from filtered_sessions
        order by started_at desc nulls last, id
        limit ${pageSize} offset ${offset}
      `),
    ])

    const totals = summary.rows[0]
    const total = Number(totals?.total_sessions || 0)
    return NextResponse.json({
      page,
      pageSize,
      total,
      pages: Math.ceil(total / pageSize),
      summary: {
        totalSessions: total,
        onlineSessions: Number(totals?.online_sessions || 0),
        offlineSessions: Number(totals?.offline_sessions || 0),
        expiredSessions: Number(totals?.expired_sessions || 0),
        uniqueDevices: Number(totals?.unique_devices || 0),
        downloadBytes: totals?.download_bytes || '0',
        uploadBytes: totals?.upload_bytes || '0',
      },
      sessions: report.rows.map((row) => ({
        id: row.id,
        username: row.username,
        customerId: row.customer_id,
        customerName: row.customer_name,
        phone: row.phone,
        serviceType: row.service_type,
        status: row.session_status,
        customerStatus: row.customer_status,
        plan: row.plan,
        mac: row.mac,
        ipAddress: row.ip_address,
        router: row.router,
        startedAt: parseRouterTimestamp(row.started_at)?.toISOString() ?? null,
        endedAt: parseRouterTimestamp(row.ended_at)?.toISOString() ?? null,
        lastActivityAt: parseRouterTimestamp(row.last_activity_at)?.toISOString() ?? null,
        durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
        downloadBytes: row.download_bytes || '0',
        uploadBytes: row.upload_bytes || '0',
        terminateCause: row.terminate_cause,
        expiresAt: parseRouterTimestamp(row.expires_at)?.toISOString() ?? null,
      })),
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    if (error instanceof Error && /^Invalid (start|end) date\.$/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Failed to load hotspot session reports', error)
    return NextResponse.json({ error: 'Unable to load hotspot session reports.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
