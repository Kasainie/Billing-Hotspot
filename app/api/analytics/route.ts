import { sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantSession } from '@/lib/db/tenant'
import { tenantSessionUserFilter } from '@/lib/hotspot-session-tenant-filter'
import { radiusAccountingFreshnessPredicate } from '@/lib/radius-accounting'
import { getOfficialRecordsCutoff } from '@/lib/official-records-cutoff'

export async function GET(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view analytics.' }, { status: 401 })

  const now = new Date()
  const period = request.nextUrl.searchParams.get('period') || 'Monthly'
  const customStart = request.nextUrl.searchParams.get('start')
  const customEnd = request.nextUrl.searchParams.get('end')
  let start = new Date(now)
  let end = new Date(now)

  if (period === 'Daily') start.setHours(now.getHours() - 24)
  else if (period === 'Weekly') start.setDate(now.getDate() - 7)
  else if (period === 'Monthly') start.setDate(now.getDate() - 30)
  else if (period === 'Yearly') start.setFullYear(now.getFullYear() - 1)
  else if (period === 'Last Year') {
    start = new Date(now.getFullYear() - 1, 0, 1)
    end = new Date(now.getFullYear(), 0, 1)
  } else if (customStart && customEnd) {
    const parsedStart = new Date(customStart)
    const parsedEnd = new Date(customEnd)
    if (Number.isFinite(parsedStart.getTime())) start = parsedStart
    if (Number.isFinite(parsedEnd.getTime())) end = parsedEnd
    if (end < start) end = start
  } else {
    start.setDate(now.getDate() - 30)
  }
  const officialRecordsCutoff = getOfficialRecordsCutoff()
  if (start < officialRecordsCutoff) start = officialRecordsCutoff
  if (end < officialRecordsCutoff) end = officialRecordsCutoff

  const tenantId = session.tenantId
  try {
    const [
      summary,
      dailyRevenue,
      methods,
      topCustomers,
      topPackages,
      subscribers,
      lifecycle,
      traffic,
      topTalkers,
      routers,
      heatmap,
      expenses,
      routerPerformance,
      unlinkedPerformance,
    ] = await Promise.all([
      db.execute(sql`
        select
          (select count(*)::int from public.customers c where c.tenant_id = ${tenantId} and c.status = 'active') as "activeSubscribers",
          (select count(*)::int from public.customers c where c.tenant_id = ${tenantId}) as "totalSubscribers",
          (select count(*)::int from public.customers c where c.tenant_id = ${tenantId} and c.created_at >= ${start} and c.created_at < ${end}) as "newSubscribers",
          (select count(*)::int from public.sites s where s.tenant_id = ${tenantId}) as "siteCount",
          (select count(*)::int from public.router_monitors r where r.tenant_id = ${tenantId} and r.enabled = true) as "routerCount",
          (select count(*)::int from public.radacct accounting where accounting.acctstoptime is null and ${radiusAccountingFreshnessPredicate(sql`accounting.acctupdatetime`, sql`accounting.acctstarttime`)} and ${tenantSessionUserFilter(tenantId)}) as "activeSessions",
          (select count(distinct coalesce(nullif(lower(btrim(accounting.callingstationid)), ''), accounting.acctuniqueid))::int from public.radacct accounting where accounting.acctstoptime is null and ${radiusAccountingFreshnessPredicate(sql`accounting.acctupdatetime`, sql`accounting.acctstarttime`)} and ${tenantSessionUserFilter(tenantId)}) as "connectedDevices",
          (select coalesce(sum(p.amount), 0)::float8 from public.payments p where p.tenant_id = ${tenantId} and p.status = 'paid' and p.paid_at >= ${start} and p.paid_at < ${end}) as revenue,
          (select count(*)::int from public.payments p where p.tenant_id = ${tenantId} and p.status = 'paid' and p.paid_at >= ${start} and p.paid_at < ${end}) as "paymentCount",
          (select count(distinct p.customer_id)::int from public.payments p where p.tenant_id = ${tenantId} and p.status = 'paid' and p.customer_id is not null and p.paid_at >= ${start} and p.paid_at < ${end}) as "payingSubscribers",
          (select coalesce(sum(accounting.acctinputoctets), 0)::float8 from public.radacct accounting where accounting.acctstarttime >= ${start} and accounting.acctstarttime < ${end} and ${tenantSessionUserFilter(tenantId)}) as "downloadBytes",
          (select coalesce(sum(accounting.acctoutputoctets), 0)::float8 from public.radacct accounting where accounting.acctstarttime >= ${start} and accounting.acctstarttime < ${end} and ${tenantSessionUserFilter(tenantId)}) as "uploadBytes"
      `),
      db.execute(sql`
        select date_trunc('day', paid_at) as date, coalesce(sum(amount), 0)::float8 as revenue, count(*)::int as payments
        from public.payments
        where tenant_id = ${tenantId} and status = 'paid' and paid_at >= ${start} and paid_at < ${end}
        group by 1 order by 1
      `),
      db.execute(sql`
        select coalesce(nullif(btrim(method), ''), 'Not recorded') as method, coalesce(sum(amount), 0)::float8 as revenue, count(*)::int as payments
        from public.payments
        where tenant_id = ${tenantId} and status = 'paid' and paid_at >= ${start} and paid_at < ${end}
        group by 1 order by revenue desc
      `),
      db.execute(sql`
        select c.id, c.name, coalesce(sum(p.amount), 0)::float8 as revenue
        from public.customers c
        left join public.payments p on p.customer_id = c.id and p.status = 'paid' and p.paid_at >= ${start} and p.paid_at < ${end}
        where c.tenant_id = ${tenantId}
        group by c.id, c.name
        order by revenue desc limit 12
      `),
      db.execute(sql`
        select coalesce(c.plan, 'Unassigned') as name, count(*)::int as subscribers, coalesce(sum(c.monthly_rate), 0)::float8 as revenue
        from public.customers c
        where c.tenant_id = ${tenantId}
        group by 1 order by revenue desc limit 12
      `),
      db.execute(sql`
        select date_trunc('day', created_at) as date, count(*)::int as subscribers
        from public.customers
        where tenant_id = ${tenantId} and created_at >= ${start} and created_at < ${end}
        group by 1 order by 1
      `),
      db.execute(sql`
        select
          count(*) filter (where status = 'active')::int as active,
          count(*) filter (where status = 'suspended')::int as suspended,
          count(*) filter (where status = 'inactive')::int as inactive,
          count(*) filter (where lower(coalesce(plan, '')) like '%pppoe%' or exists (
            select 1 from public.packages p where p.tenant_id = c.tenant_id and p.name = c.plan and p.type = 'PPPoE'
          ))::int as pppoe,
          count(*) filter (where not (lower(coalesce(plan, '')) like '%pppoe%' or exists (
            select 1 from public.packages p where p.tenant_id = c.tenant_id and p.name = c.plan and p.type = 'PPPoE'
          )))::int as hotspot,
          count(*) filter (where expires_at >= clock_timestamp() and expires_at < clock_timestamp() + interval '7 days')::int as "expiring7",
          count(*) filter (where expires_at >= clock_timestamp() + interval '7 days' and expires_at < clock_timestamp() + interval '14 days')::int as "expiring14",
          count(*) filter (where expires_at >= clock_timestamp() + interval '14 days' and expires_at < clock_timestamp() + interval '30 days')::int as "expiring30",
          count(*) filter (where expires_at < clock_timestamp())::int as expired
        from public.customers c where tenant_id = ${tenantId}
      `),
      db.execute(sql`
        select
          count(*) filter (where acctstoptime is null and ${radiusAccountingFreshnessPredicate(sql`acctupdatetime`, sql`acctstarttime`)})::int as active,
          count(*)::int as sessions,
          coalesce(sum(acctinputoctets), 0)::float8 as "downloadBytes",
          coalesce(sum(acctoutputoctets), 0)::float8 as "uploadBytes"
        from public.radacct accounting
        where accounting.acctstarttime >= ${start} and accounting.acctstarttime < ${end} and ${tenantSessionUserFilter(tenantId)}
      `),
      db.execute(sql`
        select coalesce(c.name, accounting.username, 'Unknown') as name,
               coalesce(sum(accounting.acctinputoctets + accounting.acctoutputoctets), 0)::float8 as bytes,
               count(*)::int as sessions
        from public.radacct accounting
        left join public.customers c on c.tenant_id = ${tenantId} and c.radius_username = accounting.username
        where accounting.acctstarttime >= ${start} and accounting.acctstarttime < ${end} and ${tenantSessionUserFilter(tenantId)}
        group by 1 order by bytes desc limit 12
      `),
      db.execute(sql`
        select r.id, r.router_name as name, s.name as "siteName", r.last_seen_at as "lastSeenAt",
          latest.active_hotspot_users, latest.active_pppoe_users, latest.cpu_load, latest.sampled_at as "metricsUpdatedAt"
        from public.router_monitors r
        inner join public.sites s on s.id = r.site_id and s.tenant_id = r.tenant_id
        left join lateral (
          select sample.* from public.router_metric_samples sample
          where sample.router_id = r.id order by sample.sampled_at desc limit 1
        ) latest on true
        where r.tenant_id = ${tenantId} and r.enabled = true order by r.router_name
      `),
      db.execute(sql`
        select extract(dow from accounting.acctstarttime)::int as weekday, extract(hour from accounting.acctstarttime)::int as hour,
               count(distinct coalesce(nullif(lower(btrim(accounting.callingstationid)), ''), accounting.acctuniqueid))::int as devices
        from public.radacct accounting
        where accounting.acctstarttime >= ${start} and accounting.acctstarttime < ${end} and ${tenantSessionUserFilter(tenantId)}
        group by 1, 2 order by 1, 2
      `),
      db.execute(sql`
        select coalesce(sum(amount), 0)::float8 as amount, count(*)::int as count
        from public.expenses where tenant_id = ${tenantId} and occurred_at >= ${start} and occurred_at < ${end}
      `),
      db.execute(sql`
        select r.id, r.router_name as name,
          case when r.connector_last_seen_at >= clock_timestamp() - interval '30 seconds' then 'Online' else 'Offline' end as status,
          (select count(*)::int from public.customers c
           where c.tenant_id = ${tenantId} and c.site_id = r.site_id and c.created_at >= ${start} and c.created_at < ${end}) as subscribers,
          (select coalesce(sum(p.amount), 0)::float8 from public.payments p
           inner join public.customers c on c.id = p.customer_id and c.tenant_id = ${tenantId}
           where p.tenant_id = ${tenantId} and p.status = 'paid' and p.paid_at >= ${start} and p.paid_at < ${end} and c.site_id = r.site_id) as revenue,
          (select count(*)::int from public.radacct accounting
           where accounting.acctstarttime >= ${start} and accounting.acctstarttime < ${end}
             and ${tenantSessionUserFilter(tenantId)}
             and exists (select 1 from public.router_remote_sessions remote where remote.router_id = r.id and remote.username = accounting.username)) as sessions,
          (select coalesce(sum(coalesce(accounting.acctinputoctets, 0) + coalesce(accounting.acctoutputoctets, 0)), 0)::float8 from public.radacct accounting
           where accounting.acctstarttime >= ${start} and accounting.acctstarttime < ${end}
             and ${tenantSessionUserFilter(tenantId)}
             and exists (select 1 from public.router_remote_sessions remote where remote.router_id = r.id and remote.username = accounting.username)) as data
        from public.router_monitors r
        where r.tenant_id = ${tenantId} and r.enabled = true
        order by r.router_name
      `),
      db.execute(sql`
        select
          (select count(*)::int from public.customers c
           where c.tenant_id = ${tenantId} and (c.site_id is null or not exists (
             select 1 from public.router_monitors r where r.tenant_id = ${tenantId} and r.enabled = true and r.site_id = c.site_id
           )) and c.created_at >= ${start} and c.created_at < ${end}) as subscribers,
          (select coalesce(sum(p.amount), 0)::float8 from public.payments p
           left join public.customers c on c.id = p.customer_id and c.tenant_id = ${tenantId}
           where p.tenant_id = ${tenantId} and p.status = 'paid' and p.paid_at >= ${start} and p.paid_at < ${end}
             and (c.id is null or c.site_id is null or not exists (
               select 1 from public.router_monitors r where r.tenant_id = ${tenantId} and r.enabled = true and r.site_id = c.site_id
             ))) as revenue,
          (select count(*)::int from public.radacct accounting
           where accounting.acctstarttime >= ${start} and accounting.acctstarttime < ${end}
             and ${tenantSessionUserFilter(tenantId)}
             and not exists (
               select 1 from public.router_remote_sessions remote
               inner join public.router_monitors monitor on monitor.id = remote.router_id
               where monitor.tenant_id = ${tenantId} and monitor.enabled = true and remote.username = accounting.username
             )) as sessions,
          (select coalesce(sum(coalesce(accounting.acctinputoctets, 0) + coalesce(accounting.acctoutputoctets, 0)), 0)::float8 from public.radacct accounting
           where accounting.acctstarttime >= ${start} and accounting.acctstarttime < ${end}
             and ${tenantSessionUserFilter(tenantId)}
             and not exists (
               select 1 from public.router_remote_sessions remote
               inner join public.router_monitors monitor on monitor.id = remote.router_id
               where monitor.tenant_id = ${tenantId} and monitor.enabled = true and remote.username = accounting.username
             )) as data
      `),
    ])

    return NextResponse.json({
      period,
      start: start.toISOString(),
      end: end.toISOString(),
      generatedAt: now.toISOString(),
      summary: summary.rows[0] || {},
      dailyRevenue: dailyRevenue.rows,
      methods: methods.rows,
      topCustomers: topCustomers.rows,
      topPackages: topPackages.rows,
      subscribers: subscribers.rows,
      lifecycle: lifecycle.rows[0] || {},
      traffic: traffic.rows[0] || {},
      topTalkers: topTalkers.rows,
      routers: routers.rows,
      heatmap: heatmap.rows,
      expenses: expenses.rows[0] || {},
      routerPerformance: routerPerformance.rows,
      unlinkedPerformance: unlinkedPerformance.rows[0] || {},
    }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (error) {
    console.error('Failed to load analytics', error)
    return NextResponse.json({ error: 'Unable to load analytics data.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
