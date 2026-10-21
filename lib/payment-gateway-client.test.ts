import assert from 'node:assert/strict'
import test from 'node:test'
import { createHostedCheckout, verifyGatewayPayment } from './payment-gateway-client.ts'

const reference = 'e77d34b2-f9c6-4c8a-8a36-186f522ad4ec'

test('IntaSend checkout uses a unique KES reference and returns its hosted URL', async (context) => {
  context.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('X-IntaSend-Public-API-Key'), 'publishable-key')
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    assert.equal(body.amount, 120)
    assert.equal(body.currency, 'KES')
    assert.equal(body.api_ref, reference)
    assert.equal(body.unique_api_ref, true)
    return Response.json({ invoice_id: 'invoice-123', url: 'https://sandbox.intasend.com/checkout/123' })
  })

  const checkout = await createHostedCheckout({
    credentials: {
      provider: 'intasend',
      environment: 'sandbox',
      secrets: { publishableKey: 'publishable-key', secretKey: 'secret-key', webhookChallenge: 'a'.repeat(32) },
    },
    reference,
    amount: 120,
    description: 'Hotspot package',
    callbackUrl: 'https://billing.example.test/api/payment-gateways/intasend/webhook',
    returnUrl: 'https://billing.example.test/hotspot/checkout?payment=abc',
    phone: '254712345678',
  })

  assert.deepEqual(checkout, {
    providerReference: 'invoice-123',
    checkoutUrl: 'https://sandbox.intasend.com/checkout/123',
  })
})

test('IntaSend verifies invoice status through its server-side API token', async (context) => {
  let requestCount = 0
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requestCount += 1
    if (String(input).endsWith('/auth/generate-token/')) {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        api_key: 'publishable-key',
        api_secret: 'secret-key',
      })
      return Response.json({ token: 'short-lived-token' })
    }
    assert.equal(String(input).endsWith('/payment/status/'), true)
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer short-lived-token')
    assert.deepEqual(JSON.parse(String(init?.body)), { invoice_id: 'invoice-123' })
    return Response.json({
      invoice_id: 'invoice-123',
      state: 'COMPLETE',
      value: '120.00',
      currency: 'KES',
      api_ref: reference,
      provider_ref: 'QWE123RTY',
    })
  })

  const verified = await verifyGatewayPayment({
    provider: 'intasend',
    environment: 'sandbox',
    secrets: { publishableKey: 'publishable-key', secretKey: 'secret-key' },
  }, 'invoice-123')

  assert.equal(requestCount, 2)
  assert.equal(verified.paid, true)
  assert.equal(verified.amount, 120)
  assert.equal(verified.currency, 'KES')
  assert.equal(verified.reference, reference)
  assert.equal(verified.receipt, 'QWE123RTY')
})

test('Pesapal registers its IPN before submitting a hosted KES order', async (context) => {
  let step = 0
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    step += 1
    if (step === 1) return Response.json({ token: 'pesapal-token' })
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer pesapal-token')
    if (String(input).endsWith('/URLSetup/RegisterIPN')) {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        url: 'https://billing.example.test/api/payment-gateways/pesapal/ipn',
        ipn_notification_type: 'GET',
      })
      return Response.json({ ipn_id: 'notification-1' })
    }
    assert.equal(String(input).endsWith('/Transactions/SubmitOrderRequest'), true)
    const order = JSON.parse(String(init?.body)) as Record<string, unknown>
    assert.equal(order.id, reference)
    assert.equal(order.currency, 'KES')
    assert.equal(order.amount, 75)
    assert.equal(order.notification_id, 'notification-1')
    assert.equal(order.callback_url, 'https://billing.example.test/hotspot/checkout?payment=abc')
    return Response.json({
      order_tracking_id: 'tracking-123',
      redirect_url: 'https://cybqa.pesapal.com/pesapalv3/checkout/123',
    })
  })

  const checkout = await createHostedCheckout({
    credentials: {
      provider: 'pesapal',
      environment: 'sandbox',
      secrets: { consumerKey: 'consumer-key', consumerSecret: 'consumer-secret' },
    },
    reference,
    amount: 75,
    description: 'Home plan',
    callbackUrl: 'https://billing.example.test/api/payment-gateways/pesapal/ipn',
    returnUrl: 'https://billing.example.test/hotspot/checkout?payment=abc',
    phone: '254712345678',
    name: 'Test Customer',
  })

  assert.equal(step, 3)
  assert.deepEqual(checkout, {
    providerReference: 'tracking-123',
    checkoutUrl: 'https://cybqa.pesapal.com/pesapalv3/checkout/123',
  })
})

test('Pesapal verifies the transaction status against its tracking ID', async (context) => {
  let requestCount = 0
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requestCount += 1
    if (String(input).endsWith('/Auth/RequestToken')) return Response.json({ token: 'pesapal-token' })
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer pesapal-token')
    const url = new URL(String(input))
    assert.equal(url.searchParams.get('orderTrackingId'), 'tracking-123')
    return Response.json({
      payment_status_description: 'Completed',
      amount: 75,
      currency: 'KES',
      merchant_reference: reference,
      confirmation_code: 'PESA123ABC',
    })
  })

  const verified = await verifyGatewayPayment({
    provider: 'pesapal',
    environment: 'sandbox',
    secrets: { consumerKey: 'consumer-key', consumerSecret: 'consumer-secret' },
  }, 'tracking-123')

  assert.equal(requestCount, 2)
  assert.equal(verified.paid, true)
  assert.equal(verified.amount, 75)
  assert.equal(verified.currency, 'KES')
  assert.equal(verified.reference, reference)
  assert.equal(verified.receipt, 'PESA123ABC')
})
