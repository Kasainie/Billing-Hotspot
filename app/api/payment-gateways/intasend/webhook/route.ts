import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hotspotPurchases, pppoePayments } from '@/lib/db/schema'
import { getTenantPaymentGateway } from '@/lib/db/tenant-gateways'
import { processGatewayNotification } from '@/lib/db/process-gateway-notification'
import { and, eq } from 'drizzle-orm'

type IntaSendWebhook = {
  challenge?: unknown
  invoice_id?: unknown
  api_ref?: unknown
  topic?: unknown
}

export async function POST(request: NextRequest) {
  let payload: IntaSendWebhook
  try {
    payload = await request.json() as IntaSendWebhook
  } catch {
    return NextResponse.json({ error: 'Invalid payment notification.' }, { status: 400 })
  }
  if (typeof payload.challenge !== 'string' || typeof payload.invoice_id !== 'string' ||
      typeof payload.api_ref !== 'string' || payload.topic !== 'collection_event' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.api_ref)) {
    return NextResponse.json({ error: 'Invalid payment notification.' }, { status: 400 })
  }

  try {
    const [pppoePayment] = await db.select({ tenantId: pppoePayments.tenantId })
      .from(pppoePayments).where(and(eq(pppoePayments.id, payload.api_ref), eq(pppoePayments.gatewayProvider, 'intasend'))).limit(1)
    const [hotspotPurchase] = pppoePayment ? [] : await db.select({ tenantId: hotspotPurchases.tenantId })
      .from(hotspotPurchases).where(and(eq(hotspotPurchases.id, payload.api_ref), eq(hotspotPurchases.gatewayProvider, 'intasend'))).limit(1)
    const payment = pppoePayment || hotspotPurchase
    if (!payment) return NextResponse.json({ error: 'Payment notification is not configured.' }, { status: 503 })
    const credentials = await getTenantPaymentGateway(payment.tenantId, 'intasend', true)
    if (!credentials) return NextResponse.json({ error: 'Payment notification is not configured.' }, { status: 503 })
    if (credentials.secrets.webhookChallenge !== payload.challenge) {
      return NextResponse.json({ error: 'Invalid payment notification challenge.' }, { status: 401 })
    }
    await processGatewayNotification({
      reference: payload.api_ref,
      providerReference: payload.invoice_id,
      provider: 'intasend',
    })
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Unable to verify IntaSend payment notification', error)
    return NextResponse.json({ error: 'Payment notification could not be verified.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
