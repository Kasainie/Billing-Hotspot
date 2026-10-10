import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { and, count, desc, eq, gte, lt, sum } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, equipment, expenses, invoices, leads, packages, radcheck, radreply, sites, supportTickets, tr069Devices, vouchers } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'

const entities = ['leads', 'tickets', 'expenses', 'vouchers', 'equipment', 'tr069', 'invoices'] as const
type Entity = typeof entities[number]

const leadStatuses = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const
const ticketStatuses = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const
const priorities = ['low', 'normal', 'high', 'urgent'] as const
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function text(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

async function getAuthorizedEntity(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params
  if (!entities.includes(entity as Entity)) return { response: invalid('Unknown operations module.', 404) } as const
  const session = await getTenantSession(request)
  if (!session) return { response: invalid('Sign in to access workspace operations.', 401) } as const
  if (!process.env.DATABASE_URL?.trim()) return { response: invalid('Operations modules require a configured database.', 503) } as const
  return { entity: entity as Entity, tenantId: session.tenantId } as const
}

export async function GET(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const access = await getAuthorizedEntity(request, context)
  if ('response' in access) return access.response

  try {
    if (access.entity === 'leads') {
      const [items, totals] = await Promise.all([
        db.select().from(leads).where(eq(leads.tenantId, access.tenantId)).orderBy(desc(leads.createdAt)).limit(500),
        db.select({ status: leads.status, count: count() }).from(leads).where(eq(leads.tenantId, access.tenantId)).groupBy(leads.status),
      ])
      return NextResponse.json({ items, totals })
    }
    if (access.entity === 'tickets') {
      const [items, totals] = await Promise.all([
        db.select().from(supportTickets).where(eq(supportTickets.tenantId, access.tenantId)).orderBy(desc(supportTickets.updatedAt)).limit(500),
        db.select({ status: supportTickets.status, count: count() }).from(supportTickets).where(eq(supportTickets.tenantId, access.tenantId)).groupBy(supportTickets.status),
      ])
      return NextResponse.json({ items, totals })
    }
    if (access.entity === 'expenses') {
      const [items, total, byCategory] = await Promise.all([
        db.select().from(expenses).where(eq(expenses.tenantId, access.tenantId)).orderBy(desc(expenses.occurredAt)).limit(500),
        db.select({ amount: sum(expenses.amount), count: count() }).from(expenses).where(eq(expenses.tenantId, access.tenantId)),
        db.select({ category: expenses.category, amount: sum(expenses.amount), count: count() }).from(expenses).where(eq(expenses.tenantId, access.tenantId)).groupBy(expenses.category),
      ])
      return NextResponse.json({ items, total: { amount: Number(total[0]?.amount ?? 0), count: total[0]?.count ?? 0 }, byCategory })
    }
    if (access.entity === 'equipment') {
      const items = await db.select({
        id: equipment.id,
        name: equipment.name,
        category: equipment.category,
        serialNumber: equipment.serialNumber,
        manufacturer: equipment.manufacturer,
        model: equipment.model,
        status: equipment.status,
        condition: equipment.condition,
        purchasedAt: equipment.purchasedAt,
        notes: equipment.notes,
        siteId: equipment.siteId,
        siteName: sites.name,
        createdAt: equipment.createdAt,
      }).from(equipment).leftJoin(sites, and(eq(sites.id, equipment.siteId), eq(sites.tenantId, access.tenantId)))
        .where(eq(equipment.tenantId, access.tenantId)).orderBy(desc(equipment.createdAt)).limit(500)
      const totals = await db.select({ status: equipment.status, count: count() }).from(equipment).where(eq(equipment.tenantId, access.tenantId)).groupBy(equipment.status)
      return NextResponse.json({ items, totals, sites: await db.select({ id: sites.id, name: sites.name }).from(sites).where(eq(sites.tenantId, access.tenantId)) })
    }
    if (access.entity === 'tr069') {
      const [items, sitesList] = await Promise.all([
        db.select({
          id: tr069Devices.id,
          siteId: tr069Devices.siteId,
          siteName: sites.name,
          serialNumber: tr069Devices.serialNumber,
          manufacturer: tr069Devices.manufacturer,
          model: tr069Devices.model,
          firmwareVersion: tr069Devices.firmwareVersion,
          status: tr069Devices.status,
          lastInformAt: tr069Devices.lastInformAt,
          notes: tr069Devices.notes,
          createdAt: tr069Devices.createdAt,
        }).from(tr069Devices).leftJoin(sites, and(eq(sites.id, tr069Devices.siteId), eq(sites.tenantId, access.tenantId)))
          .where(eq(tr069Devices.tenantId, access.tenantId)).orderBy(desc(tr069Devices.updatedAt)).limit(500),
        db.select({ id: sites.id, name: sites.name }).from(sites).where(eq(sites.tenantId, access.tenantId)),
      ])
      return NextResponse.json({ items, sites: sitesList })
    }
    if (access.entity === 'invoices') {
      const [items, totals, activeCustomers, sitesList] = await Promise.all([
        db.select({
          id: invoices.id,
          customerId: invoices.customerId,
          customerName: customers.name,
          customerEmail: customers.email,
          customerPhone: customers.phone,
          invoiceNumber: invoices.invoiceNumber,
          periodStart: invoices.periodStart,
          periodEnd: invoices.periodEnd,
          dueAt: invoices.dueAt,
          amount: invoices.amount,
          description: invoices.description,
          status: invoices.status,
          paidAt: invoices.paidAt,
          createdAt: invoices.createdAt,
        }).from(invoices).innerJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.tenantId, access.tenantId)))
          .where(eq(invoices.tenantId, access.tenantId)).orderBy(desc(invoices.createdAt)).limit(500),
        db.select({ status: invoices.status, count: count(), amount: sum(invoices.amount) })
          .from(invoices).where(eq(invoices.tenantId, access.tenantId)).groupBy(invoices.status),
        db.select({ id: customers.id, name: customers.name, monthlyRate: customers.monthlyRate, plan: customers.plan })
          .from(customers).where(and(eq(customers.tenantId, access.tenantId), eq(customers.status, 'active'), gte(customers.monthlyRate, 1))),
        db.select({ id: sites.id, name: sites.name }).from(sites).where(eq(sites.tenantId, access.tenantId)),
      ])
      return NextResponse.json({ items, totals: totals.map((row) => ({ ...row, amount: Number(row.amount ?? 0) })), activeCustomers, sites: sitesList })
    }

    const [items, totals, availablePackages, byPackage] = await Promise.all([
      db.select({
        id: vouchers.id,
        packageId: vouchers.packageId,
        packageName: packages.name,
        username: vouchers.username,
        status: vouchers.status,
        validitySeconds: vouchers.validitySeconds,
        activatedAt: vouchers.activatedAt,
        expiresAt: vouchers.expiresAt,
        createdAt: vouchers.createdAt,
      }).from(vouchers).innerJoin(packages, and(eq(packages.id, vouchers.packageId), eq(packages.tenantId, access.tenantId)))
        .where(eq(vouchers.tenantId, access.tenantId)).orderBy(desc(vouchers.createdAt)).limit(500),
      db.select({ status: vouchers.status, count: count() }).from(vouchers).where(eq(vouchers.tenantId, access.tenantId)).groupBy(vouchers.status),
      db.select({ id: packages.id, name: packages.name, rateLimit: packages.rateLimit, monthlyPrice: packages.monthlyPrice, durationSeconds: packages.durationSeconds })
        .from(packages).where(and(eq(packages.tenantId, access.tenantId), eq(packages.active, true))),
      db.select({ packageName: packages.name, count: count() }).from(vouchers)
        .innerJoin(packages, and(eq(packages.id, vouchers.packageId), eq(packages.tenantId, access.tenantId)))
        .where(eq(vouchers.tenantId, access.tenantId)).groupBy(packages.name),
    ])
    return NextResponse.json({ items, totals, packages: availablePackages, byPackage })
  } catch (error) {
    console.error(`Failed to load ${access.entity} operations`, error)
    return invalid('Unable to load operations data.', 503)
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const access = await getAuthorizedEntity(request, context)
  if ('response' in access) return access.response

  let input: Record<string, unknown>
  try {
    input = await request.json() as Record<string, unknown>
  } catch {
    return invalid('Request body must be valid JSON.')
  }

  try {
    if (access.entity === 'leads') {
      const name = text(input.name, 120)
      const email = text(input.email, 254).toLowerCase()
      const phone = text(input.phone, 40)
      if (!name || (!email && !phone)) return invalid('Enter a name and at least an email address or phone number.')
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalid('Enter a valid email address.')
      const [created] = await db.insert(leads).values({
        tenantId: access.tenantId,
        name,
        email: email || null,
        phone: phone || null,
        source: text(input.source, 80) || null,
        notes: text(input.notes, 2000) || null,
      }).returning()
      return NextResponse.json(created, { status: 201 })
    }
    if (access.entity === 'tickets') {
      const requesterName = text(input.requesterName, 120)
      const requesterEmail = text(input.requesterEmail, 254).toLowerCase()
      const subject = text(input.subject, 180)
      const description = text(input.description, 5000)
      const priority = text(input.priority, 20) || 'normal'
      if (!requesterName || !subject || !description) return invalid('Requester name, subject, and description are required.')
      if (requesterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) return invalid('Enter a valid requester email.')
      if (!priorities.includes(priority as typeof priorities[number])) return invalid('Select a valid ticket priority.')
      const customerId = text(input.customerId, 50)
      if (customerId) {
        if (!uuidPattern.test(customerId)) return invalid('Selected subscriber is invalid.')
        const [customer] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, customerId), eq(customers.tenantId, access.tenantId))).limit(1)
        if (!customer) return invalid('Selected subscriber is not in this workspace.')
      }
      const [created] = await db.insert(supportTickets).values({
        tenantId: access.tenantId,
        customerId: customerId || null,
        requesterName,
        requesterEmail: requesterEmail || null,
        subject,
        description,
        priority,
      }).returning()
      return NextResponse.json(created, { status: 201 })
    }
    if (access.entity === 'expenses') {
      const category = text(input.category, 80)
      const description = text(input.description, 240)
      const amount = Number(input.amount)
      const occurredAt = input.occurredAt ? new Date(String(input.occurredAt)) : new Date()
      if (!category || !description || !Number.isSafeInteger(amount) || amount <= 0) return invalid('Category, description, and a positive whole-number amount are required.')
      if (!Number.isFinite(occurredAt.getTime())) return invalid('Enter a valid expense date.')
      const [created] = await db.insert(expenses).values({
        tenantId: access.tenantId,
        category,
        description,
        amount,
        paidTo: text(input.paidTo, 120) || null,
        reference: text(input.reference, 120) || null,
        occurredAt,
      }).returning()
      return NextResponse.json(created, { status: 201 })
    }
    if (access.entity === 'equipment' || access.entity === 'tr069') {
      const isTr069 = access.entity === 'tr069'
      const name = text(input.name, 120)
      const category = text(input.category, 80)
      const serialNumber = text(input.serialNumber, 120)
      const siteId = text(input.siteId, 50)
      if (isTr069 && !serialNumber) return invalid('A device serial number is required.')
      if (!isTr069 && (!name || !category)) return invalid('Equipment name and category are required.')
      if (siteId) {
        if (!uuidPattern.test(siteId)) return invalid('Selected site is invalid.')
        const [site] = await db.select({ id: sites.id }).from(sites).where(and(eq(sites.id, siteId), eq(sites.tenantId, access.tenantId))).limit(1)
        if (!site) return invalid('Selected site is not in this workspace.')
      }
      if (isTr069) {
        const [created] = await db.insert(tr069Devices).values({
          tenantId: access.tenantId,
          siteId: siteId || null,
          serialNumber,
          manufacturer: text(input.manufacturer, 120) || null,
          model: text(input.model, 120) || null,
          firmwareVersion: text(input.firmwareVersion, 120) || null,
          notes: text(input.notes, 2000) || null,
        }).returning()
        return NextResponse.json(created, { status: 201 })
      }
      const status = text(input.status, 30) || 'in_service'
      const condition = text(input.condition, 20) || 'good'
      if (!['in_service', 'spare', 'maintenance', 'retired'].includes(status)) return invalid('Select a valid equipment status.')
      if (!['good', 'fair', 'poor'].includes(condition)) return invalid('Select a valid equipment condition.')
      const purchasedAt = input.purchasedAt ? new Date(String(input.purchasedAt)) : null
      if (purchasedAt && !Number.isFinite(purchasedAt.getTime())) return invalid('Enter a valid purchase date.')
      const [created] = await db.insert(equipment).values({
        tenantId: access.tenantId,
        siteId: siteId || null,
        name,
        category,
        serialNumber: serialNumber || null,
        manufacturer: text(input.manufacturer, 120) || null,
        model: text(input.model, 120) || null,
        status,
        condition,
        purchasedAt,
        notes: text(input.notes, 2000) || null,
      }).returning()
      return NextResponse.json(created, { status: 201 })
    }
    if (access.entity === 'invoices') {
      const period = text(input.period, 7)
      const dueAt = new Date(`${text(input.dueAt, 10)}T23:59:59.999Z`)
      if (!/^\d{4}-\d{2}$/.test(period)) return invalid('Select a billing month in YYYY-MM format.')
      const [year, month] = period.split('-').map(Number)
      if (month < 1 || month > 12) return invalid('Select a valid billing month.')
      if (!Number.isFinite(dueAt.getTime())) return invalid('Select a valid invoice due date.')
      const periodStart = new Date(Date.UTC(year, month - 1, 1))
      const periodEnd = new Date(Date.UTC(year, month, 1) - 1)
      const invoiceCustomers = await db.select({
        id: customers.id,
        name: customers.name,
        plan: customers.plan,
        monthlyRate: customers.monthlyRate,
      }).from(customers).where(and(eq(customers.tenantId, access.tenantId), eq(customers.status, 'active'), gte(customers.monthlyRate, 1)))
      const result = await db.transaction(async (tx) => {
        const created = []
        for (const customer of invoiceCustomers) {
          const invoiceNumber = `INV-${period.replace('-', '')}-${customer.id}`
          const [invoice] = await tx.insert(invoices).values({
            tenantId: access.tenantId,
            customerId: customer.id,
            invoiceNumber,
            periodStart,
            periodEnd,
            dueAt,
            amount: customer.monthlyRate,
            description: customer.plan ? `Monthly ${customer.plan} subscription` : 'Monthly internet subscription',
            status: 'issued',
          }).onConflictDoNothing({
            target: [invoices.tenantId, invoices.customerId, invoices.periodStart],
          }).returning({ id: invoices.id })
          if (invoice) created.push(invoice.id)
        }
        return created
      })
      return NextResponse.json({
        created: result.length,
        skipped: invoiceCustomers.length - result.length,
        eligible: invoiceCustomers.length,
        period,
      }, { status: 201 })
    }

    const packageId = text(input.packageId, 50)
    const quantity = Number(input.quantity)
    if (!uuidPattern.test(packageId)) return invalid('Select a valid plan.')
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return invalid('Generate between 1 and 100 vouchers at a time.')
    const [plan] = await db.select().from(packages).where(and(eq(packages.id, packageId), eq(packages.tenantId, access.tenantId), eq(packages.active, true))).limit(1)
    if (!plan) return invalid('Selected plan is unavailable in this workspace.')

    const generated = Array.from({ length: quantity }, () => ({
      username: `LK${randomBytes(7).toString('hex').toUpperCase()}`,
      password: randomBytes(9).toString('base64url'),
    }))
    const created = await db.transaction(async (tx) => {
      const voucherRows = await tx.insert(vouchers).values(generated.map(({ username }) => ({
        tenantId: access.tenantId,
        packageId: plan.id,
        username,
        validitySeconds: plan.durationSeconds,
      }))).returning()
      await tx.insert(radcheck).values(generated.map(({ username, password }) => ({
        tenantId: access.tenantId,
        username,
        attribute: 'Cleartext-Password',
        op: ':=',
        value: password,
      })))
      await tx.insert(radreply).values(generated.map(({ username }) => ({
        tenantId: access.tenantId,
        username,
        attribute: 'Mikrotik-Rate-Limit',
        op: '=',
        value: plan.rateLimit,
      })).concat(generated.map(({ username }) => ({
        tenantId: access.tenantId,
        username,
        attribute: 'Session-Timeout',
        op: '=',
        value: String(plan.durationSeconds),
      }))))
      return voucherRows
    })
    return NextResponse.json({
      vouchers: created.map((voucher, index) => ({
        id: voucher.id,
        username: generated[index].username,
        password: generated[index].password,
        packageName: plan.name,
        validitySeconds: plan.durationSeconds,
      })),
    }, { status: 201 })
  } catch (error) {
    console.error(`Failed to create ${access.entity} record`, error)
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return invalid('A generated voucher conflicted with an existing username. Please try again.', 409)
    return invalid(`Unable to create ${access.entity === 'vouchers' ? 'vouchers' : access.entity.slice(0, -1)}.`, 500)
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const access = await getAuthorizedEntity(request, context)
  if ('response' in access) return access.response
  const id = request.nextUrl.searchParams.get('id') || ''
  if (!uuidPattern.test(id)) return invalid('Record id is invalid.')
  let input: Record<string, unknown>
  try {
    input = await request.json() as Record<string, unknown>
  } catch {
    return invalid('Request body must be valid JSON.')
  }

  try {
    if (access.entity === 'leads') {
      const status = text(input.status, 20)
      if (!leadStatuses.includes(status as typeof leadStatuses[number])) return invalid('Select a valid lead status.')
      const [updated] = await db.update(leads).set({ status, updatedAt: new Date() }).where(and(eq(leads.id, id), eq(leads.tenantId, access.tenantId))).returning()
      return updated ? NextResponse.json(updated) : invalid('Lead not found.', 404)
    }
    if (access.entity === 'tickets') {
      const changes: { status?: string; priority?: string; assignedTo?: string | null; updatedAt: Date } = { updatedAt: new Date() }
      if (input.status !== undefined) {
        const status = text(input.status, 20)
        if (!ticketStatuses.includes(status as typeof ticketStatuses[number])) return invalid('Select a valid ticket status.')
        changes.status = status
      }
      if (input.priority !== undefined) {
        const priority = text(input.priority, 20)
        if (!priorities.includes(priority as typeof priorities[number])) return invalid('Select a valid ticket priority.')
        changes.priority = priority
      }
      if (input.assignedTo !== undefined) changes.assignedTo = text(input.assignedTo, 120) || null
      if (Object.keys(changes).length === 1) return invalid('Provide a ticket field to update.')
      const [updated] = await db.update(supportTickets).set(changes).where(and(eq(supportTickets.id, id), eq(supportTickets.tenantId, access.tenantId))).returning()
      return updated ? NextResponse.json(updated) : invalid('Ticket not found.', 404)
    }
    if (access.entity === 'vouchers') {
      const status = text(input.status, 20)
      if (status !== 'disabled') return invalid('Vouchers can only be disabled after generation.')
      const updated = await db.transaction(async (tx) => {
        const [voucher] = await tx.select({ username: vouchers.username }).from(vouchers).where(and(eq(vouchers.id, id), eq(vouchers.tenantId, access.tenantId))).limit(1)
        if (!voucher) return false
        await tx.delete(radcheck).where(and(eq(radcheck.username, voucher.username), eq(radcheck.tenantId, access.tenantId)))
        await tx.delete(radreply).where(and(eq(radreply.username, voucher.username), eq(radreply.tenantId, access.tenantId)))
        await tx.update(vouchers).set({ status }).where(and(eq(vouchers.id, id), eq(vouchers.tenantId, access.tenantId)))
        return true
      })
      return updated ? NextResponse.json({ ok: true }) : invalid('Voucher not found.', 404)
    }
    if (access.entity === 'equipment') {
      const status = input.status === undefined ? undefined : text(input.status, 30)
      const condition = input.condition === undefined ? undefined : text(input.condition, 20)
      if (status !== undefined && !['in_service', 'spare', 'maintenance', 'retired'].includes(status)) return invalid('Select a valid equipment status.')
      if (condition !== undefined && !['good', 'fair', 'poor'].includes(condition)) return invalid('Select a valid equipment condition.')
      const [updated] = await db.update(equipment).set({
        ...(status !== undefined ? { status } : {}),
        ...(condition !== undefined ? { condition } : {}),
        updatedAt: new Date(),
      }).where(and(eq(equipment.id, id), eq(equipment.tenantId, access.tenantId))).returning()
      return updated ? NextResponse.json(updated) : invalid('Equipment record not found.', 404)
    }
    if (access.entity === 'tr069') {
      const notes = input.notes === undefined ? undefined : text(input.notes, 2000) || null
      if (notes === undefined) return invalid('Only device notes can be updated until a CWMP ACS is connected.')
      const [updated] = await db.update(tr069Devices).set({ notes, updatedAt: new Date() })
        .where(and(eq(tr069Devices.id, id), eq(tr069Devices.tenantId, access.tenantId))).returning()
      return updated ? NextResponse.json(updated) : invalid('TR-069 device not found.', 404)
    }
    if (access.entity === 'invoices') {
      const status = text(input.status, 20)
      if (!['issued', 'paid', 'void'].includes(status)) return invalid('Select a valid invoice status.')
      const [current] = await db.select({ status: invoices.status }).from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.tenantId, access.tenantId))).limit(1)
      if (!current) return invalid('Invoice not found.', 404)
      if (current.status === 'paid' || current.status === 'void') return invalid(`A ${current.status} invoice cannot be changed.`)
      if (status === 'paid' && current.status !== 'issued') return invalid('Issue the invoice before marking it paid.')
      const [updated] = await db.update(invoices).set({
        status,
        paidAt: status === 'paid' ? new Date() : null,
      }).where(and(eq(invoices.id, id), eq(invoices.tenantId, access.tenantId))).returning({ id: invoices.id, status: invoices.status })
      return updated ? NextResponse.json(updated) : invalid('Invoice not found.', 404)
    }
    return invalid('Expense records cannot be changed after creation.')
  } catch (error) {
    console.error(`Failed to update ${access.entity} record`, error)
    return invalid(`Unable to update ${access.entity} record.`, 500)
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const access = await getAuthorizedEntity(request, context)
  if ('response' in access) return access.response
  const id = request.nextUrl.searchParams.get('id') || ''
  if (!uuidPattern.test(id)) return invalid('Record id is invalid.')
  try {
    if (access.entity === 'invoices') return invalid('Invoices are retained for accounting; use void instead of deleting.')
    if (access.entity === 'vouchers') {
      const deleted = await db.transaction(async (tx) => {
        const [voucher] = await tx.select({ username: vouchers.username }).from(vouchers).where(and(
          eq(vouchers.id, id),
          eq(vouchers.tenantId, access.tenantId),
        )).limit(1)
        if (!voucher) return false
        await tx.delete(radcheck).where(and(
          eq(radcheck.username, voucher.username),
          eq(radcheck.tenantId, access.tenantId),
        ))
        await tx.delete(radreply).where(and(
          eq(radreply.username, voucher.username),
          eq(radreply.tenantId, access.tenantId),
        ))
        const removed = await tx.delete(vouchers).where(and(
          eq(vouchers.id, id),
          eq(vouchers.tenantId, access.tenantId),
        )).returning({ id: vouchers.id })
        return removed.length > 0
      })
      return deleted ? NextResponse.json({ ok: true }) : invalid('Voucher not found.', 404)
    }
    const deleted = access.entity === 'leads'
      ? await db.delete(leads).where(and(eq(leads.id, id), eq(leads.tenantId, access.tenantId))).returning({ id: leads.id })
      : access.entity === 'tickets'
        ? await db.delete(supportTickets).where(and(eq(supportTickets.id, id), eq(supportTickets.tenantId, access.tenantId))).returning({ id: supportTickets.id })
        : access.entity === 'expenses'
          ? await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.tenantId, access.tenantId))).returning({ id: expenses.id })
          : access.entity === 'equipment'
            ? await db.delete(equipment).where(and(eq(equipment.id, id), eq(equipment.tenantId, access.tenantId))).returning({ id: equipment.id })
            : await db.delete(tr069Devices).where(and(eq(tr069Devices.id, id), eq(tr069Devices.tenantId, access.tenantId))).returning({ id: tr069Devices.id })
    return deleted.length ? NextResponse.json({ ok: true }) : invalid('Record not found.', 404)
  } catch (error) {
    console.error(`Failed to delete ${access.entity} record`, error)
    return invalid(`Unable to delete ${access.entity} record.`, 500)
  }
}

export const dynamic = 'force-dynamic'
