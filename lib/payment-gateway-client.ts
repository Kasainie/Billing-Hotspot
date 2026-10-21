import type { PaymentGatewayEnvironment, PaymentGatewayProvider } from '@/lib/payment-gateways'

export type GatewayCredentials = {
  provider: PaymentGatewayProvider
  environment: PaymentGatewayEnvironment
  secrets: Record<string, string>
}

export type HostedCheckoutInput = {
  credentials: GatewayCredentials
  reference: string
  amount: number
  description: string
  callbackUrl: string
  returnUrl: string
  phone: string
  email?: string
  name?: string
}

export type HostedCheckout = {
  providerReference: string
  checkoutUrl: string
}

export type VerifiedGatewayPayment = {
  paid: boolean
  amount: number
  currency: string
  reference: string
  state: string
  receipt: string | null
  providerPayload: Record<string, unknown>
  failureReason?: string
}

const pesapalBaseUrl = (environment: PaymentGatewayEnvironment) =>
  environment === 'production' ? 'https://pay.pesapal.com/v3/api' : 'https://cybqa.pesapal.com/pesapalv3/api'
const intasendBaseUrl = 'https://api.intasend.com/api/v1'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

async function responseJson(response: Response, provider: string): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(`${provider} returned an unreadable response.`)
  }
  const record = asRecord(body)
  if (!response.ok) throw new Error(`${provider} request failed (HTTP ${response.status}).`)
  return record
}

async function pesapalToken(credentials: GatewayCredentials): Promise<string> {
  const response = await fetch(`${pesapalBaseUrl(credentials.environment)}/Auth/RequestToken`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      consumer_key: credentials.secrets.consumerKey,
      consumer_secret: credentials.secrets.consumerSecret,
    }),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  const body = await responseJson(response, 'Pesapal')
  if (typeof body.token !== 'string' || !body.token) throw new Error('Pesapal did not return an access token.')
  return body.token
}

export async function createHostedCheckout(input: HostedCheckoutInput): Promise<HostedCheckout> {
  const { credentials } = input
  if (credentials.provider === 'intasend') {
    const response = await fetch(`${intasendBaseUrl}/checkout/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-IntaSend-Public-API-Key': credentials.secrets.publishableKey,
      },
      body: JSON.stringify({
        amount: input.amount,
        currency: 'KES',
        api_ref: input.reference,
        unique_api_ref: true,
        redirect_url: input.returnUrl,
        phone_number: input.phone,
        email: input.email,
        first_name: input.name?.split(/\s+/)[0],
        last_name: input.name?.split(/\s+/).slice(1).join(' ') || undefined,
        host: new URL(input.callbackUrl).origin,
      }),
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    const body = await responseJson(response, 'IntaSend')
    if (typeof body.invoice_id !== 'string' || typeof body.url !== 'string') {
      throw new Error('IntaSend did not return a checkout URL and invoice ID.')
    }
    return { providerReference: body.invoice_id, checkoutUrl: body.url }
  }

  if (credentials.provider !== 'pesapal') throw new Error('This payment provider is not available yet.')
  const token = await pesapalToken(credentials)
  const baseUrl = pesapalBaseUrl(credentials.environment)
  const ipnResponse = await fetch(`${baseUrl}/URLSetup/RegisterIPN`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ url: input.callbackUrl, ipn_notification_type: 'GET' }),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  const ipn = await responseJson(ipnResponse, 'Pesapal')
  if (typeof ipn.ipn_id !== 'string' || !ipn.ipn_id) throw new Error('Pesapal did not register its payment notification URL.')

  const nameParts = (input.name || 'Customer').trim().split(/\s+/)
  const orderResponse = await fetch(`${baseUrl}/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: input.reference,
      currency: 'KES',
      amount: input.amount,
      description: input.description.slice(0, 50),
      callback_url: input.returnUrl,
      notification_id: ipn.ipn_id,
      billing_address: {
        email_address: input.email || '',
        phone_number: input.phone,
        country_code: 'KE',
        first_name: nameParts[0].slice(0, 50),
        last_name: nameParts.slice(1).join(' ').slice(0, 50),
      },
    }),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  const order = await responseJson(orderResponse, 'Pesapal')
  if (typeof order.order_tracking_id !== 'string' || typeof order.redirect_url !== 'string') {
    throw new Error('Pesapal did not return a hosted checkout URL and tracking ID.')
  }
  return { providerReference: order.order_tracking_id, checkoutUrl: order.redirect_url }
}

async function getIntaSendStatus(credentials: GatewayCredentials, invoiceId: string) {
  const tokenResponse = await fetch(`${intasendBaseUrl}/auth/generate-token/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: credentials.secrets.publishableKey,
      api_secret: credentials.secrets.secretKey,
    }),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  const tokenBody = await responseJson(tokenResponse, 'IntaSend')
  if (typeof tokenBody.token !== 'string' || !tokenBody.token) throw new Error('IntaSend did not return a verification token.')
  const statusResponse = await fetch(`${intasendBaseUrl}/payment/status/`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tokenBody.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ invoice_id: invoiceId }),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  return responseJson(statusResponse, 'IntaSend')
}

export async function verifyGatewayPayment(
  credentials: GatewayCredentials,
  providerReference: string,
): Promise<VerifiedGatewayPayment> {
  if (credentials.provider === 'intasend') {
    const body = await getIntaSendStatus(credentials, providerReference)
    return {
      paid: body.state === 'COMPLETE',
      amount: Number(body.value),
      currency: typeof body.currency === 'string' ? body.currency : '',
      reference: typeof body.api_ref === 'string' ? body.api_ref : '',
      state: typeof body.state === 'string' ? body.state : '',
      receipt: typeof body.provider_ref === 'string' ? body.provider_ref : null,
      providerPayload: body,
      failureReason: typeof body.failed_reason === 'string' ? body.failed_reason : undefined,
    }
  }

  if (credentials.provider !== 'pesapal') throw new Error('This payment provider is not available yet.')
  const token = await pesapalToken(credentials)
  const url = new URL(`${pesapalBaseUrl(credentials.environment)}/Transactions/GetTransactionStatus`)
  url.searchParams.set('orderTrackingId', providerReference)
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  const body = await responseJson(response, 'Pesapal')
  return {
    paid: typeof body.payment_status_description === 'string' && body.payment_status_description.toLowerCase() === 'completed',
    amount: Number(body.amount),
    currency: typeof body.currency === 'string' ? body.currency : '',
    reference: typeof body.merchant_reference === 'string' ? body.merchant_reference : '',
    state: typeof body.payment_status_description === 'string' ? body.payment_status_description : '',
    receipt: typeof body.confirmation_code === 'string' ? body.confirmation_code : null,
    providerPayload: body,
    failureReason: typeof body.message === 'string' ? body.message : undefined,
  }
}
