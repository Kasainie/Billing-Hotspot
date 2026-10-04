import { randomBytes } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { normalizeKenyanPhone, verifyStkTransaction } from '@/lib/daraja'
import { db } from '@/lib/db'
import { customers, hotspotPurchases, payments, pppoeAccounts, pppoePayments, radcheck, radreply } from '@/lib/db/schema'
import { toFreeRadiusExpiration, toHotspotRadiusReplies } from '@/lib/hotspot-products'
import { getTenantDarajaConfiguration } from '@/lib/db/tenant-payments'

type DarajaCallback = {
  Body?: { stkCallback?: {
    CheckoutRequestID?: unknown
    ResultCode?: unknown
    ResultDesc?: unknown
    CallbackMetadata?: { Item?: Array<{ Name?: unknown; Value?: unknown }> }
  } }
}

function metadataValue(items: Array<{ Name?: unknown; Value?: unknown }>, name: string) {
  return items.find((item) => item.Name === name)?.Value
}

async function processPppoePayment(callback: DarajaCallback, checkoutRequestId: string) {
  const [payment] = await db.select().from(pppoePayments)
    .where(eq(pppoePayments.checkoutRequestId, checkoutRequestId))
    .limit(1)
  if (!payment) return null
  if (payment.status === 'completed' || payment.status === 'failed') {
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }
  const darajaConfiguration = await getTenantDarajaConfiguration(payment.tenantId)
  if (!darajaConfiguration) return NextResponse.json({ ResultCode: 1, ResultDesc: 'Workspace payment settings are not configured.' }, { status: 503 })

  const stkCallback = callback.Body?.stkCallback
  if (!stkCallback) return NextResponse.json({ ResultCode: 1, ResultDesc: 'Missing checkout request.' }, { status: 400 })
  const callbackItems = Array.isArray(stkCallback.CallbackMetadata?.Item) ? stkCallback.CallbackMetadata.Item : []
  const receiptValue = metadataValue(callbackItems, 'MpesaReceiptNumber')
  const amountValue = Number(metadataValue(callbackItems, 'Amount'))
  const phoneValue = normalizeKenyanPhone(String(metadataValue(callbackItems, 'PhoneNumber') || ''))

  if (Number(stkCallback.ResultCode) !== 0) {
    await db.update(pppoePayments).set({
      status: 'failed',
      failureReason: typeof stkCallback.ResultDesc === 'string' ? stkCallback.ResultDesc.slice(0, 180) : 'M-Pesa payment was not completed.',
      callbackPayload: callback as never,
    }).where(and(eq(pppoePayments.id, payment.id), eq(pppoePayments.tenantId, payment.tenantId), inArray(pppoePayments.status, ['initiating', 'pending'])))
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }

  const verification = await verifyStkTransaction(checkoutRequestId, darajaConfiguration)
  if (Number(verification.ResultCode) !== 0) {
    await db.update(pppoePayments).set({
      status: 'failed',
      failureReason: typeof verification.ResultDesc === 'string' ? verification.ResultDesc.slice(0, 180) : 'Safaricom could not confirm payment.',
      callbackPayload: callback as never,
    }).where(and(eq(pppoePayments.id, payment.id), eq(pppoePayments.tenantId, payment.tenantId), inArray(pppoePayments.status, ['initiating', 'pending'])))
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }

  const [account] = await db.select({ phone: pppoeAccounts.phone })
    .from(pppoeAccounts).where(and(eq(pppoeAccounts.accountNumber, payment.accountNumber), eq(pppoeAccounts.tenantId, payment.tenantId))).limit(1)
  if (amountValue !== payment.amount || phoneValue !== account?.phone || typeof receiptValue !== 'string' || !/^[A-Z0-9]{8,20}$/.test(receiptValue)) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Payment details did not match the checkout.' }, { status: 409 })
  }

  await db.transaction(async (tx) => {
    const [lockedPayment] = await tx.select().from(pppoePayments)
      .where(and(eq(pppoePayments.id, payment.id), eq(pppoePayments.tenantId, payment.tenantId), inArray(pppoePayments.status, ['initiating', 'pending'])))
      .for('update')
      .limit(1)
    if (!lockedPayment) return

    const [lockedAccount] = await tx.select().from(pppoeAccounts)
      .where(and(eq(pppoeAccounts.accountNumber, lockedPayment.accountNumber), eq(pppoeAccounts.tenantId, lockedPayment.tenantId)))
      .for('update')
      .limit(1)
    if (!lockedAccount) throw new Error('PPPoE payment account was not found.')

    const paidAt = new Date()
    let customerId = lockedAccount.customerId
    let radiusUsername: string
    let radiusPassword: string | null = null
    let existingExpiry: Date | null = null
    if (customerId) {
      const [customer] = await tx.select({
        radiusUsername: customers.radiusUsername,
        expiresAt: customers.expiresAt,
      }).from(customers).where(and(eq(customers.id, customerId), eq(customers.tenantId, lockedPayment.tenantId))).limit(1)
      if (!customer?.radiusUsername) throw new Error('PPPoE customer has no RADIUS username.')
      radiusUsername = customer.radiusUsername
      existingExpiry = customer.expiresAt
    } else {
      radiusUsername = `pp${lockedAccount.accountNumber}_${randomBytes(3).toString('hex')}`
      radiusPassword = randomBytes(12).toString('hex')
    }

    const expiresAt = new Date(Math.max(existingExpiry?.getTime() || 0, paidAt.getTime()) + lockedPayment.durationSeconds * 1000)
    const policy = lockedPayment.packageSnapshot
    if (!customerId) {
      if (!radiusPassword) throw new Error('PPPoE password was not generated.')
      const [customer] = await tx.insert(customers).values({
        tenantId: lockedPayment.tenantId,
        name: lockedAccount.name,
        email: lockedAccount.email,
        phone: lockedAccount.phone,
        status: 'active',
        plan: lockedPayment.productName,
        monthlyRate: lockedPayment.amount,
        expiresAt,
        radiusUsername,
      }).returning({ id: customers.id })
      customerId = customer.id
      await tx.update(pppoeAccounts).set({ customerId }).where(and(eq(pppoeAccounts.accountNumber, lockedAccount.accountNumber), eq(pppoeAccounts.tenantId, lockedPayment.tenantId)))
      await tx.insert(radcheck).values({
        tenantId: lockedPayment.tenantId,
        username: radiusUsername,
        attribute: 'Cleartext-Password',
        op: ':=',
        value: radiusPassword,
      })
    }

    for (const [attribute, value] of [
      ['Expiration', toFreeRadiusExpiration(expiresAt)],
      ['Simultaneous-Use', String(policy.devicesPerAccount)],
    ]) {
      const [rule] = await tx.select({ id: radcheck.id }).from(radcheck).where(and(
        eq(radcheck.username, radiusUsername),
        eq(radcheck.tenantId, lockedPayment.tenantId),
        eq(radcheck.attribute, attribute),
      )).limit(1)
      if (rule) {
        await tx.update(radcheck).set({ value, op: ':=' }).where(and(
          eq(radcheck.id, rule.id),
          eq(radcheck.tenantId, lockedPayment.tenantId),
        ))
      } else {
        await tx.insert(radcheck).values({ tenantId: lockedPayment.tenantId, username: radiusUsername, attribute, op: ':=', value })
      }
    }

    await tx.delete(radcheck).where(and(
      eq(radcheck.username, radiusUsername),
      eq(radcheck.tenantId, lockedPayment.tenantId),
      eq(radcheck.attribute, 'Auth-Type'),
      eq(radcheck.value, 'Reject'),
    ))

    await tx.delete(radreply).where(and(
      eq(radreply.username, radiusUsername),
      eq(radreply.tenantId, lockedPayment.tenantId),
      eq(radreply.attribute, 'Mikrotik-Rate-Limit'),
    ))
    await tx.insert(radreply).values({
      tenantId: lockedPayment.tenantId,
      username: radiusUsername,
      attribute: 'Mikrotik-Rate-Limit',
      op: '=',
      value: policy.rateLimit,
    })
    await tx.update(customers).set({
      status: 'active',
      plan: lockedPayment.productName,
      monthlyRate: lockedPayment.amount,
      expiresAt,
    }).where(and(eq(customers.id, customerId), eq(customers.tenantId, lockedPayment.tenantId)))
    await tx.insert(payments).values({
      tenantId: lockedPayment.tenantId,
      customerId,
      amount: lockedPayment.amount,
      status: 'paid',
      method: 'M-Pesa',
      reference: receiptValue,
      paidAt,
    })
    await tx.update(pppoePayments).set({
      status: 'completed',
      receipt: receiptValue,
      paidAt,
      failureReason: null,
      callbackPayload: callback as never,
    }).where(and(eq(pppoePayments.id, lockedPayment.id), eq(pppoePayments.tenantId, lockedPayment.tenantId)))
  })

  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
}

export async function POST(request: NextRequest) {
  let callback: DarajaCallback
  try {
    callback = await request.json() as DarajaCallback
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid callback body.' }, { status: 400 })
  }

  const stkCallback = callback.Body?.stkCallback
  const checkoutRequestId = typeof stkCallback?.CheckoutRequestID === 'string' ? stkCallback.CheckoutRequestID : ''
  if (!stkCallback || !checkoutRequestId) return NextResponse.json({ ResultCode: 1, ResultDesc: 'Missing checkout request.' }, { status: 400 })

  try {
    const pppoeResponse = await processPppoePayment(callback, checkoutRequestId)
    if (pppoeResponse) return pppoeResponse

    const [purchase] = await db.select().from(hotspotPurchases)
      .where(eq(hotspotPurchases.checkoutRequestId, checkoutRequestId))
      .limit(1)
    if (!purchase) return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    if (purchase.status === 'completed' || purchase.status === 'failed') return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    const darajaConfiguration = await getTenantDarajaConfiguration(purchase.tenantId)
    if (!darajaConfiguration) return NextResponse.json({ ResultCode: 1, ResultDesc: 'Workspace payment settings are not configured.' }, { status: 503 })

    const callbackItems = Array.isArray(stkCallback.CallbackMetadata?.Item) ? stkCallback.CallbackMetadata.Item : []
    const receiptValue = metadataValue(callbackItems, 'MpesaReceiptNumber')
    const amountValue = Number(metadataValue(callbackItems, 'Amount'))
    const phoneValue = normalizeKenyanPhone(String(metadataValue(callbackItems, 'PhoneNumber') || ''))
    const callbackSucceeded = Number(stkCallback.ResultCode) === 0

    if (!callbackSucceeded) {
      await db.update(hotspotPurchases).set({
        status: 'failed',
        failureReason: typeof stkCallback.ResultDesc === 'string' ? stkCallback.ResultDesc.slice(0, 180) : 'M-Pesa payment was not completed.',
        callbackPayload: callback as never,
      }).where(and(eq(hotspotPurchases.id, purchase.id), eq(hotspotPurchases.tenantId, purchase.tenantId), inArray(hotspotPurchases.status, ['initiating', 'pending'])))
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    const verification = await verifyStkTransaction(checkoutRequestId, darajaConfiguration)
    if (Number(verification.ResultCode) !== 0) {
      await db.update(hotspotPurchases).set({
        status: 'failed',
        failureReason: typeof verification.ResultDesc === 'string' ? verification.ResultDesc.slice(0, 180) : 'Safaricom could not confirm payment.',
        callbackPayload: callback as never,
      }).where(and(eq(hotspotPurchases.id, purchase.id), eq(hotspotPurchases.tenantId, purchase.tenantId), inArray(hotspotPurchases.status, ['initiating', 'pending'])))
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    if (amountValue !== purchase.amount || phoneValue !== purchase.phone || typeof receiptValue !== 'string' || !/^[A-Z0-9]{8,20}$/.test(receiptValue)) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Payment details did not match the checkout.' }, { status: 409 })
    }

    const radiusUsername = `lk${randomBytes(6).toString('hex')}`
    const radiusPassword = randomBytes(12).toString('hex')
    await db.transaction(async (tx) => {
      const [lockedPurchase] = await tx.select().from(hotspotPurchases)
        .where(and(eq(hotspotPurchases.id, purchase.id), eq(hotspotPurchases.tenantId, purchase.tenantId), inArray(hotspotPurchases.status, ['initiating', 'pending'])))
        .for('update')
        .limit(1)
      if (!lockedPurchase) return

      const packagePolicy = lockedPurchase.packageSnapshot
      const paidAt = new Date()
      const expiresAt = new Date(paidAt.getTime() + lockedPurchase.durationSeconds * 1000)
      const checkRules = [
        { tenantId: lockedPurchase.tenantId, username: radiusUsername, attribute: 'Cleartext-Password', op: ':=', value: radiusPassword },
        { tenantId: lockedPurchase.tenantId, username: radiusUsername, attribute: 'Simultaneous-Use', op: ':=', value: String(packagePolicy?.devicesPerAccount || 1) },
        { tenantId: lockedPurchase.tenantId, username: radiusUsername, attribute: 'Expiration', op: ':=', value: toFreeRadiusExpiration(expiresAt) },
      ]
      if (packagePolicy?.scheduleEnabled && packagePolicy.scheduleSpec) {
        checkRules.push({ tenantId: lockedPurchase.tenantId, username: radiusUsername, attribute: 'Login-Time', op: '==', value: packagePolicy.scheduleSpec })
      }
      if (packagePolicy?.nasRestrictions.length) {
        const allowedNas = packagePolicy.nasRestrictions.map((address) => address.replace(/\./g, '\\.')).join('|')
        checkRules.push({ tenantId: lockedPurchase.tenantId, username: radiusUsername, attribute: 'NAS-IP-Address', op: '=~', value: `^(${allowedNas})$` })
      }
      await tx.insert(radcheck).values(checkRules)

      const replyRules = toHotspotRadiusReplies(radiusUsername, {
        durationSeconds: lockedPurchase.durationSeconds,
        devicesPerAccount: packagePolicy?.devicesPerAccount || 1,
        rateLimit: packagePolicy?.rateLimit,
        burstLimit: packagePolicy?.burstLimit || null,
        burstThreshold: packagePolicy?.burstThreshold || null,
        burstTimeSeconds: packagePolicy?.burstTimeSeconds || null,
        fupEnabled: packagePolicy?.fupEnabled || false,
        fupLimitBytes: packagePolicy?.fupLimitBytes || null,
      })
      await tx.insert(radreply).values(replyRules.map((reply) => ({ ...reply, tenantId: lockedPurchase.tenantId })))
      await tx.insert(payments).values({ tenantId: lockedPurchase.tenantId, amount: lockedPurchase.amount, status: 'paid', method: 'M-Pesa', reference: receiptValue })
      await tx.update(hotspotPurchases).set({
        status: 'completed',
        receipt: receiptValue,
        radiusUsername,
        paidAt,
        failureReason: null,
        callbackPayload: callback as never,
      }).where(and(eq(hotspotPurchases.id, lockedPurchase.id), eq(hotspotPurchases.tenantId, lockedPurchase.tenantId)))
    })

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  } catch (error) {
    console.error('Failed to process Daraja payment callback', error)
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Callback could not be processed.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'