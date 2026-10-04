import { NextRequest, NextResponse } from 'next/server'
import { and, count, desc, eq, gte, lte, sum } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, packages, payments, sites } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'

export async function GET(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view the dashboard.' }, { status: 401 })
  const tenantId = session.tenantId
  const hasDatabase = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim())

  if (!hasDatabase) {
    return NextResponse.json({ error: 'Dashboard data requires a configured database.' }, { status: 503 })
  }

  try {
    const range = request.nextUrl.searchParams.get('range')
    const rangeMilliseconds = range === '24 hours' ? 24 * 60 * 60 * 1000 : range === '7 days' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000
    const paymentSince = new Date(Date.now() - rangeMilliseconds)
    const now = new Date()
    const expiringBefore = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const [siteRows, customerRows, paymentRows, packageRows, expiringCustomerRows, activeCustomerCount, paidPaymentSummary, customerCountsBySite] = await Promise.all([
      db.select().from(sites).where(eq(sites.tenantId, tenantId)).orderBy(desc(sites.createdAt)),
      db.select().from(customers).where(eq(customers.tenantId, tenantId)).orderBy(desc(customers.createdAt)).limit(100),
      db.select().from(payments).where(eq(payments.tenantId, tenantId)).orderBy(desc(payments.paidAt)).limit(100),
      db.select().from(packages).where(eq(packages.tenantId, tenantId)).orderBy(desc(packages.createdAt)),
      db.select().from(customers).where(and(
        eq(customers.tenantId, tenantId),
        eq(customers.status, 'active'),
        gte(customers.expiresAt, now),
        lte(customers.expiresAt, expiringBefore),
      )).orderBy(customers.expiresAt).limit(100),
      db.select({ value: count() }).from(customers).where(and(eq(customers.tenantId, tenantId), eq(customers.status, 'active'))),
      db.select({ amount: sum(payments.amount), count: count() }).from(payments).where(and(
        eq(payments.tenantId, tenantId),
        eq(payments.status, 'paid'),
        gte(payments.paidAt, paymentSince),
        lte(payments.paidAt, now),
      )),
      db.select({ siteId: customers.siteId, count: count() }).from(customers).where(eq(customers.tenantId, tenantId)).groupBy(customers.siteId),
    ])
    const siteCustomerCounts = new Map(customerCountsBySite.map((row) => [row.siteId, row.count]))
    return NextResponse.json({
      sites: siteRows.map((site) => ({ ...site, customersCount: siteCustomerCounts.get(site.id) ?? 0 })),
      customers: customerRows,
      payments: paymentRows,
      packages: packageRows,
      expiringCustomers: expiringCustomerRows,
      summary: {
        activeCustomers: activeCustomerCount[0]?.value ?? 0,
        siteCount: siteRows.length,
        activePackages: packageRows.filter((plan) => plan.active).length,
        paidRevenue: Number(paidPaymentSummary[0]?.amount ?? 0),
        paidPaymentCount: paidPaymentSummary[0]?.count ?? 0,
      },
    })
  } catch (error) {
    console.error('Failed to load tenant dashboard data', error)
    return NextResponse.json({ error: 'Unable to load dashboard data.' }, { status: 503 })
  }
}
