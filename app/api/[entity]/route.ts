import { NextRequest, NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, packages, payments, radcheck, sites } from '@/lib/db/schema'

const tables = { sites, customers, packages, payments } as const
type Entity = keyof typeof tables

const fallbackCollections = {
  sites: [
    { id: 'site-1', name: 'Central Hub', location: 'Accra Central', status: 'active', customersCount: 184, monthlyRevenue: 8600, createdAt: new Date().toISOString() },
    { id: 'site-2', name: 'North Ridge', location: 'Tema', status: 'active', customersCount: 96, monthlyRevenue: 5100, createdAt: new Date().toISOString() },
  ],
  customers: [
    { id: 'customer-1', siteId: 'site-1', name: 'Amina Yusuf', email: 'amina@example.com', phone: '+233245000000', status: 'active', plan: 'Pro 50', monthlyRate: 240, expiresAt: new Date(Date.now() + 86400000 * 20).toISOString(), createdAt: new Date().toISOString() },
    { id: 'customer-2', siteId: 'site-2', name: 'Daniel Osei', email: 'daniel@example.com', phone: '+233245000001', status: 'active', plan: 'Home 20', monthlyRate: 120, expiresAt: new Date(Date.now() + 86400000 * 12).toISOString(), createdAt: new Date().toISOString() },
  ],
  packages: [
    { id: 'package-1', name: 'Starter 10', downloadMbps: 10, uploadMbps: 5, monthlyPrice: 80, active: true, createdAt: new Date().toISOString() },
    { id: 'package-2', name: 'Pro 50', downloadMbps: 50, uploadMbps: 25, monthlyPrice: 240, active: true, createdAt: new Date().toISOString() },
  ],
  payments: [
    { id: 'payment-1', customerId: 'customer-1', amount: 240, status: 'paid', method: 'Mobile Money', paidAt: new Date().toISOString(), reference: 'PAY-84521' },
    { id: 'payment-2', customerId: 'customer-2', amount: 120, status: 'paid', method: 'Card', paidAt: new Date().toISOString(), reference: 'PAY-84520' },
  ],
} as const

function getTable(entity: string) {
  return entity in tables ? tables[entity as Entity] : null
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : value
}

function validate(entity: Entity, input: Record<string, unknown>) {
  const required = entity === 'sites' ? ['name', 'location'] : entity === 'customers' ? ['name', 'email', 'radiusUsername', 'password'] : entity === 'packages' ? ['name', 'downloadMbps', 'uploadMbps', 'monthlyPrice'] : ['amount']
  for (const key of required) {
    if (input[key] === undefined || input[key] === null || input[key] === '') return `${key} is required`
  }
  if (entity === 'customers' && typeof input.email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return 'email is invalid'
  if (entity === 'customers' && (typeof input.radiusUsername !== 'string' || !/^[a-zA-Z0-9._@-]{3,64}$/.test(input.radiusUsername.trim()))) return 'RADIUS username must be 3-64 letters, numbers, dots, underscores, @ signs, or hyphens'
  if (entity === 'customers' && (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128)) return 'RADIUS password must be 12-128 characters'
  if (entity === 'packages' && [input.downloadMbps, input.uploadMbps, input.monthlyPrice].some((value) => !Number.isInteger(Number(value)) || Number(value) <= 0)) return 'package speeds and price must be positive integers'
  if (entity === 'payments' && (!Number.isInteger(Number(input.amount)) || Number(input.amount) <= 0)) return 'amount must be a positive integer'
  return null
}

export async function GET(_request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params
  const table = getTable(entity)
  if (!table) return NextResponse.json({ error: 'Unknown entity' }, { status: 404 })

  const hasDatabase = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim())
  if (!hasDatabase) {
    return NextResponse.json(fallbackCollections[entity as Entity] ?? [])
  }

  try {
    const orderColumn = entity === 'payments' ? payments.paidAt : entity === 'packages' ? packages.createdAt : entity === 'customers' ? customers.createdAt : sites.createdAt
    const rows = await db.select().from(table).orderBy(desc(orderColumn as never)).limit(200)
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json(fallbackCollections[entity as Entity] ?? [])
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params
  const table = getTable(entity)
  if (!table) return NextResponse.json({ error: 'Unknown entity' }, { status: 404 })
  if (entity === 'customers' && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'RADIUS provisioning is disabled outside local development' }, { status: 403 })
  }
  const input = await request.json() as Record<string, unknown>
  const error = validate(entity as Entity, input)
  if (error) return NextResponse.json({ error }, { status: 400 })

  const hasDatabase = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim())
  if (!hasDatabase) {
    if (entity === 'customers') return NextResponse.json({ error: 'Subscriber provisioning requires a configured database' }, { status: 503 })
    return NextResponse.json({ ...input, id: `${entity}-${Date.now()}` }, { status: 201 })
  }

  if (entity === 'customers') {
    const radiusUsername = (input.radiusUsername as string).trim().toLowerCase()
    try {
      const customer = await db.transaction(async (tx) => {
        const [existingRadiusUser] = await tx.select({ id: radcheck.id }).from(radcheck).where(eq(radcheck.username, radiusUsername)).limit(1)
        if (existingRadiusUser) return null

        const [createdCustomer] = await tx.insert(customers).values({
          name: clean(input.name) as string,
          email: clean(input.email) as string,
          radiusUsername,
        }).returning()

        await tx.insert(radcheck).values({
          username: radiusUsername,
          attribute: 'Cleartext-Password',
          op: ':=',
          value: input.password as string,
        })

        return createdCustomer
      })

      if (!customer) return NextResponse.json({ error: 'RADIUS username already exists' }, { status: 409 })
      return NextResponse.json(customer, { status: 201 })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        return NextResponse.json({ error: 'RADIUS username already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Unable to create subscriber and RADIUS login' }, { status: 500 })
    }
  }

  try {
    const values = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, clean(value)]))
    const [row] = await db.insert(table).values(values as never).returning()
    return NextResponse.json(row, { status: 201 })
  } catch { return NextResponse.json({ error: 'Unable to create record' }, { status: 500 }) }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params
  const table = getTable(entity)
  if (!table) return NextResponse.json({ error: 'Unknown entity' }, { status: 404 })
  if (entity === 'customers' && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Subscriber provisioning is disabled outside local development' }, { status: 403 })
  }
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const hasDatabase = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim())
  if (!hasDatabase) {
    return NextResponse.json({ ok: true })
  }

  try {
    if (entity === 'customers') {
      const deleted = await db.transaction(async (tx) => {
        const [customer] = await tx.select({ radiusUsername: customers.radiusUsername }).from(customers).where(eq(customers.id, id)).limit(1)
        if (!customer) return false
        if (customer.radiusUsername) await tx.delete(radcheck).where(eq(radcheck.username, customer.radiusUsername))
        await tx.delete(customers).where(eq(customers.id, id))
        return true
      })
      if (!deleted) return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 })
      return NextResponse.json({ ok: true })
    }

    await db.delete(table).where(eq(table.id as never, id) as never)
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Unable to delete record' }, { status: 500 }) }
}

export const dynamic = 'force-dynamic'
