import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { customers, invoices, radcheck, subscriberCredits, subscriberEvents, supportTickets } from '@/lib/db/schema'
import { requireTenantAdmin } from '@/lib/db/tenant-authorization'
import { sendSubscriberSms } from '@/lib/db/tenant-sms'
import { enqueueTenantTemplateSms } from '@/lib/message-template-delivery'
import { toFreeRadiusExpiration } from '@/lib/hotspot-products'
import { normalizeKenyanPhoneInput } from '@/lib/kenyan-phone'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function responseError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

async function readInput(request: NextRequest) {
  try {
    const input: unknown = await request.json()
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid request.')
    return input as Record<string, unknown>
  } catch {
    return null
  }
}

export async function POST(request: NextRequest, context: RouteContext<'/api/customers/[id]/actions'>) {
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  const { id } = await context.params
  if (!uuidPattern.test(id)) return responseError('Subscriber id is invalid.')
  const input = await readInput(request)
  if (!input) return responseError('Request body must be valid JSON.')
  const action = typeof input.action === 'string' ? input.action : ''
  const tenantId = access.session.tenantId
  const actorId = access.session.userId || null

  try {
    if (action === 'profile') {
      const name = typeof input.name === 'string' ? input.name.trim() : ''
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
      const phoneInput = typeof input.phone === 'string' ? input.phone.trim() : ''
      const phone = phoneInput ? normalizeKenyanPhoneInput(phoneInput) : null
      if (!name || name.length > 120) return responseError('Enter a name up to 120 characters.')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return responseError('Enter a valid email address.')
      if (phoneInput && !phone) return responseError('Enter a phone number starting with 07 followed by 8 digits or +254 followed by 9 digits.')
      const [updated] = await db.transaction(async (tx) => {
        const [customer] = await tx.select({ id: customers.id }).from(customers)
          .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).for('update').limit(1)
        if (!customer) return [null]
        const [row] = await tx.update(customers).set({ name, email, phone })
          .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).returning()
        await tx.insert(subscriberEvents).values({
          tenantId, customerId: id, eventType: 'profile_updated',
          description: 'Subscriber contact information updated.',
          metadata: { name, email, phone }, createdBy: actorId,
        })
        return [row]
      })
      if (!updated) return responseError('Subscriber not found.', 404)
      return NextResponse.json({ customer: updated })
    }

    if (action === 'note') {
      const note = typeof input.note === 'string' ? input.note.trim() : ''
      if (!note || note.length > 2000) return responseError('Notes must be between 1 and 2,000 characters.')
      const [customer] = await db.select({ id: customers.id }).from(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).limit(1)
      if (!customer) return responseError('Subscriber not found.', 404)
      const [event] = await db.insert(subscriberEvents).values({
        tenantId, customerId: id, eventType: 'note', description: note, createdBy: actorId,
      }).returning({ id: subscriberEvents.id, description: subscriberEvents.description, createdAt: subscriberEvents.createdAt })
      return NextResponse.json({ event }, { status: 201 })
    }

    if (action === 'vip') {
      const isVip = input.isVip
      if (typeof isVip !== 'boolean') return responseError('VIP status must be true or false.')
      const [updated] = await db.transaction(async (tx) => {
        const [customer] = await tx.select({ id: customers.id, isVip: customers.isVip }).from(customers)
          .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).for('update').limit(1)
        if (!customer) return [null]
        const [row] = await tx.update(customers).set({ isVip })
          .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).returning()
        await tx.insert(subscriberEvents).values({
          tenantId,
          customerId: id,
          eventType: 'vip_status_changed',
          description: isVip ? 'Subscriber marked as VIP.' : 'Subscriber VIP marker removed.',
          metadata: { isVip },
          createdBy: actorId,
        })
        return [row]
      })
      if (!updated) return responseError('Subscriber not found.', 404)
      return NextResponse.json({ customer: updated })
    }

    if (action === 'subscription') {
      const status = input.status
      const rawExpiry = input.expiresAt
      if (status !== 'active' && status !== 'suspended' && status !== 'blocked') return responseError('Choose active, paused, or blocked status.')
      if (rawExpiry !== undefined && (typeof rawExpiry !== 'string' || !Number.isFinite(new Date(rawExpiry).getTime()))) {
        return responseError('Choose a valid subscription expiry.')
      }
      const outcome = await db.transaction(async (tx) => {
        const [customer] = await tx.select().from(customers).where(and(
          eq(customers.id, id), eq(customers.tenantId, tenantId),
        )).for('update').limit(1)
        if (!customer) return { error: 'Subscriber not found.', status: 404 }
        if (!customer.radiusUsername) return { error: 'Subscriber has no RADIUS login to update.', status: 409 }
        const expiry = typeof rawExpiry === 'string' ? new Date(rawExpiry) : customer.expiresAt
        if (status === 'active' && expiry && expiry.getTime() <= Date.now()) return { error: 'Expiry must be in the future.', status: 400 }
        if (status === 'active' && !expiry) return { error: 'Set an expiry date before activating this subscriber.', status: 400 }
        if (status !== 'active') {
          await tx.delete(radcheck).where(and(
            eq(radcheck.tenantId, tenantId), eq(radcheck.username, customer.radiusUsername),
            eq(radcheck.attribute, 'Auth-Type'),
          ))
          await tx.insert(radcheck).values({
            tenantId, username: customer.radiusUsername, attribute: 'Auth-Type', op: ':=', value: 'Reject',
          })
        } else {
          await tx.delete(radcheck).where(and(
            eq(radcheck.tenantId, tenantId), eq(radcheck.username, customer.radiusUsername),
            eq(radcheck.attribute, 'Auth-Type'), eq(radcheck.value, 'Reject'),
          ))
          const [expirationRule] = await tx.select({ id: radcheck.id }).from(radcheck).where(and(
            eq(radcheck.tenantId, tenantId), eq(radcheck.username, customer.radiusUsername),
            eq(radcheck.attribute, 'Expiration'),
          )).limit(1)
          if (expirationRule) {
            await tx.update(radcheck).set({ value: toFreeRadiusExpiration(expiry!), op: ':=' })
              .where(eq(radcheck.id, expirationRule.id))
          } else {
            await tx.insert(radcheck).values({
              tenantId, username: customer.radiusUsername, attribute: 'Expiration', op: ':=',
              value: toFreeRadiusExpiration(expiry!),
            })
          }
        }
        await tx.update(customers).set({ status, expiresAt: status === 'active' ? expiry : customer.expiresAt })
          .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
        const description = status === 'suspended'
          ? 'Subscription paused; new RADIUS logins are blocked.'
          : status === 'blocked'
            ? 'Subscriber blocked; new RADIUS logins are rejected.'
            : `Subscription active until ${expiry!.toISOString()}.`
        await tx.insert(subscriberEvents).values({
          tenantId, customerId: id, eventType: status === 'active' ? 'subscription_updated' : status === 'blocked' ? 'subscriber_blocked' : 'subscription_paused',
          description, metadata: { status, expiresAt: expiry?.toISOString() || null }, createdBy: actorId,
        })
        return { updated: true }
      })
      if ('error' in outcome) return responseError(outcome.error || 'Unable to update subscription.', outcome.status || 400)
      return NextResponse.json(outcome)
    }

    if (action === 'extend' || action === 'credit') {
      const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
      if (!reason || reason.length > 500) return responseError('Enter a reason up to 500 characters.')
      const idempotencyKey = typeof input.idempotencyKey === 'string' && uuidPattern.test(input.idempotencyKey)
        ? input.idempotencyKey
        : randomUUID()
      if (action === 'extend') {
        const days = Number(input.days)
        if (!Number.isInteger(days) || days < 1 || days > 365) return responseError('Choose a service extension from 1 to 365 days.')
        const result = await db.transaction(async (tx) => {
          const [customer] = await tx.select().from(customers).where(and(
            eq(customers.id, id), eq(customers.tenantId, tenantId),
          )).for('update').limit(1)
          if (!customer) return { error: 'Subscriber not found.', status: 404 }
          if (!customer.radiusUsername) return { error: 'Subscriber has no RADIUS login to update.', status: 409 }
          const [existing] = await tx.select({ id: subscriberEvents.id }).from(subscriberEvents).where(and(
            eq(subscriberEvents.tenantId, tenantId),
            eq(subscriberEvents.customerId, id),
            eq(subscriberEvents.eventType, 'compensation'),
            sql`${subscriberEvents.metadata} ->> 'idempotencyKey' = ${idempotencyKey}`,
          )).limit(1)
          if (existing) return { duplicate: true }
          const baseTime = customer.expiresAt && customer.expiresAt.getTime() > Date.now() ? customer.expiresAt.getTime() : Date.now()
          const expiry = new Date(baseTime + days * 86_400_000)
          await tx.delete(radcheck).where(and(
            eq(radcheck.tenantId, tenantId), eq(radcheck.username, customer.radiusUsername),
            eq(radcheck.attribute, 'Auth-Type'), eq(radcheck.value, 'Reject'),
          ))
          const [expirationRule] = await tx.select({ id: radcheck.id }).from(radcheck).where(and(
            eq(radcheck.tenantId, tenantId), eq(radcheck.username, customer.radiusUsername),
            eq(radcheck.attribute, 'Expiration'),
          )).limit(1)
          if (expirationRule) {
            await tx.update(radcheck).set({ value: toFreeRadiusExpiration(expiry), op: ':=' })
              .where(eq(radcheck.id, expirationRule.id))
          } else {
            await tx.insert(radcheck).values({
              tenantId, username: customer.radiusUsername, attribute: 'Expiration', op: ':=',
              value: toFreeRadiusExpiration(expiry),
            })
          }
          await tx.update(customers).set({ status: 'active', expiresAt: expiry })
            .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
          await tx.insert(subscriberEvents).values({
            tenantId, customerId: id, eventType: 'compensation',
            description: `${days} complimentary service day${days === 1 ? '' : 's'} added: ${reason}`,
            metadata: { days, expiresAt: expiry.toISOString(), idempotencyKey }, createdBy: actorId,
          })
          return { expiresAt: expiry.toISOString() }
        })
        if ('error' in result) return responseError(result.error || 'Unable to extend this subscription.', result.status || 400)
        return NextResponse.json(result, { status: 'duplicate' in result ? 200 : 201 })
      }

      const amount = Number(input.amount)
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10_000_000) return responseError('Enter a credit amount from 1 to 10,000,000.')
      const result = await db.transaction(async (tx) => {
        const [customer] = await tx.select({ id: customers.id, name: customers.name, phone: customers.phone }).from(customers).where(and(
          eq(customers.id, id), eq(customers.tenantId, tenantId),
        )).for('update').limit(1)
        if (!customer) return { error: 'Subscriber not found.', status: 404 }
        const [existing] = await tx.select({ id: subscriberCredits.id }).from(subscriberCredits).where(and(
          eq(subscriberCredits.tenantId, tenantId), eq(subscriberCredits.customerId, id),
          eq(subscriberCredits.reference, idempotencyKey),
        )).limit(1)
        if (existing) return { duplicate: true }
        const [entry] = await tx.insert(subscriberCredits).values({
          tenantId, customerId: id, type: 'credit', amount, reason,
          reference: idempotencyKey, createdBy: actorId,
        }).returning({ id: subscriberCredits.id })
        await tx.insert(subscriberEvents).values({
          tenantId, customerId: id, eventType: 'credit',
          description: `Account credit of KSh ${amount.toLocaleString('en-KE')} added: ${reason}`,
          metadata: { amount, reason, creditId: entry.id }, createdBy: actorId,
        })
        const [balance] = await tx.select({
          amount: sql<number>`coalesce(sum(case when ${subscriberCredits.type} = 'credit' then ${subscriberCredits.amount} else -${subscriberCredits.amount} end), 0)::int`,
        }).from(subscriberCredits).where(and(
          eq(subscriberCredits.tenantId, tenantId),
          eq(subscriberCredits.customerId, id),
        ))
        return { creditId: entry.id, name: customer.name, phone: customer.phone, balance: Number(balance?.amount || 0) }
      })
      if ('error' in result) return responseError(result.error || 'Unable to add account credit.', result.status || 400)
      if (!('duplicate' in result) && result.phone) {
        await enqueueTenantTemplateSms(
          tenantId,
          `pppoe-credit:${result.creditId}`,
          result.phone,
          'pppoeCreditApplied',
          { name: result.name, amount, balance: result.balance },
          { customerId: id },
        )
      }
      return NextResponse.json(result, { status: 'duplicate' in result ? 200 : 201 })
    }

    if (action === 'invoice') {
      const dueAtInput = typeof input.dueAt === 'string' ? input.dueAt : ''
      const dueAt = new Date(`${dueAtInput}T23:59:59.999Z`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueAtInput) || !Number.isFinite(dueAt.getTime())) return responseError('Choose a valid invoice due date.')
      const year = new Date().getUTCFullYear()
      const month = new Date().getUTCMonth()
      const periodStart = new Date(Date.UTC(year, month, 1))
      const periodEnd = new Date(Date.UTC(year, month + 1, 1) - 1)
      const period = `${year}${String(month + 1).padStart(2, '0')}`
      const invoiceNumber = `INV-${period}-${id}`
      const result = await db.transaction(async (tx) => {
        const [customer] = await tx.select().from(customers).where(and(
          eq(customers.id, id), eq(customers.tenantId, tenantId),
        )).for('update').limit(1)
        if (!customer) return { error: 'Subscriber not found.', httpStatus: 404 }
        if (customer.monthlyRate < 1) return { error: 'Set a monthly rate before generating an invoice.', httpStatus: 409 }
        const [existing] = await tx.select({ id: invoices.id }).from(invoices).where(and(
          eq(invoices.tenantId, tenantId), eq(invoices.customerId, id), eq(invoices.periodStart, periodStart),
        )).limit(1)
        if (existing) return { error: 'An invoice already exists for this subscriber this month.', httpStatus: 409 }
        const [balanceRow] = await tx.select({
          amount: sql<number>`coalesce(sum(case when ${subscriberCredits.type} = 'credit' then ${subscriberCredits.amount} else -${subscriberCredits.amount} end), 0)::int`,
        }).from(subscriberCredits).where(and(
          eq(subscriberCredits.tenantId, tenantId), eq(subscriberCredits.customerId, id),
        ))
        const creditBalance = Number(balanceRow?.amount || 0)
        const coveredByCredit = creditBalance >= customer.monthlyRate
        const [invoice] = await tx.insert(invoices).values({
          tenantId, customerId: id, invoiceNumber, periodStart, periodEnd, dueAt,
          amount: customer.monthlyRate,
          description: customer.plan ? `Monthly ${customer.plan} subscription` : 'Monthly internet subscription',
          status: coveredByCredit ? 'paid' : 'issued',
          paidAt: coveredByCredit ? new Date() : null,
        }).returning({ id: invoices.id })
        if (coveredByCredit) {
          await tx.insert(subscriberCredits).values({
            tenantId, customerId: id, type: 'debit', amount: customer.monthlyRate,
            reason: `Applied to invoice ${invoiceNumber}`, reference: invoice.id, createdBy: actorId,
          })
        }
        await tx.insert(subscriberEvents).values({
          tenantId, customerId: id, eventType: 'invoice',
          description: `Invoice ${invoiceNumber} created${coveredByCredit ? ' and paid using account credit' : ''}.`,
          metadata: { invoiceId: invoice.id, amount: customer.monthlyRate, coveredByCredit }, createdBy: actorId,
        })
        return { invoiceId: invoice.id, invoiceNumber, status: coveredByCredit ? 'paid' : 'issued', amount: customer.monthlyRate }
      })
      if ('error' in result) return responseError(result.error || 'Unable to generate the invoice.', result.httpStatus || 400)
      return NextResponse.json(result, { status: 201 })
    }

    if (action === 'ticket') {
      const subject = typeof input.subject === 'string' ? input.subject.trim() : ''
      const description = typeof input.description === 'string' ? input.description.trim() : ''
      const priority = input.priority
      if (!subject || subject.length > 180) return responseError('Enter a ticket subject up to 180 characters.')
      if (!description || description.length > 4000) return responseError('Enter a description up to 4,000 characters.')
      if (!['low', 'normal', 'high', 'urgent'].includes(String(priority))) return responseError('Choose a valid ticket priority.')
      const [customer] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))).limit(1)
      if (!customer) return responseError('Subscriber not found.', 404)
      const [ticket] = await db.insert(supportTickets).values({
        tenantId, customerId: id, requesterName: customer.name, requesterEmail: customer.email,
        subject, description, priority: String(priority),
      }).returning({ id: supportTickets.id })
      await db.insert(subscriberEvents).values({
        tenantId, customerId: id, eventType: 'ticket',
        description: `Support ticket created: ${subject}`,
        metadata: { ticketId: ticket.id, priority }, createdBy: actorId,
      })
      return NextResponse.json({ ticketId: ticket.id }, { status: 201 })
    }

    if (action === 'sms' || action === 'credentials' || action === 'payment_details') {
      const [customer] = await db.select().from(customers).where(and(
        eq(customers.id, id), eq(customers.tenantId, tenantId),
      )).limit(1)
      if (!customer) return responseError('Subscriber not found.', 404)
      if (!customer.phone) return responseError('Add a phone number before sending SMS.', 409)
      let message = typeof input.message === 'string' ? input.message.trim() : ''
      if (action === 'credentials') {
        const [credential] = customer.radiusUsername ? await db.select({ password: radcheck.value }).from(radcheck).where(and(
          eq(radcheck.tenantId, tenantId), eq(radcheck.username, customer.radiusUsername),
          eq(radcheck.attribute, 'Cleartext-Password'),
        )).limit(1) : []
        if (!customer.radiusUsername || !credential?.password) return responseError('Subscriber credentials are unavailable.', 409)
        message = `Hello ${customer.name}, your internet login is ${customer.radiusUsername} and password is ${credential.password}. Keep these credentials private.`
      } else if (action === 'payment_details') {
        message = `Hello ${customer.name}, your internet plan${customer.plan ? ` (${customer.plan})` : ''} is KSh ${customer.monthlyRate.toLocaleString('en-KE')} per month. Contact support if you need help with payment.`
      } else if (!message || message.length > 500) {
        return responseError('SMS message must be between 1 and 500 characters.')
      }
      const result = await sendSubscriberSms(tenantId, id, message)
      if ('error' in result) return responseError(result.error || 'Unable to send SMS.', result.httpStatus || 503)
      const description = action === 'credentials' ? 'Subscriber credentials sent by SMS.' :
        action === 'payment_details' ? 'Payment details sent by SMS.' : 'Custom SMS sent to subscriber.'
      await db.insert(subscriberEvents).values({
        tenantId, customerId: id, eventType: 'sms', description,
        metadata: { status: result.status, phone: customer.phone }, createdBy: actorId,
      })
      return NextResponse.json({
        status: result.status,
        message: result.status === 'sent' ? 'SMS sent successfully.' : 'SMS queued for delivery.',
      }, { status: result.status === 'sent' ? 200 : 202 })
    }

    return responseError('Choose a supported subscriber action.')
  } catch (error) {
    console.error('Failed to perform subscriber action', { tenantId, customerId: id, action, error })
    return NextResponse.json({ error: 'Unable to complete this subscriber action. Please refresh and try again.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
