import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, invoices, mobileMoneyTransactions, packages, payments, pppoeAccounts, radcheck, radreply, routerMonitors, routerRemoteSessions, sites, subscriberCredits } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'
import { requireTenantAdmin } from '@/lib/db/tenant-authorization'
import { enqueueTenantSms } from '@/lib/db/tenant-sms'
import { normalizeKenyanPhone } from '@/lib/daraja'
import { toHotspotRadiusReplies } from '@/lib/hotspot-products'

const tables = { sites, customers, packages, payments } as const
type Entity = keyof typeof tables

function getTable(entity: string) {
  return entity in tables ? tables[entity as Entity] : null
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : value
}

const packageTypes = ['Hotspot', 'PPPoE', 'Bundle', 'Trial', 'TV']
const packageAvailabilities = ['live', 'hidden', 'off']
const ratePart = '(?:\\d+(?:\\.\\d+)?[KMG]?)'
const rateLimitPattern = new RegExp(`^${ratePart}\\/${ratePart}$`, 'i')
const singleRatePattern = new RegExp(`^${ratePart}$`, 'i')

function isPositiveRate(value: unknown) {
  if (typeof value !== 'string' || !singleRatePattern.test(value)) return false
  const normalized = value.toUpperCase()
  const multiplier = normalized.endsWith('G') ? 1000 : normalized.endsWith('M') ? 1 : normalized.endsWith('K') ? 0.001 : 0.000001
  return Number.parseFloat(normalized) * multiplier > 0
}

function rateInMbps(value: string) {
  const normalized = value.toUpperCase()
  const multiplier = normalized.endsWith('G') ? 1000 : normalized.endsWith('M') ? 1 : normalized.endsWith('K') ? 0.001 : 0.000001
  return Math.max(1, Math.round(Number.parseFloat(normalized) * multiplier))
}

function validate(entity: Entity, input: Record<string, unknown>) {
  const required = entity === 'sites' ? ['name', 'location'] : entity === 'customers' ? ['name', 'email', 'radiusUsername', 'password', 'packageId'] : entity === 'packages' ? ['name', 'type', 'availability', 'rateLimit', 'monthlyPrice', 'durationSeconds', 'devicesPerAccount'] : ['amount']
  for (const key of required) {
    if (input[key] === undefined || input[key] === null || (typeof input[key] === 'string' && !input[key].trim())) return `${key} is required`
  }
  if (entity === 'customers' && typeof input.email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return 'email is invalid'
  if (entity === 'customers' && input.location !== undefined &&
      (typeof input.location !== 'string' || input.location.trim().length > 240)) return 'Location must be 240 characters or fewer'
  if (entity === 'customers' && input.siteId !== undefined && input.siteId !== null && typeof input.siteId !== 'string') return 'Select a valid site'
  if (entity === 'customers' && (typeof input.radiusUsername !== 'string' || !/^[a-zA-Z0-9._@-]{3,64}$/.test(input.radiusUsername.trim()))) return 'RADIUS username must be 3-64 letters, numbers, dots, underscores, @ signs, or hyphens'
  if (entity === 'customers' && (typeof input.password !== 'string' || input.password.trim().length < 12 || input.password.length > 128)) return 'RADIUS password must be 12-128 characters'
  if (entity === 'customers' && (typeof input.packageId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.packageId))) return 'Select a valid service plan'
  if (entity === 'packages') {
    if (!packageTypes.includes(String(input.type))) return 'Select a valid package type'
    if (!packageAvailabilities.includes(String(input.availability))) return 'Select a valid package availability'
    if (!rateLimitPattern.test(String(input.rateLimit)) || !String(input.rateLimit).split('/').every(isPositiveRate)) return 'Rate-limit must use positive upload/download values, for example 2M/10M'
    if (!Number.isInteger(Number(input.monthlyPrice)) || Number(input.monthlyPrice) < 0) return 'Price cannot be negative'
    if (!Number.isInteger(Number(input.durationSeconds)) || Number(input.durationSeconds) < 60 || Number(input.durationSeconds) > 31536000) return 'Duration must be between 1 minute and 365 days'
    if (!Number.isInteger(Number(input.devicesPerAccount)) || Number(input.devicesPerAccount) < 1 || Number(input.devicesPerAccount) > 64) return 'Devices per account must be between 1 and 64'
    const burstValues = [input.burstLimit, input.burstThreshold, input.burstTimeSeconds]
    if (burstValues.some(Boolean) && (!rateLimitPattern.test(String(input.burstLimit || '')) || !rateLimitPattern.test(String(input.burstThreshold || '')) || !Number.isInteger(Number(input.burstTimeSeconds)) || Number(input.burstTimeSeconds) < 1 || Number(input.burstTimeSeconds) > 3600)) return 'Burst limit, threshold, and time must all be valid to enable burst'
    if (input.fupEnabled) {
      if (!Number.isSafeInteger(Number(input.fupLimitBytes)) || Number(input.fupLimitBytes) < 1) return 'Enter a positive FUP data limit in bytes'
      if (!isPositiveRate(input.fupUploadRate) || !isPositiveRate(input.fupDownloadRate)) return 'Enter positive FUP upload and download rates'
    }
    if (input.scheduleEnabled && (typeof input.scheduleSpec !== 'string' || !/^(?:Al|(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)\d{4}-\d{4}(?:,(?:Al|(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)\d{4}-\d{4})*$/.test(input.scheduleSpec))) return 'Schedule must use RADIUS Login-Time format, for example Mo-Fr0800-1800'
    if (!Array.isArray(input.nasRestrictions) || input.nasRestrictions.some((nas) => typeof nas !== 'string' || !/^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(nas))) return 'NAS restrictions must be IPv4 addresses'
  }
  if (entity === 'payments' && (!Number.isInteger(Number(input.amount)) || Number(input.amount) <= 0)) return 'amount must be a positive integer'
  return null
}

export async function GET(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params
  const table = getTable(entity)
  if (!table) return NextResponse.json({ error: 'Unknown entity' }, { status: 404 })

  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to access this data.' }, { status: 401 })
  const tenantId = session.tenantId
  const hasDatabase = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim())
  if (!hasDatabase) {
    return NextResponse.json({ error: 'This data requires a configured database.' }, { status: 503 })
  }

  try {
    const limitParam = request.nextUrl.searchParams.get('limit')
    const offsetParam = request.nextUrl.searchParams.get('offset')
    const pageLimit = limitParam === null ? 200 : Number(limitParam)
    const pageOffset = offsetParam === null ? 0 : Number(offsetParam)
    if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 200 ||
        !Number.isInteger(pageOffset) || pageOffset < 0 || pageOffset > 1_000_000) {
      return NextResponse.json({ error: 'Pagination must use a limit from 1 to 200 and a non-negative offset.' }, { status: 400 })
    }
    if (entity === 'customers') {
      const customerRows = await db.select().from(customers).where(eq(customers.tenantId, tenantId))
        .orderBy(desc(customers.createdAt)).limit(pageLimit).offset(pageOffset)
      const usernames = customerRows.map((row) => row.radiusUsername).filter((username): username is string => Boolean(username))
      const planNames = [...new Set(customerRows.map((row) => row.plan).filter((plan): plan is string => Boolean(plan)))]
      const [activityRows, planRows, pppoeRows, routerSessionRows, routerCatalog, siteCatalog] = await Promise.all([
        usernames.length
          ? db.execute<{
            username: string
            firstOnlineAt: Date | string | null
            lastOnlineAt: Date | string | null
            hasBinding: boolean | null
            isOnline: boolean | null
          }>(sql`
              select username,
                min(acctstarttime) as "firstOnlineAt",
                max(coalesce(acctstoptime, acctupdatetime, acctstarttime)) as "lastOnlineAt",
                bool_or(nullif(btrim(callingstationid), '') is not null)
                  filter (where acctstoptime is null) as "hasBinding",
                bool_or(acctstoptime is null) as "isOnline"
              from public.radacct
              where username in (${sql.join(usernames.map((username) => sql`${username}`), sql`, `)})
              group by username
            `)
          : Promise.resolve({ rows: [] }),
        planNames.length
          ? db.select({ name: packages.name, type: packages.type }).from(packages).where(and(
            eq(packages.tenantId, tenantId),
            inArray(packages.name, planNames),
          ))
          : Promise.resolve([]),
        customerRows.length
          ? db.select({ customerId: pppoeAccounts.customerId }).from(pppoeAccounts).where(and(
            eq(pppoeAccounts.tenantId, tenantId),
            inArray(pppoeAccounts.customerId, customerRows.map((row) => row.id)),
          ))
          : Promise.resolve([]),
        usernames.length
          ? db.select({
            username: routerRemoteSessions.username,
            routerName: routerMonitors.routerName,
          }).from(routerRemoteSessions)
            .innerJoin(routerMonitors, eq(routerRemoteSessions.routerId, routerMonitors.id))
            .where(and(
              eq(routerMonitors.tenantId, tenantId),
              eq(routerMonitors.enabled, true),
              inArray(routerRemoteSessions.username, usernames),
              sql`${routerMonitors.connectorLastSeenAt} >= clock_timestamp() - interval '30 seconds'`,
              sql`${routerRemoteSessions.observedAt} >= clock_timestamp() - interval '30 seconds'`,
            ))
          : Promise.resolve([]),
        db.select({ siteId: routerMonitors.siteId, routerName: routerMonitors.routerName }).from(routerMonitors)
          .where(and(eq(routerMonitors.tenantId, tenantId), eq(routerMonitors.enabled, true)))
          .orderBy(routerMonitors.routerName),
        db.select({ id: sites.id, name: sites.name, location: sites.location }).from(sites)
          .where(eq(sites.tenantId, tenantId)),
      ])
      const activityByUsername = new Map(activityRows.rows.map((activity) => [activity.username, activity]))
      const planTypeByName = new Map(planRows.map((plan) => [plan.name, plan.type]))
      const pppoeCustomerIds = new Set(pppoeRows.map((account) => account.customerId))
      const siteById = new Map(siteCatalog.map((site) => [site.id, site]))
      const routersByUsername = new Map<string, Set<string>>()
      const routersBySite = new Map<string, Set<string>>()
      for (const router of routerCatalog) {
        const routers = routersBySite.get(router.siteId) || new Set<string>()
        routers.add(router.routerName)
        routersBySite.set(router.siteId, routers)
      }
      for (const session of routerSessionRows) {
        const routers = routersByUsername.get(session.username) || new Set<string>()
        routers.add(session.routerName)
        routersByUsername.set(session.username, routers)
      }
      return NextResponse.json(customerRows.map((row) => {
        const activity = row.radiusUsername ? activityByUsername.get(row.radiusUsername) : null
        const activeRouterNames = row.radiusUsername ? routersByUsername.get(row.radiusUsername) || new Set<string>() : new Set<string>()
        const routerNames = new Set(row.siteId ? routersBySite.get(row.siteId) || [] : [])
        for (const router of activeRouterNames) routerNames.add(router)
        return {
          ...row,
          siteName: row.siteId ? siteById.get(row.siteId)?.name ?? null : null,
          siteLocation: row.siteId ? siteById.get(row.siteId)?.location ?? null : null,
          serviceType: pppoeCustomerIds.has(row.id) ? 'PPPoE' : row.plan ? planTypeByName.get(row.plan) ?? null : null,
          firstOnlineAt: activity?.firstOnlineAt ?? null,
          lastOnlineAt: activity?.lastOnlineAt ?? null,
          hasBinding: activity?.hasBinding ?? false,
          isOnline: activity?.isOnline === true || activeRouterNames.size > 0,
          routerNames: [...routerNames],
          availableRouters: routerCatalog.map((router) => router.routerName),
        }
      }))
    }
    const orderColumn = entity === 'payments' ? payments.paidAt : entity === 'packages' ? packages.createdAt : sites.createdAt
    const rows = await db.select().from(table).where(eq(table.tenantId, tenantId)).orderBy(desc(orderColumn as never)).limit(pageLimit).offset(pageOffset)
    return NextResponse.json(rows)
  } catch (error) {
    console.error(`Failed to load tenant ${entity}`, error)
    return NextResponse.json({ error: 'Unable to load records.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params
  const table = getTable(entity)
  if (!table) return NextResponse.json({ error: 'Unknown entity' }, { status: 404 })
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  const session = access.session
  let input: Record<string, unknown>
  try {
    input = await request.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  const error = validate(entity as Entity, input)
  if (error) return NextResponse.json({ error }, { status: 400 })
  const tenantId = session.tenantId

  const hasDatabase = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim())
  if (!hasDatabase) {
    return NextResponse.json({ error: 'Record creation requires a configured database.' }, { status: 503 })
  }
  if ((entity === 'customers' && typeof input.siteId === 'string' && input.siteId.trim()) ||
      (entity === 'payments' && typeof input.customerId === 'string' && input.customerId.trim())) {
    const referenceId = String(entity === 'customers' ? input.siteId : input.customerId).trim()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(referenceId)) {
      return NextResponse.json({ error: 'The selected record is invalid.' }, { status: 400 })
    }
    const [reference] = entity === 'customers'
      ? await db.select({ id: sites.id }).from(sites).where(and(eq(sites.id, referenceId), eq(sites.tenantId, tenantId))).limit(1)
      : await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, referenceId), eq(customers.tenantId, tenantId))).limit(1)
    if (!reference) return NextResponse.json({ error: 'The selected record is not in this workspace.' }, { status: 400 })
  }

  if (entity === 'customers') {
    const radiusUsername = (input.radiusUsername as string).trim().toLowerCase()
    const packageId = input.packageId as string
    const phoneInput = typeof input.phone === 'string' ? input.phone.trim() : ''
    const normalizedPhone = phoneInput ? normalizeKenyanPhone(phoneInput) : null
    try {
      const result = await db.transaction(async (tx) => {
        const [plan] = await tx.select().from(packages).where(and(
          eq(packages.id, packageId),
          eq(packages.tenantId, tenantId),
          eq(packages.active, true),
        )).limit(1)
        if (!plan || plan.availability === 'off') return { customer: null, error: 'The selected plan is unavailable. Refresh and choose an enabled plan.', status: 400 }
        if (plan.type === 'PPPoE' && !normalizedPhone) return { customer: null, error: 'A valid Kenyan phone number is required for PPPoE subscribers.', status: 400 }

        const [existingRadiusUser] = await tx.select({ id: radcheck.id }).from(radcheck).where(and(eq(radcheck.username, radiusUsername), eq(radcheck.tenantId, tenantId))).limit(1)
        if (existingRadiusUser) return { customer: null, error: 'RADIUS username already exists', status: 409 }
        if (plan.type === 'PPPoE' && normalizedPhone) {
          const [existingPppoeAccount] = await tx.select({ accountNumber: pppoeAccounts.accountNumber }).from(pppoeAccounts).where(and(
            eq(pppoeAccounts.phone, normalizedPhone),
            eq(pppoeAccounts.tenantId, tenantId),
          )).limit(1)
          if (existingPppoeAccount) return { customer: null, error: 'This phone number already has a PPPoE account.', status: 409 }
        }

        let accountNumber: number | undefined
        if (plan.type === 'PPPoE' && normalizedPhone) {
          const [account] = await tx.insert(pppoeAccounts).values({
            tenantId,
            phone: normalizedPhone,
            name: clean(input.name) as string,
            email: (clean(input.email) as string).toLowerCase(),
          }).returning({ accountNumber: pppoeAccounts.accountNumber })
          accountNumber = account.accountNumber
        } else {
          const allocatedAccount = await tx.execute<{ accountNumber: number }>(sql`
            select nextval(pg_get_serial_sequence('public.pppoe_accounts', 'account_number'))::integer as "accountNumber"
          `)
          accountNumber = allocatedAccount.rows[0]?.accountNumber
        }
        if (!accountNumber) throw new Error('Unable to allocate a subscriber account number.')

        const [createdCustomer] = await tx.insert(customers).values({
          tenantId,
          siteId: typeof input.siteId === 'string' && input.siteId.trim() ? input.siteId.trim() : null,
          location: typeof input.location === 'string' && input.location.trim() ? input.location.trim() : null,
          accountNumber,
          name: clean(input.name) as string,
          email: (clean(input.email) as string).toLowerCase(),
          phone: normalizedPhone || (phoneInput || null),
          plan: plan.name,
          monthlyRate: plan.monthlyPrice,
          radiusUsername,
          status: 'suspended',
        }).returning()

        const checkRules = [
          {
            tenantId,
            username: radiusUsername,
            attribute: 'Cleartext-Password',
            op: ':=' as ':=' | '==' | '=~',
            value: input.password as string,
          },
          {
            tenantId,
            username: radiusUsername,
            attribute: 'Auth-Type',
            op: ':=' as const,
            value: 'Reject',
          },
          {
            tenantId,
            username: radiusUsername,
            attribute: 'Simultaneous-Use',
            op: ':=' as const,
            value: String(plan.devicesPerAccount),
          },
        ]
        if (plan.scheduleEnabled && plan.scheduleSpec) {
          checkRules.push({ tenantId, username: radiusUsername, attribute: 'Login-Time', op: '==' as const, value: plan.scheduleSpec })
        }
        if (plan.nasRestrictions.length) {
          const allowedNas = plan.nasRestrictions.map((address) => address.replace(/\./g, '\\.')).join('|')
          checkRules.push({ tenantId, username: radiusUsername, attribute: 'NAS-IP-Address', op: '=~' as const, value: `^(${allowedNas})$` })
        }
        await tx.insert(radcheck).values(checkRules)

        const replyRules = toHotspotRadiusReplies(radiusUsername, {
          durationSeconds: plan.durationSeconds,
          devicesPerAccount: plan.devicesPerAccount,
          rateLimit: plan.rateLimit,
          burstLimit: plan.burstLimit,
          burstThreshold: plan.burstThreshold,
          burstTimeSeconds: plan.burstTimeSeconds,
          fupEnabled: plan.fupEnabled,
          fupLimitBytes: plan.fupLimitBytes,
        }).map((rule) => ({ ...rule, tenantId }))
        await tx.insert(radreply).values(replyRules)

        if (plan.type === 'PPPoE' && normalizedPhone) {
          await tx.update(pppoeAccounts).set({ customerId: createdCustomer.id })
            .where(and(eq(pppoeAccounts.accountNumber, accountNumber), eq(pppoeAccounts.tenantId, tenantId)))
        }

        return { customer: createdCustomer, accountNumber, error: null, status: 201 }
      })

      if (!result.customer) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json({ ...result.customer, accountNumber: result.accountNumber }, { status: 201 })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505' &&
          'constraint' in error && error.constraint === 'customers_radius_username_unique_idx') {
        return NextResponse.json({ error: 'RADIUS username already exists' }, { status: 409 })
      }
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505' &&
          'constraint' in error && error.constraint === 'pppoe_accounts_tenant_phone_unique_idx') {
        return NextResponse.json({ error: 'This phone number already has a PPPoE account.' }, { status: 409 })
      }
      console.error('Failed to create subscriber and RADIUS login', error)
      return NextResponse.json({ error: 'Unable to create subscriber and RADIUS login' }, { status: 500 })
    }
  }

  try {
    const values = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, clean(value)]))
    const insertValues = entity === 'packages' ? {
      ...values,
      tenantId,
      uploadMbps: rateInMbps(String(input.rateLimit).split('/')[0]),
      downloadMbps: rateInMbps(String(input.rateLimit).split('/')[1]),
      availability: String(input.availability),
      active: input.availability !== 'off',
      listed: input.availability === 'live',
      fupLimitBytes: input.fupEnabled ? Number(input.fupLimitBytes) : null,
      fupUploadRate: input.fupEnabled ? String(input.fupUploadRate).toUpperCase() : null,
      fupDownloadRate: input.fupEnabled ? String(input.fupDownloadRate).toUpperCase() : null,
      scheduleSpec: input.scheduleEnabled ? input.scheduleSpec : null,
      burstLimit: input.burstLimit || null,
      burstThreshold: input.burstThreshold || null,
      burstTimeSeconds: input.burstTimeSeconds ? Number(input.burstTimeSeconds) : null,
      nasRestrictions: input.nasRestrictions as string[],
    } : values
    if (entity === 'payments') {
      const [payment] = await db.insert(payments).values({ ...insertValues, tenantId } as never).returning()
      if (payment.status === 'paid' && payment.customerId) {
        const [customer] = await db.select({
          name: customers.name,
          phone: customers.phone,
        }).from(customers).where(and(
          eq(customers.id, payment.customerId),
          eq(customers.tenantId, tenantId),
        )).limit(1)
        if (customer?.phone) {
          await enqueueTenantSms(
            tenantId,
            `manual-payment:${payment.id}`,
            customer.phone,
            `Hello ${customer.name}, a payment of KES ${payment.amount} was recorded on your account${payment.reference ? ` (receipt ${payment.reference})` : ''}. Thank you.`,
          )
        }
      }
      return NextResponse.json(payment, { status: 201 })
    }
    const [row] = await db.insert(table).values({ ...insertValues, tenantId } as never).returning()
    return NextResponse.json(row, { status: 201 })
  } catch { return NextResponse.json({ error: 'Unable to create record' }, { status: 500 }) }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params
  if (entity !== 'packages') return NextResponse.json({ error: 'Only packages can be updated here' }, { status: 404 })
  const id = request.nextUrl.searchParams.get('id') || ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Package id is invalid' }, { status: 400 })
  }

  let input: { availability?: unknown }
  try {
    input = await request.json() as { availability?: unknown }
  } catch {
    return NextResponse.json({ error: 'Package availability is required' }, { status: 400 })
  }
  if (!packageAvailabilities.includes(String(input.availability))) return NextResponse.json({ error: 'Select a valid package availability' }, { status: 400 })
  if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ error: 'Package updates require a configured database' }, { status: 503 })

  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  const session = access.session
  const tenantId = session.tenantId

  try {
    const [row] = await db.update(packages).set({
      availability: String(input.availability),
      active: input.availability !== 'off',
      listed: input.availability === 'live',
    }).where(and(eq(packages.id, id), eq(packages.tenantId, tenantId))).returning()
    if (!row) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch {
    return NextResponse.json({ error: 'Unable to update package availability' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params
  const table = getTable(entity)
  if (!table) return NextResponse.json({ error: 'Unknown entity' }, { status: 404 })
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  const session = access.session
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (entity === 'customers' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Subscriber id is invalid.' }, { status: 400 })
  }
  const tenantId = session.tenantId

  const hasDatabase = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim())
  if (!hasDatabase) {
    return NextResponse.json({ error: 'Record deletion requires a configured database.' }, { status: 503 })
  }

  try {
    if (entity === 'customers') {
      const deleted = await db.transaction(async (tx) => {
        const [customer] = await tx.select({ id: customers.id, radiusUsername: customers.radiusUsername })
          .from(customers)
          .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
          .for('update')
          .limit(1)
        if (!customer) return { deleted: false as const }
        const [invoice] = await tx.select({ id: invoices.id }).from(invoices)
          .where(and(eq(invoices.customerId, id), eq(invoices.tenantId, tenantId)))
          .limit(1)
        if (invoice) return { invoiceConflict: true as const }
        const [credit] = await tx.select({ id: subscriberCredits.id }).from(subscriberCredits)
          .where(and(eq(subscriberCredits.customerId, id), eq(subscriberCredits.tenantId, tenantId)))
          .limit(1)
        if (credit) return { creditConflict: true as const }
        if (customer.radiusUsername) {
          await tx.delete(radcheck).where(and(eq(radcheck.username, customer.radiusUsername), eq(radcheck.tenantId, tenantId)))
          await tx.delete(radreply).where(and(eq(radreply.username, customer.radiusUsername), eq(radreply.tenantId, tenantId)))
        }
        await tx.update(mobileMoneyTransactions).set({ customerId: null }).where(and(
          eq(mobileMoneyTransactions.customerId, id),
          eq(mobileMoneyTransactions.tenantId, tenantId),
        ))
        await tx.update(pppoeAccounts).set({ customerId: null }).where(and(
          eq(pppoeAccounts.customerId, id),
          eq(pppoeAccounts.tenantId, tenantId),
        ))
        await tx.delete(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
        return { deleted: true as const }
      })
      if ('invoiceConflict' in deleted) {
        return NextResponse.json({ error: 'This subscriber has invoices and cannot be deleted. Suspend the account to preserve its billing history.' }, { status: 409 })
      }
      if ('creditConflict' in deleted) {
        return NextResponse.json({ error: 'This subscriber has account credit history and cannot be deleted. Suspend the account to preserve the financial audit trail.' }, { status: 409 })
      }
      if (!deleted.deleted) return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 })
      return NextResponse.json({ ok: true })
    }

    const deleted = await db.transaction(async (tx) => {
      if (entity === 'sites') {
        await tx.update(customers).set({ siteId: null }).where(and(
          eq(customers.siteId, id),
          eq(customers.tenantId, tenantId),
        ))
      }
      const rows = await tx.delete(table).where(and(
        eq(table.id as never, id) as never,
        eq((table as typeof packages).tenantId, tenantId) as never,
      ) as never).returning()
      return rows.length > 0
    })
    if (!deleted) return NextResponse.json({ error: 'Record not found in this workspace.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(`Failed to delete tenant ${entity} record`, error)
    return NextResponse.json({ error: 'Unable to delete record.' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
