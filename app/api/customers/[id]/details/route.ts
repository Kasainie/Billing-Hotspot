import { and, desc, eq, gte, isNull, or, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { customers, hotspotPurchases, invoices, packages, payments, pppoeAccounts, radcheck, sites, smsMessages, subscriberCredits, subscriberEvents, supportTickets } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'
import { serializeDatabaseTimestamp } from '@/lib/database-timestamp'
import { radiusAccountingFreshnessPredicate } from '@/lib/radius-accounting'
import { decryptTenantSecret, getTenantSecretConfigurationError, tryDecryptTenantSecret } from '@/lib/db/tenant-secrets'
import { normalizeKenyanPhone } from '@/lib/daraja'

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
      location: customers.location,
      accountNumber: customers.accountNumber,
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
    const [account, credential, plan, site, paidSummary, paidThisMonth, paymentRows, hotspotPaidSummary, hotspotPaidThisMonth, hotspotPaymentRows, sessionSummary, sessionRows, activityRows, paymentTrendRows, hourlyUsageRows, hourlyUsage24hRows] = await Promise.all([
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
        ? db.select({ name: sites.name, location: sites.location }).from(sites).where(and(
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
          firstSessionAt: Date | string | null
          lastSessionAt: Date | string | null
          bytesIn: string | null
          bytesOut: string | null
        }>(sql`
          select
            count(*)::int as "sessionCount",
            count(*) filter (where acctstoptime is null
              and ${radiusAccountingFreshnessPredicate(sql`acctupdatetime`, sql`acctstarttime`)})::int as "activeSessions",
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
          startedAt: Date | string | null
          stoppedAt: Date | string | null
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
            case when acctstoptime is null
              and not (${radiusAccountingFreshnessPredicate(sql`acctupdatetime`, sql`acctstarttime`)})
              then coalesce(acctupdatetime, acctstarttime)
              else acctstoptime
            end as "stoppedAt",
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
        ? db.execute<{ day: string; sessionCount: number; bytesIn: string; bytesOut: string }>(sql`
          select to_char(date_trunc('day', acctstarttime), 'YYYY-MM-DD') as "day",
            count(*)::int as "sessionCount",
            coalesce(sum(acctinputoctets), 0)::text as "bytesIn",
            coalesce(sum(acctoutputoctets), 0)::text as "bytesOut"
          from public.radacct
          where username = ${customer.radiusUsername}
            and acctstarttime >= now() - interval '364 days'
          group by date_trunc('day', acctstarttime)
          order by date_trunc('day', acctstarttime)
        `)
        : Promise.resolve({ rows: [] }),
      db.execute<{ month: string; amount: string; paymentCount: number }>(sql`
        with subscriber_payments as (
          select date_trunc('month', paid_at) as month, amount::numeric as amount
          from public.payments
          where tenant_id = ${session.tenantId}
            and customer_id = ${customer.id}
            and status = 'paid'
            and paid_at >= date_trunc('month', now()) - interval '11 months'
          union all
          select date_trunc('month', coalesce(paid_at, created_at)) as month, amount::numeric as amount
          from public.hotspot_purchases
          where ${customer.radiusUsername ? sql`tenant_id = ${session.tenantId} and radius_username = ${customer.radiusUsername}` : sql`false`}
            and status = 'completed'
            and coalesce(paid_at, created_at) >= date_trunc('month', now()) - interval '11 months'
        )
        select to_char(month, 'YYYY-MM') as "month",
          coalesce(sum(amount), 0)::text as amount,
          count(*)::int as "paymentCount"
        from subscriber_payments
        group by month
        order by month
      `),
      customer.radiusUsername
        ? db.execute<{
          hour: number
          sessionCount: number
          bytesIn: string
          bytesOut: string
        }>(sql`
          select extract(hour from acctstarttime)::int as hour,
            count(*)::int as "sessionCount",
            coalesce(sum(acctinputoctets), 0)::text as "bytesIn",
            coalesce(sum(acctoutputoctets), 0)::text as "bytesOut"
          from public.radacct
          where username = ${customer.radiusUsername}
            and acctstarttime >= now() - interval '30 days'
            and acctstarttime is not null
          group by extract(hour from acctstarttime)
          order by hour
        `)
        : Promise.resolve({ rows: [] }),
      customer.radiusUsername
        ? db.execute<{
          hourAt: Date | string
          sessionCount: number
          bytesIn: string
          bytesOut: string
        }>(sql`
          select date_trunc('hour', acctstarttime) as "hourAt",
            count(*)::int as "sessionCount",
            coalesce(sum(acctinputoctets), 0)::text as "bytesIn",
            coalesce(sum(acctoutputoctets), 0)::text as "bytesOut"
          from public.radacct
          where username = ${customer.radiusUsername}
            and acctstarttime >= now() - interval '24 hours'
            and acctstarttime is not null
          group by date_trunc('hour', acctstarttime)
          order by date_trunc('hour', acctstarttime)
        `)
        : Promise.resolve({ rows: [] }),
    ])
    const sessionTotals = sessionSummary.rows[0]
    const normalizedPhone = customer.phone ? normalizeKenyanPhone(customer.phone) : null
    const [invoiceRows, creditRows, creditBalanceRows, eventRows, smsRows, ticketRows, purchaseHistoryRows] = await Promise.all([
      db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        amount: invoices.amount,
        status: invoices.status,
        dueAt: invoices.dueAt,
        createdAt: invoices.createdAt,
        description: invoices.description,
      }).from(invoices).where(and(eq(invoices.tenantId, session.tenantId), eq(invoices.customerId, customer.id)))
        .orderBy(desc(invoices.createdAt)).limit(100),
      db.select({
        id: subscriberCredits.id,
        type: subscriberCredits.type,
        amount: subscriberCredits.amount,
        reason: subscriberCredits.reason,
        createdAt: subscriberCredits.createdAt,
      }).from(subscriberCredits).where(and(eq(subscriberCredits.tenantId, session.tenantId), eq(subscriberCredits.customerId, customer.id)))
        .orderBy(desc(subscriberCredits.createdAt)).limit(50),
      db.select({ balance: sql<string>`coalesce(sum(case when ${subscriberCredits.type} = 'credit' then ${subscriberCredits.amount} else -${subscriberCredits.amount} end), 0)::text` })
        .from(subscriberCredits).where(and(eq(subscriberCredits.tenantId, session.tenantId), eq(subscriberCredits.customerId, customer.id))),
      db.select({
        id: subscriberEvents.id,
        eventType: subscriberEvents.eventType,
        description: subscriberEvents.description,
        metadata: subscriberEvents.metadata,
        createdAt: subscriberEvents.createdAt,
      }).from(subscriberEvents).where(and(eq(subscriberEvents.tenantId, session.tenantId), eq(subscriberEvents.customerId, customer.id)))
        .orderBy(desc(subscriberEvents.createdAt)).limit(100),
      db.select({
        id: smsMessages.id,
        status: smsMessages.status,
        deliveryStatus: smsMessages.deliveryStatus,
        recipient: smsMessages.recipient,
        messageEncrypted: smsMessages.messageEncrypted,
        lastError: smsMessages.lastError,
        createdAt: smsMessages.createdAt,
        sentAt: smsMessages.sentAt,
        deliveryReportedAt: smsMessages.deliveryReportedAt,
      }).from(smsMessages).where(and(
        eq(smsMessages.tenantId, session.tenantId),
        or(
          eq(smsMessages.customerId, customer.id),
          ...(normalizedPhone ? [and(isNull(smsMessages.customerId), eq(smsMessages.recipient, normalizedPhone))] : []),
        ),
      )).orderBy(desc(smsMessages.createdAt)).limit(100),
      db.select({
        id: supportTickets.id,
        subject: supportTickets.subject,
        description: supportTickets.description,
        category: supportTickets.category,
        status: supportTickets.status,
        priority: supportTickets.priority,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
      }).from(supportTickets).where(and(eq(supportTickets.tenantId, session.tenantId), eq(supportTickets.customerId, customer.id)))
        .orderBy(desc(supportTickets.updatedAt)).limit(50),
      customer.radiusUsername
        ? db.select({
          id: hotspotPurchases.id,
          productName: hotspotPurchases.productName,
          amount: hotspotPurchases.amount,
          status: hotspotPurchases.status,
          receipt: hotspotPurchases.receipt,
          createdAt: hotspotPurchases.createdAt,
          paidAt: hotspotPurchases.paidAt,
        }).from(hotspotPurchases).where(and(
          eq(hotspotPurchases.tenantId, session.tenantId),
          eq(hotspotPurchases.radiusUsername, customer.radiusUsername),
        )).orderBy(desc(hotspotPurchases.createdAt)).limit(100)
        : Promise.resolve([]),
    ])
    return NextResponse.json({
      ...customer,
      accountNumber: customer.accountNumber !== null
        ? String(customer.accountNumber)
        : account[0] ? String(account[0].accountNumber) : null,
      accountSource: account[0] || plan[0]?.type === 'PPPoE' ? 'PPPoE setup' : 'Not recorded',
      radiusPassword: credential[0]?.password || null,
      planDetails: plan[0] || (account[0] ? { type: 'PPPoE', rateLimit: '', downloadMbps: 0, uploadMbps: 0, fupEnabled: false, fupLimitBytes: null } : null),
      siteName: site[0]?.name || null,
      siteLocation: site[0]?.location || null,
      billing: {
        lifetimeValue: Number(paidSummary[0]?.amount || 0) +
          Number(hotspotPaidSummary[0]?.amount || 0),
        paidThisMonth: Number(paidThisMonth[0]?.amount || 0) +
          Number(hotspotPaidThisMonth[0]?.amount || 0),
        creditBalance: Number(creditBalanceRows[0]?.balance || 0),
        creditEntries: creditRows.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
        invoices: invoiceRows.map((invoice) => ({ ...invoice, dueAt: invoice.dueAt.toISOString(), createdAt: invoice.createdAt.toISOString() })),
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
        firstSessionAt: serializeDatabaseTimestamp(sessionTotals?.firstSessionAt ?? null),
        lastSessionAt: serializeDatabaseTimestamp(sessionTotals?.lastSessionAt ?? null),
        bytesIn: sessionTotals?.bytesIn || '0',
        bytesOut: sessionTotals?.bytesOut || '0',
      },
      sessions: sessionRows.rows.map((row) => ({
        ...row,
        startedAt: serializeDatabaseTimestamp(row.startedAt),
        stoppedAt: serializeDatabaseTimestamp(row.stoppedAt),
      })),
      events: eventRows.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
      smsMessages: smsRows.map((message) => {
        const decrypted = tryDecryptTenantSecret(message.messageEncrypted)
        return {
          id: message.id,
          status: message.status,
          deliveryStatus: message.deliveryStatus,
          recipient: message.recipient,
          message: decrypted.value,
          messageError: decrypted.error,
          lastError: message.lastError,
          createdAt: message.createdAt.toISOString(),
          sentAt: message.sentAt?.toISOString() || null,
          deliveryReportedAt: message.deliveryReportedAt?.toISOString() || null,
        }
      }),
      packageHistory: purchaseHistoryRows.map((purchase) => ({
        ...purchase,
        createdAt: purchase.createdAt.toISOString(),
        paidAt: purchase.paidAt?.toISOString() || null,
      })),
      tickets: ticketRows.map((ticket) => ({
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
      })),
      activity: activityRows.rows,
      analytics: {
        paymentTrend: paymentTrendRows.rows,
        hourlyUsage: hourlyUsageRows.rows,
        hourlyUsage24h: hourlyUsage24hRows.rows.map((entry) => ({
          hourAt: serializeDatabaseTimestamp(entry.hourAt),
          sessionCount: entry.sessionCount,
          bytesIn: entry.bytesIn,
          bytesOut: entry.bytesOut,
        })),
        dailyUsage: activityRows.rows,
      },
    }, { headers: { 'cache-control': 'no-store, private' } })
  } catch (error) {
    console.error('Failed to load tenant subscriber details', error)
    return NextResponse.json({ error: getTenantSecretConfigurationError(error) || 'Unable to load subscriber details.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
