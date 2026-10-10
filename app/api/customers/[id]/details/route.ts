import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { customers, hotspotPurchases, packages, payments, pppoeAccounts, radcheck, sites } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getTenantSession(_request)
  if (!session) return NextResponse.json({ error: 'Sign in to view subscriber details.' }, { status: 401 })

  const { id } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Subscriber was not found.' }, { status: 404 })
  }

  try {
    const [customer] = await db.select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      phone: customers.phone,
      radiusUsername: customers.radiusUsername,
      status: customers.status,
      plan: customers.plan,
      monthlyRate: customers.monthlyRate,
      siteId: customers.siteId,
      expiresAt: customers.expiresAt,
      createdAt: customers.createdAt,
    }).from(customers).where(and(
      eq(customers.id, id),
      eq(customers.tenantId, session.tenantId),
    )).limit(1)

    if (!customer) return NextResponse.json({ error: 'Subscriber was not found.' }, { status: 404 })
    const [account, credential, plan, site, paidSummary, paidThisMonth, paymentRows, hotspotPaidSummary, hotspotPaidThisMonth, hotspotPaymentRows, sessionSummary, sessionRows, activityRows] = await Promise.all([
      db.select({ accountNumber: pppoeAccounts.accountNumber })
        .from(pppoeAccounts).where(and(
          eq(pppoeAccounts.customerId, customer.id),
          eq(pppoeAccounts.tenantId, session.tenantId),
        )).limit(1),
      customer.radiusUsername
        ? db.select({ password: radcheck.value }).from(radcheck).where(and(
          eq(radcheck.username, customer.radiusUsername),
          eq(radcheck.tenantId, session.tenantId),
          eq(radcheck.attribute, 'Cleartext-Password'),
        )).limit(1)
        : Promise.resolve([]),
      customer.plan
        ? db.select({
          type: packages.type,
          rateLimit: packages.rateLimit,
          downloadMbps: packages.downloadMbps,
          uploadMbps: packages.uploadMbps,
          fupEnabled: packages.fupEnabled,
          fupLimitBytes: packages.fupLimitBytes,
        }).from(packages).where(and(
          eq(packages.tenantId, session.tenantId),
          eq(packages.name, customer.plan),
        )).orderBy(desc(packages.createdAt)).limit(1)
        : Promise.resolve([]),
      customer.siteId
        ? db.select({ name: sites.name }).from(sites).where(and(
          eq(sites.id, customer.siteId),
          eq(sites.tenantId, session.tenantId),
        )).limit(1)
        : Promise.resolve([]),
      db.select({ amount: sql<string>`coalesce(sum(${payments.amount}), 0)::text` })
        .from(payments).where(and(
          eq(payments.tenantId, session.tenantId),
          eq(payments.customerId, customer.id),
          eq(payments.status, 'paid'),
        )),
      db.select({ amount: sql<string>`coalesce(sum(${payments.amount}), 0)::text` })
        .from(payments).where(and(
          eq(payments.tenantId, session.tenantId),
          eq(payments.customerId, customer.id),
          eq(payments.status, 'paid'),
          gte(payments.paidAt, new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
        )),
      db.select({
        id: payments.id,
        amount: payments.amount,
        status: payments.status,
        method: payments.method,
        reference: payments.reference,
        paidAt: payments.paidAt,
      }).from(payments).where(and(
        eq(payments.tenantId, session.tenantId),
        eq(payments.customerId, customer.id),
      )).orderBy(desc(payments.paidAt)).limit(50),
      customer.radiusUsername
        ? db.select({ amount: sql<string>`coalesce(sum(${hotspotPurchases.amount}), 0)::text` })
          .from(hotspotPurchases).where(and(
            eq(hotspotPurchases.tenantId, session.tenantId),
            eq(hotspotPurchases.radiusUsername, customer.radiusUsername),
            eq(hotspotPurchases.status, 'completed'),
          ))
        : Promise.resolve([]),
      customer.radiusUsername
        ? db.select({ amount: sql<string>`coalesce(sum(${hotspotPurchases.amount}), 0)::text` })
          .from(hotspotPurchases).where(and(
            eq(hotspotPurchases.tenantId, session.tenantId),
            eq(hotspotPurchases.radiusUsername, customer.radiusUsername),
            eq(hotspotPurchases.status, 'completed'),
            gte(hotspotPurchases.paidAt, new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
          ))
        : Promise.resolve([]),
      customer.radiusUsername
        ? db.select({
          id: hotspotPurchases.id,
          amount: hotspotPurchases.amount,
          status: hotspotPurchases.status,
          receipt: hotspotPurchases.receipt,
          paidAt: hotspotPurchases.paidAt,
          createdAt: hotspotPurchases.createdAt,
        }).from(hotspotPurchases).where(and(
          eq(hotspotPurchases.tenantId, session.tenantId),
          eq(hotspotPurchases.radiusUsername, customer.radiusUsername),
          eq(hotspotPurchases.status, 'completed'),
        )).orderBy(desc(hotspotPurchases.paidAt)).limit(50)
        : Promise.resolve([]),
      customer.radiusUsername
        ? db.execute<{
          sessionCount: number
          activeSessions: number
          firstSessionAt: Date | null
          lastSessionAt: Date | null
          bytesIn: string | null
          bytesOut: string | null
        }>(sql`
          select
            count(*)::int as "sessionCount",
            count(*) filter (where acctstoptime is null)::int as "activeSessions",
            min(acctstarttime) as "firstSessionAt",
            max(coalesce(acctstoptime, acctupdatetime, acctstarttime)) as "lastSessionAt",
            coalesce(sum(acctinputoctets), 0)::text as "bytesIn",
            coalesce(sum(acctoutputoctets), 0)::text as "bytesOut"
          from public.radacct
          where username = ${customer.radiusUsername}
        `)
        : Promise.resolve({ rows: [{
          sessionCount: 0,
          activeSessions: 0,
          firstSessionAt: null,
          lastSessionAt: null,
          bytesIn: '0',
          bytesOut: '0',
        }] }),
      customer.radiusUsername
        ? db.execute<{
          id: string
          nasIpAddress: string | null
          ipAddress: string | null
          macAddress: string | null
          startedAt: Date | null
          stoppedAt: Date | null
          sessionSeconds: number | null
          bytesIn: string | null
          bytesOut: string | null
          terminateCause: string | null
        }>(sql`
          select
            acctuniqueid as id,
            nasipaddress::text as "nasIpAddress",
            framedipaddress::text as "ipAddress",
            callingstationid as "macAddress",
            acctstarttime as "startedAt",
            acctstoptime as "stoppedAt",
            acctsessiontime as "sessionSeconds",
            coalesce(acctinputoctets, 0)::text as "bytesIn",
            coalesce(acctoutputoctets, 0)::text as "bytesOut",
            acctterminatecause as "terminateCause"
          from public.radacct
          where username = ${customer.radiusUsername}
          order by acctstarttime desc nulls last
          limit 50
        `)
        : Promise.resolve({ rows: [] }),
      customer.radiusUsername
        ? db.execute<{ day: string; sessionCount: number }>(sql`
          select to_char(date_trunc('day', acctstarttime), 'YYYY-MM-DD') as day, count(*)::int as "sessionCount"
          from public.radacct
          where username = ${customer.radiusUsername}
            and acctstarttime >= now() - interval '364 days'
          group by date_trunc('day', acctstarttime)
        `)
        : Promise.resolve({ rows: [] }),
    ])
    const sessionTotals = sessionSummary.rows[0]
    return NextResponse.json({
      ...customer,
      accountNumber: account[0] ? String(account[0].accountNumber) : null,
      radiusPassword: credential[0]?.password || null,
      planDetails: plan[0] || null,
      siteName: site[0]?.name || null,
      billing: {
        lifetimeValue: Number(paidSummary[0]?.amount || 0) +
          Number(hotspotPaidSummary[0]?.amount || 0),
        paidThisMonth: Number(paidThisMonth[0]?.amount || 0) +
          Number(hotspotPaidThisMonth[0]?.amount || 0),
        payments: [
          ...paymentRows.map((payment) => ({
            id: payment.id,
            amount: payment.amount,
            status: payment.status,
            method: payment.method,
            reference: payment.reference,
            paidAt: payment.paidAt.toISOString(),
          })),
          ...hotspotPaymentRows.map((payment) => ({
            id: payment.id,
            amount: payment.amount,
            status: payment.status,
            method: 'M-Pesa Hotspot',
            reference: payment.receipt,
            paidAt: (payment.paidAt || payment.createdAt).toISOString(),
          })),
        ].sort((left, right) => right.paidAt.localeCompare(left.paidAt)).slice(0, 50),
      },
      sessionSummary: {
        sessionCount: sessionTotals?.sessionCount || 0,
        activeSessions: sessionTotals?.activeSessions || 0,
        firstSessionAt: sessionTotals?.firstSessionAt?.toISOString() || null,
        lastSessionAt: sessionTotals?.lastSessionAt?.toISOString() || null,
        bytesIn: sessionTotals?.bytesIn || '0',
        bytesOut: sessionTotals?.bytesOut || '0',
      },
      sessions: sessionRows.rows.map((row) => ({
        ...row,
        startedAt: row.startedAt?.toISOString() || null,
        stoppedAt: row.stoppedAt?.toISOString() || null,
      })),
      activity: activityRows.rows,
    }, { headers: { 'cache-control': 'no-store, private' } })
  } catch (error) {
    console.error('Failed to load tenant subscriber details', error)
    return NextResponse.json({ error: 'Unable to load subscriber details.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
