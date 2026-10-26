import { timingSafeEqual } from 'node:crypto'
import { and, eq, gt, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db, pool } from '@/lib/db'
import { customers, hotspotPurchases } from '@/lib/db/schema'
import { enqueueTenantTemplateSms, getTenantTemplateSettings } from '@/lib/message-template-delivery'
import { processQueuedTenantSms } from '@/lib/db/tenant-sms'

const DAY_MS = 24 * 60 * 60 * 1000

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function displayExpiry(value: Date) {
  return value.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET || ''
  const authorization = request.headers.get('authorization') || ''
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) return NextResponse.json({ error: 'CRON_SECRET must be configured with at least 32 URL-safe characters.' }, { status: 503 })
  const matches = timingSafeEqual(
    Buffer.from(supplied.padEnd(secret.length).slice(0, secret.length)),
    Buffer.from(secret),
  ) && supplied.length === secret.length
  if (!matches) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  try {
    const now = new Date()
    const settingsCache = new Map<string, Promise<Record<string, string | number | boolean>>>()
    const settingsForTenant = (tenantId: string) => {
      let settings = settingsCache.get(tenantId)
      if (!settings) {
        settings = getTenantTemplateSettings(tenantId)
        settingsCache.set(tenantId, settings)
      }
      return settings
    }
    const expired = await db.select({
      id: customers.id,
      tenantId: customers.tenantId,
      name: customers.name,
      phone: customers.phone,
      plan: customers.plan,
      expiresAt: customers.expiresAt,
    }).from(customers).where(and(
      eq(customers.status, 'active'),
      isNotNull(customers.expiresAt),
      lte(customers.expiresAt, now),
    )).limit(1000)
    if (expired.length) {
      const changed = await db.update(customers).set({ status: 'expired' }).where(and(
        inArray(customers.id, expired.map((customer) => customer.id)),
        eq(customers.status, 'active'),
        isNotNull(customers.expiresAt),
        lte(customers.expiresAt, now),
      )).returning({ id: customers.id })
      const changedIds = new Set(changed.map((customer) => customer.id))
      for (const customer of expired) {
        if (changedIds.has(customer.id) && customer.expiresAt) {
          const templateSettings = await settingsForTenant(customer.tenantId)
          await enqueueTenantTemplateSms(
            customer.tenantId,
            `customer-expired:${customer.id}:${customer.expiresAt.toISOString()}`,
            customer.phone,
            'pppoeExpiryNotice',
            {
              name: customer.name,
              plan: customer.plan,
              expiry: displayExpiry(customer.expiresAt),
            },
            { deliverImmediately: false, customerId: customer.id, templateSettings },
          )
        }
      }
    }

    const reminderCandidates = await db.select({
      id: customers.id,
      tenantId: customers.tenantId,
      name: customers.name,
      phone: customers.phone,
      plan: customers.plan,
      expiresAt: customers.expiresAt,
    }).from(customers).where(and(
      eq(customers.status, 'active'),
      isNotNull(customers.expiresAt),
      gt(customers.expiresAt, now),
      lte(customers.expiresAt, new Date(now.getTime() + 30 * DAY_MS)),
    )).limit(2000)
    for (const customer of reminderCandidates) {
      if (!customer.expiresAt) continue
      const settings = await settingsForTenant(customer.tenantId)
      const leadDays = Number(settings.preExpiryDays) || 3
      const remaining = customer.expiresAt.getTime() - now.getTime()
      if (remaining > leadDays * DAY_MS || remaining <= (leadDays - 1) * DAY_MS) continue
      await enqueueTenantTemplateSms(
        customer.tenantId,
        `pppoe-pre-expiry:${customer.id}:${customer.expiresAt.toISOString()}`,
        customer.phone,
        'pppoePreExpiry',
        { name: customer.name, plan: customer.plan, expiry: displayExpiry(customer.expiresAt) },
        { deliverImmediately: false, customerId: customer.id, templateSettings: settings },
      )
    }

    const hotspotExpirySql = sql<Date>`${hotspotPurchases.paidAt} + (${hotspotPurchases.durationSeconds} * interval '1 second')`
    const hotspotExpiryCandidates = await db.select({
      id: hotspotPurchases.id,
      tenantId: hotspotPurchases.tenantId,
      phone: hotspotPurchases.phone,
      plan: hotspotPurchases.productName,
      expiresAt: hotspotExpirySql,
    }).from(hotspotPurchases).where(and(
      eq(hotspotPurchases.status, 'completed'),
      isNotNull(hotspotPurchases.paidAt),
      gt(hotspotPurchases.durationSeconds, 0),
      sql`${hotspotExpirySql} > ${now}`,
      lte(hotspotExpirySql, new Date(now.getTime() + 30 * DAY_MS)),
    )).limit(3000)
    for (const purchase of hotspotExpiryCandidates) {
      const settings = await settingsForTenant(purchase.tenantId)
      const leadDays = Number(settings.preExpiryDays) || 3
      const remaining = purchase.expiresAt.getTime() - now.getTime()
      if (remaining > leadDays * DAY_MS || remaining <= (leadDays - 1) * DAY_MS) continue
      await enqueueTenantTemplateSms(
        purchase.tenantId,
        `hotspot-pre-expiry:${purchase.id}`,
        purchase.phone,
        'hotspotPreExpiry',
        { plan: purchase.plan, expiry: displayExpiry(purchase.expiresAt) },
        { deliverImmediately: false, templateSettings: settings },
      )
    }

    const hotspotExpired = await db.select({
      id: hotspotPurchases.id,
      tenantId: hotspotPurchases.tenantId,
      phone: hotspotPurchases.phone,
      plan: hotspotPurchases.productName,
      expiresAt: hotspotExpirySql,
    }).from(hotspotPurchases).where(and(
      eq(hotspotPurchases.status, 'completed'),
      isNotNull(hotspotPurchases.paidAt),
      gt(hotspotPurchases.durationSeconds, 0),
      gt(hotspotExpirySql, new Date(now.getTime() - 7 * DAY_MS)),
      lte(hotspotExpirySql, now),
    )).limit(2000)
    for (const purchase of hotspotExpired) {
      await enqueueTenantTemplateSms(
        purchase.tenantId,
        `hotspot-expired:${purchase.id}`,
        purchase.phone,
        'hotspotExpiryNotice',
        { plan: purchase.plan, expiry: displayExpiry(purchase.expiresAt) },
        { deliverImmediately: false, templateSettings: await settingsForTenant(purchase.tenantId) },
      )
    }

    const pppoeUsage = await pool.query<{
      customer_id: string
      tenant_id: string
      name: string
      phone: string | null
      plan: string | null
      expires_at: Date | null
      usage_start: Date
      limit_bytes: string
      used_bytes: string
    }>(`
      select customer.id as customer_id,
        customer.tenant_id,
        customer.name,
        customer.phone,
        customer.plan,
        customer.expires_at,
        coalesce((select max(payment.paid_at)
          from public.payments as payment
          where payment.tenant_id = customer.tenant_id
            and payment.customer_id = customer.id
            and payment.status = 'paid'), customer.created_at) as usage_start,
        plan.fup_limit_bytes::text as limit_bytes,
        coalesce((select sum(coalesce(accounting.acctinputoctets, 0)::numeric
          + coalesce(accounting.acctoutputoctets, 0)::numeric)
          from public.radacct as accounting
          where accounting.username = customer.radius_username
            and accounting.acctstarttime >= coalesce((select max(payment.paid_at)
              from public.payments as payment
              where payment.tenant_id = customer.tenant_id
                and payment.customer_id = customer.id
                and payment.status = 'paid'), customer.created_at)), 0)::text as used_bytes
      from public.customers as customer
      inner join lateral (
        select candidate.fup_limit_bytes, candidate.fup_enabled
        from public.packages as candidate
        where candidate.tenant_id = customer.tenant_id
          and candidate.name = customer.plan
          and candidate.type in ('Hotspot', 'Bundle', 'Trial', 'PPPoE')
        order by candidate.created_at desc
        limit 1
      ) as plan on true
      where customer.status = 'active'
        and customer.radius_username is not null
        and plan.fup_enabled = true
        and plan.fup_limit_bytes > 0
      order by customer.created_at
      limit 2000
    `)
    for (const customer of pppoeUsage.rows) {
      const settings = await settingsForTenant(customer.tenant_id)
      const threshold = Number(settings.bundleWarningThreshold) || 50
      const limit = Number(customer.limit_bytes)
      const used = Number(customer.used_bytes)
      if (!customer.phone || !Number.isFinite(limit) || limit < 1 || used < limit * threshold / 100) continue
      const cycle = customer.expires_at?.toISOString() || customer.usage_start.toISOString()
      await enqueueTenantTemplateSms(
        customer.tenant_id,
        `bundle-warning:${customer.customer_id}:${cycle}`,
        customer.phone,
        'bundleWarning',
        {
          name: customer.name,
          plan: customer.plan,
          used: formatBytes(used),
          limit: formatBytes(limit),
          percent: Math.min(100, Math.floor(used / limit * 100)),
        },
        { deliverImmediately: false, customerId: customer.customer_id, templateSettings: settings },
      )
    }

    const hotspotUsage = await pool.query<{
      id: string
      tenant_id: string
      phone: string | null
      plan: string
      username: string
      limit_bytes: string | null
      used_bytes: string
    }>(`
      select purchase.id::text as id,
        purchase.tenant_id,
        purchase.phone,
        purchase.product_name as plan,
        purchase.radius_username as username,
        case when purchase.package_snapshot ->> 'fupLimitBytes' ~ '^[0-9]+$'
          then (purchase.package_snapshot ->> 'fupLimitBytes')::numeric::text
          else null end as limit_bytes,
        coalesce((select sum(coalesce(accounting.acctinputoctets, 0)::numeric
          + coalesce(accounting.acctoutputoctets, 0)::numeric)
          from public.radacct as accounting
          where accounting.username = purchase.radius_username), 0)::text as used_bytes
      from public.hotspot_purchases as purchase
      where purchase.status = 'completed'
        and purchase.radius_username is not null
        and purchase.package_snapshot ->> 'fupEnabled' = 'true'
      order by purchase.paid_at
      limit 3000
    `)
    for (const purchase of hotspotUsage.rows) {
      const settings = await settingsForTenant(purchase.tenant_id)
      const threshold = Number(settings.bundleWarningThreshold) || 50
      const limit = Number(purchase.limit_bytes)
      const used = Number(purchase.used_bytes)
      if (!purchase.phone || !Number.isFinite(limit) || limit < 1 || used < limit * threshold / 100) continue
      await enqueueTenantTemplateSms(
        purchase.tenant_id,
        `bundle-warning:${purchase.id}`,
        purchase.phone,
        'bundleWarning',
        {
          plan: purchase.plan,
          used: formatBytes(used),
          limit: formatBytes(limit),
          percent: Math.min(100, Math.floor(used / limit * 100)),
        },
        { deliverImmediately: false, templateSettings: settings },
      )
    }
    await processQueuedTenantSms()
    return NextResponse.json({
      expired: expired.length,
      expiryRemindersChecked: reminderCandidates.length,
      hotspotExpiriesChecked: hotspotExpiryCandidates.length + hotspotExpired.length,
      bundleAccountsChecked: (pppoeUsage.rowCount || 0) + (hotspotUsage.rowCount || 0),
      checkedAt: now.toISOString(),
    })
  } catch (error) {
    console.error('Failed to expire customer accounts', error)
    return NextResponse.json({ error: 'Unable to update expired subscribers.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
