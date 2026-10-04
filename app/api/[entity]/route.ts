import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, packages, payments, radcheck, sites } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'

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

function rateInMbps(value: string) {
  const normalized = value.toUpperCase()
  const multiplier = normalized.endsWith('G') ? 1000 : normalized.endsWith('M') ? 1 : normalized.endsWith('K') ? 0.001 : 0.000001
  return Math.max(1, Math.round(Number.parseFloat(normalized) * multiplier))
}

function validate(entity: Entity, input: Record<string, unknown>) {
  const required = entity === 'sites' ? ['name', 'location'] : entity === 'customers' ? ['name', 'email', 'radiusUsername', 'password'] : entity === 'packages' ? ['name', 'type', 'availability', 'rateLimit', 'monthlyPrice', 'durationSeconds', 'devicesPerAccount'] : ['amount']
  for (const key of required) {
    if (input[key] === undefined || input[key] === null || (typeof input[key] === 'string' && !input[key].trim())) return `${key} is required`
  }
  if (entity === 'customers' && typeof input.email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return 'email is invalid'
  if (entity === 'customers' && (typeof input.radiusUsername !== 'string' || !/^[a-zA-Z0-9._@-]{3,64}$/.test(input.radiusUsername.trim()))) return 'RADIUS username must be 3-64 letters, numbers, dots, underscores, @ signs, or hyphens'
  if (entity === 'customers' && (typeof input.password !== 'string' || input.password.trim().length < 12 || input.password.length > 128)) return 'RADIUS password must be 12-128 characters'
  if (entity === 'packages') {
    if (!packageTypes.includes(String(input.type))) return 'Select a valid package type'
    if (!packageAvailabilities.includes(String(input.availability))) return 'Select a valid package availability'
    if (!rateLimitPattern.test(String(input.rateLimit))) return 'Rate-limit must use upload/download format, for example 5M/10M'
    if (!Number.isInteger(Number(input.monthlyPrice)) || Number(input.monthlyPrice) < 0) return 'Price cannot be negative'
    if (!Number.isInteger(Number(input.durationSeconds)) || Number(input.durationSeconds) < 60 || Number(input.durationSeconds) > 31536000) return 'Duration must be between 1 minute and 365 days'
    if (!Number.isInteger(Number(input.devicesPerAccount)) || Number(input.devicesPerAccount) < 1 || Number(input.devicesPerAccount) > 64) return 'Devices per account must be between 1 and 64'
    const burstValues = [input.burstLimit, input.burstThreshold, input.burstTimeSeconds]
    if (burstValues.some(Boolean) && (!rateLimitPattern.test(String(input.burstLimit || '')) || !rateLimitPattern.test(String(input.burstThreshold || '')) || !Number.isInteger(Number(input.burstTimeSeconds)) || Number(input.burstTimeSeconds) < 1 || Number(input.burstTimeSeconds) > 3600)) return 'Burst limit, threshold, and time must all be valid to enable burst'
    if (input.fupEnabled && (!Number.isInteger(Number(input.fupLimitBytes)) || Number(input.fupLimitBytes) < 1)) return 'Enter a positive FUP data limit in bytes'
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
    const orderColumn = entity === 'payments' ? payments.paidAt : entity === 'packages' ? packages.createdAt : entity === 'customers' ? customers.createdAt : sites.createdAt
    const rows = await db.select().from(table).where(eq(table.tenantId, tenantId)).orderBy(desc(orderColumn as never)).limit(200)
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
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to create records.' }, { status: 401 })
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
    try {
      const customer = await db.transaction(async (tx) => {
        const [existingRadiusUser] = await tx.select({ id: radcheck.id }).from(radcheck).where(and(eq(radcheck.username, radiusUsername), eq(radcheck.tenantId, tenantId))).limit(1)
        if (existingRadiusUser) return null

        const [createdCustomer] = await tx.insert(customers).values({
          tenantId,
          name: clean(input.name) as string,
          email: clean(input.email) as string,
          radiusUsername,
          status: 'suspended',
        }).returning()

        await tx.insert(radcheck).values({
          tenantId,
          username: radiusUsername,
          attribute: 'Cleartext-Password',
          op: ':=',
          value: input.password as string,
        })
        await tx.insert(radcheck).values({
          tenantId,
          username: radiusUsername,
          attribute: 'Auth-Type',
          op: ':=',
          value: 'Reject',
        })

        return createdCustomer
      })

      if (!customer) return NextResponse.json({ error: 'RADIUS username already exists' }, { status: 409 })
      return NextResponse.json(customer, { status: 201 })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        return NextResponse.json({ error: 'RADIUS username already exists' }, { status: 409 })
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
      scheduleSpec: input.scheduleEnabled ? input.scheduleSpec : null,
      burstLimit: input.burstLimit || null,
      burstThreshold: input.burstThreshold || null,
      burstTimeSeconds: input.burstTimeSeconds ? Number(input.burstTimeSeconds) : null,
      nasRestrictions: input.nasRestrictions as string[],
    } : values
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

  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to update records.' }, { status: 401 })
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
  if (entity === 'customers' && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Subscriber provisioning is disabled outside local development' }, { status: 403 })
  }
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to delete records.' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const tenantId = session.tenantId

  const hasDatabase = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim())
  if (!hasDatabase) {
    return NextResponse.json({ ok: true })
  }

  try {
    if (entity === 'customers') {
      const deleted = await db.transaction(async (tx) => {
        const [customer] = await tx.select({ radiusUsername: customers.radiusUsername }).from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).limit(1)
        if (!customer) return false
        if (customer.radiusUsername) await tx.delete(radcheck).where(and(eq(radcheck.username, customer.radiusUsername), eq(radcheck.tenantId, tenantId)))
        await tx.delete(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
        return true
      })
      if (!deleted) return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 })
      return NextResponse.json({ ok: true })
    }

    await db.delete(table).where(and(eq(table.id as never, id) as never, eq((table as typeof packages).tenantId, tenantId) as never) as never)
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Unable to delete record' }, { status: 500 }) }
}

export const dynamic = 'force-dynamic'
