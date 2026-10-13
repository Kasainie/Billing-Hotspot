import { and, eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routerMonitors, sites } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'

const routerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type TrafficSummary = { dataBytes: number | null; uptimePercent: number | null }
type RevenueSummary = { amount: number | null; paymentCount: number }
type RouterPayment = {
  id: string
  paidAt: Date | string
  amount: number
  method: string
  reference: string | null
  subscriber: string
  source: string
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view router summary data.' }, { status: 401 })
  const { id } = await context.params
  if (!routerIdPattern.test(id)) return NextResponse.json({ error: 'Router id is invalid.' }, { status: 400 })

  try {
    const [monitor] = await db.select({
      id: routerMonitors.id,
      siteId: sites.id,
    }).from(routerMonitors).innerJoin(sites, and(
      eq(sites.id, routerMonitors.siteId),
      eq(sites.tenantId, routerMonitors.tenantId),
    )).where(and(
      eq(routerMonitors.id, id),
      eq(routerMonitors.tenantId, session.tenantId),
      eq(routerMonitors.enabled, true),
    )).limit(1)
    if (!monitor) return NextResponse.json({ error: 'Router not found in this workspace.' }, { status: 404 })

    const [registeredUsers, trafficRows, revenueRows, paymentsRows] = await Promise.all([
      db.execute<{ count: number }>(sql`
        select count(*)::int as count
        from public.customers
        where tenant_id = ${session.tenantId} and site_id = ${monitor.siteId}
      `),
      db.execute<TrafficSummary>(sql`
        with ordered_samples as (
          select sampled_at,
            lead(sampled_at, 1, now()) over (order by sampled_at) as next_sample_at
          from public.router_metric_samples
          where router_id = ${monitor.id}
            and sampled_at >= now() - interval '30 days'
        ),
        month_first as (
          select sampled_at, total_rx_bytes, total_tx_bytes
          from public.router_metric_samples
          where router_id = ${monitor.id}
            and sampled_at >= date_trunc('month', now())
          order by sampled_at asc limit 1
        ),
        month_last as (
          select total_rx_bytes, total_tx_bytes
          from public.router_metric_samples
          where router_id = ${monitor.id}
            and sampled_at >= date_trunc('month', now())
          order by sampled_at desc limit 1
        ),
        prior_month as (
          select total_rx_bytes, total_tx_bytes
          from public.router_metric_samples
          where router_id = ${monitor.id}
            and sampled_at < date_trunc('month', now())
          order by sampled_at desc limit 1
        ),
        uptime as (
          select count(*)::int as sample_count,
            sum(least(90, greatest(0, extract(epoch from (next_sample_at - sampled_at))))) as covered_seconds
          from ordered_samples
        )
        select
          case
            when first_sample.sampled_at is null then null
            else (
              case when last_sample.total_rx_bytes >= coalesce(previous_sample.total_rx_bytes, first_sample.total_rx_bytes)
                then last_sample.total_rx_bytes - coalesce(previous_sample.total_rx_bytes, first_sample.total_rx_bytes)
                else last_sample.total_rx_bytes end
              +
              case when last_sample.total_tx_bytes >= coalesce(previous_sample.total_tx_bytes, first_sample.total_tx_bytes)
                then last_sample.total_tx_bytes - coalesce(previous_sample.total_tx_bytes, first_sample.total_tx_bytes)
                else last_sample.total_tx_bytes end
            )::float8
          end as "dataBytes",
          case when uptime.sample_count = 0 then null
            else round((uptime.covered_seconds / 2592000.0 * 100)::numeric, 2)::float8
          end as "uptimePercent"
        from uptime
        left join month_first as first_sample on true
        left join month_last as last_sample on true
        left join prior_month as previous_sample on true
      `),
      db.execute<RevenueSummary>(sql`
        select coalesce(sum(payment.amount), 0)::float8 as amount, count(*)::int as "paymentCount"
        from (
          select p.amount
          from public.payments as p
          inner join public.customers as customer
            on customer.id = p.customer_id and customer.tenant_id = p.tenant_id
          where p.tenant_id = ${session.tenantId} and customer.site_id = ${monitor.siteId}
            and p.status = 'paid' and p.paid_at >= date_trunc('month', now())
          union all
          select p.amount
          from public.pppoe_payments as p
          inner join public.pppoe_accounts as account
            on account.account_number = p.account_number and account.tenant_id = p.tenant_id
          inner join public.customers as customer
            on customer.id = account.customer_id and customer.tenant_id = p.tenant_id
          where p.tenant_id = ${session.tenantId} and customer.site_id = ${monitor.siteId}
            and p.status = 'completed' and p.paid_at >= date_trunc('month', now())
          union all
          select purchase.amount
          from public.hotspot_purchases as purchase
          inner join public.customers as customer
            on customer.radius_username = purchase.radius_username and customer.tenant_id = purchase.tenant_id
          where purchase.tenant_id = ${session.tenantId} and customer.site_id = ${monitor.siteId}
            and purchase.status = 'completed' and purchase.paid_at >= date_trunc('month', now())
        ) as payment
      `),
      db.execute<RouterPayment>(sql`
        select payment.id, payment."paidAt", payment.amount, payment.method, payment.reference,
          payment.subscriber, payment.source
        from (
          select p.id::text as id, p.paid_at as "paidAt", p.amount, coalesce(p.method, 'Payment') as method,
            p.reference, customer.name as subscriber, 'Subscriber payment' as source
          from public.payments as p
          inner join public.customers as customer
            on customer.id = p.customer_id and customer.tenant_id = p.tenant_id
          where p.tenant_id = ${session.tenantId} and customer.site_id = ${monitor.siteId} and p.status = 'paid'
          union all
          select p.id::text, p.paid_at, p.amount, 'M-Pesa', p.receipt, account.name, 'PPPoE purchase'
          from public.pppoe_payments as p
          inner join public.pppoe_accounts as account
            on account.account_number = p.account_number and account.tenant_id = p.tenant_id
          inner join public.customers as customer
            on customer.id = account.customer_id and customer.tenant_id = p.tenant_id
          where p.tenant_id = ${session.tenantId} and customer.site_id = ${monitor.siteId} and p.status = 'completed'
          union all
          select purchase.id::text, purchase.paid_at, purchase.amount, 'M-Pesa', purchase.receipt,
            coalesce(customer.name, purchase.radius_username, 'Hotspot customer'), 'Hotspot purchase'
          from public.hotspot_purchases as purchase
          left join public.customers as customer
            on customer.radius_username = purchase.radius_username and customer.tenant_id = purchase.tenant_id
          where purchase.tenant_id = ${session.tenantId} and customer.site_id = ${monitor.siteId}
            and purchase.status = 'completed'
        ) as payment
        order by payment."paidAt" desc nulls last
        limit 100
      `),
    ])

    const traffic = trafficRows.rows[0]
    const revenue = revenueRows.rows[0]
    const payments = paymentsRows.rows.flatMap((payment) => {
      const paidAt = payment.paidAt instanceof Date ? payment.paidAt : new Date(payment.paidAt)
      if (!Number.isFinite(paidAt.getTime())) return []
      return [{ ...payment, paidAt: paidAt.toISOString() }]
    })
    return NextResponse.json({
      registeredUsers: registeredUsers.rows[0]?.count ?? 0,
      dataBytesThisMonth: traffic?.dataBytes ?? null,
      uptimePercent30d: traffic?.uptimePercent ?? null,
      revenueMtd: revenue?.amount ?? 0,
      paidTransactionsMtd: revenue?.paymentCount ?? 0,
      payments,
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load router business summary', error)
    return NextResponse.json({ error: 'Unable to load router summary data.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
