import { randomBytes } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, hotspotPurchases, payments, pppoeAccounts, pppoePayments, radcheck, radreply } from '@/lib/db/schema'
import { toFreeRadiusExpiration, toHotspotRadiusReplies } from '@/lib/hotspot-products'
import { enqueueTenantSms } from '@/lib/db/tenant-sms'
import type { PaymentGatewayProvider } from '@/lib/payment-gateways'

const providerNames: Record<PaymentGatewayProvider, string> = {
  'airtel-money': 'Airtel Money',
  pesapal: 'Pesapal',
  intasend: 'IntaSend',
}

export async function fulfillGatewayPayment(input: {
  purchaseId: string
  provider: PaymentGatewayProvider
  receipt: string | null
  providerPayload: Record<string, unknown>
}) {
  const receipt = input.receipt || `${input.provider}:${input.purchaseId}`
  const [pppoePayment] = await db.select({ id: pppoePayments.id, tenantId: pppoePayments.tenantId })
    .from(pppoePayments).where(and(
      eq(pppoePayments.id, input.purchaseId),
      eq(pppoePayments.gatewayProvider, input.provider),
    )).limit(1)

  if (pppoePayment) {
    const notification = await db.transaction(async (tx) => {
      const [payment] = await tx.select().from(pppoePayments).where(and(
        eq(pppoePayments.id, pppoePayment.id),
        eq(pppoePayments.tenantId, pppoePayment.tenantId),
        eq(pppoePayments.gatewayProvider, input.provider),
        inArray(pppoePayments.status, ['initiating', 'pending']),
      )).for('update').limit(1)
      if (!payment) return null

      const [account] = await tx.select().from(pppoeAccounts).where(and(
        eq(pppoeAccounts.accountNumber, payment.accountNumber),
        eq(pppoeAccounts.tenantId, payment.tenantId),
      )).for('update').limit(1)
      if (!account) throw new Error('PPPoE payment account was not found.')

      const paidAt = new Date()
      let customerId = account.customerId
      let username: string
      let password: string | null = null
      let currentExpiry: Date | null = null
      if (customerId) {
        const [customer] = await tx.select({
          radiusUsername: customers.radiusUsername,
          expiresAt: customers.expiresAt,
        }).from(customers).where(and(
          eq(customers.id, customerId),
          eq(customers.tenantId, payment.tenantId),
        )).limit(1)
        if (!customer?.radiusUsername) throw new Error('PPPoE customer has no RADIUS username.')
        username = customer.radiusUsername
        currentExpiry = customer.expiresAt
      } else {
        username = `pp${account.accountNumber}_${randomBytes(3).toString('hex')}`
        password = randomBytes(12).toString('hex')
      }
      const expiresAt = new Date(Math.max(currentExpiry?.getTime() || 0, paidAt.getTime()) + payment.durationSeconds * 1000)
      if (!customerId) {
        if (!password) throw new Error('PPPoE password was not generated.')
        const [customer] = await tx.insert(customers).values({
          tenantId: payment.tenantId,
          name: account.name,
          email: account.email,
          phone: account.phone,
          status: 'active',
          plan: payment.productName,
          monthlyRate: payment.amount,
          expiresAt,
          radiusUsername: username,
        }).returning({ id: customers.id })
        customerId = customer.id
        await tx.update(pppoeAccounts).set({ customerId }).where(and(
          eq(pppoeAccounts.accountNumber, account.accountNumber),
          eq(pppoeAccounts.tenantId, payment.tenantId),
        ))
        await tx.insert(radcheck).values({
          tenantId: payment.tenantId,
          username,
          attribute: 'Cleartext-Password',
          op: ':=',
          value: password,
        })
      }
      if (!password) {
        const [credential] = await tx.select({ value: radcheck.value }).from(radcheck).where(and(
          eq(radcheck.username, username),
          eq(radcheck.tenantId, payment.tenantId),
          eq(radcheck.attribute, 'Cleartext-Password'),
        )).limit(1)
        password = credential?.value || null
      }

      for (const [attribute, value] of [
        ['Expiration', toFreeRadiusExpiration(expiresAt)],
        ['Simultaneous-Use', String(payment.packageSnapshot.devicesPerAccount)],
      ]) {
        const [rule] = await tx.select({ id: radcheck.id }).from(radcheck).where(and(
          eq(radcheck.username, username),
          eq(radcheck.tenantId, payment.tenantId),
          eq(radcheck.attribute, attribute),
        )).limit(1)
        if (rule) {
          await tx.update(radcheck).set({ value, op: ':=' }).where(and(
            eq(radcheck.id, rule.id),
            eq(radcheck.tenantId, payment.tenantId),
          ))
        } else {
          await tx.insert(radcheck).values({
            tenantId: payment.tenantId,
            username,
            attribute,
            op: ':=',
            value,
          })
        }
      }
      await tx.delete(radcheck).where(and(
        eq(radcheck.username, username),
        eq(radcheck.tenantId, payment.tenantId),
        eq(radcheck.attribute, 'Auth-Type'),
        eq(radcheck.value, 'Reject'),
      ))
      await tx.delete(radreply).where(and(
        eq(radreply.username, username),
        eq(radreply.tenantId, payment.tenantId),
        eq(radreply.attribute, 'Mikrotik-Rate-Limit'),
      ))
      await tx.insert(radreply).values({
        tenantId: payment.tenantId,
        username,
        attribute: 'Mikrotik-Rate-Limit',
        op: '=',
        value: payment.packageSnapshot.rateLimit,
      })
      await tx.update(customers).set({
        status: 'active',
        plan: payment.productName,
        monthlyRate: payment.amount,
        expiresAt,
      }).where(and(eq(customers.id, customerId), eq(customers.tenantId, payment.tenantId)))
      await tx.insert(payments).values({
        tenantId: payment.tenantId,
        customerId,
        amount: payment.amount,
        status: 'paid',
        method: providerNames[input.provider],
        reference: receipt,
        paidAt,
      })
      await tx.update(pppoePayments).set({
        status: 'completed',
        receipt,
        paidAt,
        failureReason: null,
        callbackPayload: input.providerPayload,
      }).where(and(eq(pppoePayments.id, payment.id), eq(pppoePayments.tenantId, payment.tenantId)))
      const [customer] = await tx.select({ name: customers.name, phone: customers.phone }).from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.tenantId, payment.tenantId))).limit(1)
      return {
        tenantId: payment.tenantId,
        paymentId: payment.id,
        name: customer?.name || account.name,
        phone: customer?.phone || account.phone,
        amount: payment.amount,
        productName: payment.productName,
        username,
        password,
        expiresAt,
      }
    })

    if (notification) {
      const passwordText = notification.password ? ` Password: ${notification.password}.` : ''
      await enqueueTenantSms(
        notification.tenantId,
        `pppoe-payment:${notification.paymentId}`,
        notification.phone,
        `Hello ${notification.name}, KES ${notification.amount} received for ${notification.productName}. Your account ${notification.username}${passwordText} is active until ${notification.expiresAt.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}.`,
      )
    }
    return Boolean(notification)
  }

  const [purchase] = await db.select({ id: hotspotPurchases.id, tenantId: hotspotPurchases.tenantId })
    .from(hotspotPurchases).where(and(
      eq(hotspotPurchases.id, input.purchaseId),
      eq(hotspotPurchases.gatewayProvider, input.provider),
    )).limit(1)
  if (!purchase) return false

  const username = `lk${randomBytes(6).toString('hex')}`
  const password = randomBytes(12).toString('hex')
  const notification = await db.transaction(async (tx) => {
    const [lockedPurchase] = await tx.select().from(hotspotPurchases).where(and(
      eq(hotspotPurchases.id, purchase.id),
      eq(hotspotPurchases.tenantId, purchase.tenantId),
      eq(hotspotPurchases.gatewayProvider, input.provider),
      inArray(hotspotPurchases.status, ['initiating', 'pending']),
    )).for('update').limit(1)
    if (!lockedPurchase) return null

    const policy = lockedPurchase.packageSnapshot
    const paidAt = new Date()
    const expiresAt = new Date(paidAt.getTime() + lockedPurchase.durationSeconds * 1000)
    const checkRules = [
      { tenantId: lockedPurchase.tenantId, username, attribute: 'Cleartext-Password', op: ':=', value: password },
      { tenantId: lockedPurchase.tenantId, username, attribute: 'Simultaneous-Use', op: ':=', value: String(policy?.devicesPerAccount || 1) },
      { tenantId: lockedPurchase.tenantId, username, attribute: 'Expiration', op: ':=', value: toFreeRadiusExpiration(expiresAt) },
    ]
    if (policy?.scheduleEnabled && policy.scheduleSpec) {
      checkRules.push({ tenantId: lockedPurchase.tenantId, username, attribute: 'Login-Time', op: '==', value: policy.scheduleSpec })
    }
    if (policy?.nasRestrictions.length) {
      const allowedNas = policy.nasRestrictions.map((address) => address.replace(/\./g, '\\.')).join('|')
      checkRules.push({ tenantId: lockedPurchase.tenantId, username, attribute: 'NAS-IP-Address', op: '=~', value: `^(${allowedNas})$` })
    }
    await tx.insert(radcheck).values(checkRules)
    const replyRules = toHotspotRadiusReplies(username, {
      durationSeconds: lockedPurchase.durationSeconds,
      devicesPerAccount: policy?.devicesPerAccount || 1,
      rateLimit: policy?.rateLimit,
      burstLimit: policy?.burstLimit || null,
      burstThreshold: policy?.burstThreshold || null,
      burstTimeSeconds: policy?.burstTimeSeconds || null,
      fupEnabled: policy?.fupEnabled || false,
      fupLimitBytes: policy?.fupLimitBytes || null,
    })
    await tx.insert(radreply).values(replyRules.map((rule) => ({ ...rule, tenantId: lockedPurchase.tenantId })))
    await tx.insert(payments).values({
      tenantId: lockedPurchase.tenantId,
      amount: lockedPurchase.amount,
      status: 'paid',
      method: providerNames[input.provider],
      reference: receipt,
    })
    await tx.update(hotspotPurchases).set({
      status: 'completed',
      receipt,
      radiusUsername: username,
      paidAt,
      failureReason: null,
      callbackPayload: input.providerPayload,
    }).where(and(eq(hotspotPurchases.id, lockedPurchase.id), eq(hotspotPurchases.tenantId, lockedPurchase.tenantId)))
    return {
      tenantId: lockedPurchase.tenantId,
      purchaseId: lockedPurchase.id,
      phone: lockedPurchase.phone || '',
      productName: lockedPurchase.productName,
      amount: lockedPurchase.amount,
      username,
      password,
      expiresAt,
    }
  })

  if (notification && notification.phone) {
    await enqueueTenantSms(
      notification.tenantId,
      `hotspot-payment:${notification.purchaseId}`,
      notification.phone,
      `Your payment of KES ${notification.amount} for ${notification.productName} was received. Wi-Fi username: ${notification.username}; password: ${notification.password}. Access expires ${notification.expiresAt.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}.`,
    )
  }
  return Boolean(notification)
}
