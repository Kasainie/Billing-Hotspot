import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { hotspotPurchases, pppoePayments } from '@/lib/db/schema'
import { fulfillGatewayPayment } from '@/lib/db/gateway-fulfillment'
import { getTenantPaymentGateway } from '@/lib/db/tenant-gateways'
import { verifyGatewayPayment } from '@/lib/payment-gateway-client'
import type { PaymentGatewayProvider } from '@/lib/payment-gateways'

export async function processGatewayNotification(input: {
  reference: string
  providerReference: string
  provider: PaymentGatewayProvider
}) {
  const [pppoePayment] = await db.select({
    id: pppoePayments.id,
    tenantId: pppoePayments.tenantId,
    amount: pppoePayments.amount,
    status: pppoePayments.status,
    checkoutRequestId: pppoePayments.checkoutRequestId,
  }).from(pppoePayments).where(and(
    eq(pppoePayments.id, input.reference),
    eq(pppoePayments.gatewayProvider, input.provider),
  )).limit(1)
  const [hotspotPurchase] = pppoePayment ? [] : await db.select({
    id: hotspotPurchases.id,
    tenantId: hotspotPurchases.tenantId,
    amount: hotspotPurchases.amount,
    status: hotspotPurchases.status,
    checkoutRequestId: hotspotPurchases.checkoutRequestId,
  }).from(hotspotPurchases).where(and(
    eq(hotspotPurchases.id, input.reference),
    eq(hotspotPurchases.gatewayProvider, input.provider),
  )).limit(1)
  const payment = pppoePayment || hotspotPurchase
  if (!payment || !payment.checkoutRequestId || payment.checkoutRequestId !== input.providerReference) {
    throw new Error('Payment reference does not match an active checkout.')
  }
  if (payment.status === 'completed' || payment.status === 'failed') return payment.status

  const credentials = await getTenantPaymentGateway(payment.tenantId, input.provider, true)
  if (!credentials) throw new Error('Workspace payment gateway credentials are unavailable.')
  const verified = await verifyGatewayPayment(credentials, input.providerReference)
  if (verified.reference !== input.reference || verified.currency.toUpperCase() !== 'KES' ||
      !Number.isFinite(verified.amount) || verified.amount !== payment.amount) {
    throw new Error('Provider payment details did not match the checkout.')
  }

  if (verified.paid) {
    await fulfillGatewayPayment({
      purchaseId: payment.id,
      provider: input.provider,
      receipt: verified.receipt || input.providerReference,
      providerPayload: verified.providerPayload,
    })
    return 'completed'
  }

  const finalFailure = ['failed', 'canceled', 'cancelled'].includes(verified.state.toLowerCase())
  if (finalFailure) {
    const failureReason = verified.failureReason?.slice(0, 180) || `${input.provider} payment was not completed.`
    if (pppoePayment) {
      await db.update(pppoePayments).set({
        status: 'failed',
        failureReason,
        callbackPayload: verified.providerPayload,
      }).where(and(
        eq(pppoePayments.id, payment.id),
        eq(pppoePayments.tenantId, payment.tenantId),
        inArray(pppoePayments.status, ['initiating', 'pending']),
      ))
    } else {
      await db.update(hotspotPurchases).set({
        status: 'failed',
        failureReason,
        callbackPayload: verified.providerPayload,
      }).where(and(
        eq(hotspotPurchases.id, payment.id),
        eq(hotspotPurchases.tenantId, payment.tenantId),
        inArray(hotspotPurchases.status, ['initiating', 'pending']),
      ))
    }
    return 'failed'
  }
  return 'pending'
}
