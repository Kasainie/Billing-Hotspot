type DarajaEnvironment = 'sandbox' | 'production'

export type DarajaConfiguration = {
  environment: DarajaEnvironment
  consumerKey: string
  consumerSecret: string
  shortcode: string
  passkey: string
  callbackUrl: string
}

function darajaBaseUrl(environment: DarajaEnvironment) {
  return environment === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke'
}

export function getDarajaConfiguration() {
  const environment = process.env.MPESA_ENV === 'production' ? 'production' : 'sandbox'
  const consumerKey = process.env.MPESA_CONSUMER_KEY?.trim() || ''
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET?.trim() || ''
  const shortcode = process.env.MPESA_SHORTCODE?.trim() || ''
  const passkey = process.env.MPESA_PASSKEY?.trim() || ''
  const callbackUrl = process.env.MPESA_CALLBACK_URL?.trim() || ''
  let callbackIsHttps = false
  try {
    callbackIsHttps = new URL(callbackUrl).protocol === 'https:'
  } catch {
    callbackIsHttps = false
  }

  if (!consumerKey || !consumerSecret || !/^\d{5,7}$/.test(shortcode) || !passkey || !callbackIsHttps) return null
  return { environment, consumerKey, consumerSecret, shortcode, passkey, callbackUrl } satisfies DarajaConfiguration
}

export function normalizeKenyanPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  const normalized = digits.startsWith('0') ? `254${digits.slice(1)}` : digits.startsWith('254') ? digits : ''
  return /^254(?:7|1)\d{8}$/.test(normalized) ? normalized : null
}

function timestampNow() {
  const nairobiTime = new Date(Date.now() + 3 * 60 * 60 * 1000)
  return nairobiTime.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
}

async function requestDarajaToken(config: DarajaConfiguration) {
  const authorization = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64')
  const response = await fetch(`${darajaBaseUrl(config.environment)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { authorization: `Basic ${authorization}` },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error('Safaricom authentication failed.')
  const result = await response.json() as { access_token?: unknown }
  if (typeof result.access_token !== 'string' || !result.access_token) throw new Error('Safaricom authentication failed.')
  return result.access_token
}

function stkPassword(config: DarajaConfiguration, timestamp: string) {
  return Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64')
}

export async function initiateStkPush({
  phone,
  amount,
  purchaseId,
  accountReference,
  productName,
  configuration,
}: {
  phone: string
  amount: number
  purchaseId?: string
  accountReference?: string
  productName: string
  configuration?: DarajaConfiguration | null
}) {
  const config = configuration === undefined ? getDarajaConfiguration() : configuration
  if (!config) throw new Error('M-Pesa checkout is not configured.')
  if (accountReference && !/^\d{1,12}$/.test(accountReference)) throw new Error('Customer account number is invalid.')
  if (!accountReference && !purchaseId) throw new Error('Payment reference is missing.')
  const accessToken = await requestDarajaToken(config)
  const timestamp = timestampNow()
  const response = await fetch(`${darajaBaseUrl(config.environment)}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: stkPassword(config, timestamp),
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: config.shortcode,
      PhoneNumber: phone,
      CallBackURL: config.callbackUrl,
      AccountReference: accountReference || `LK${purchaseId!.replace(/-/g, '').slice(0, 10)}`,
      TransactionDesc: productName.slice(0, 13),
    }),
    signal: AbortSignal.timeout(15000),
  })
  const result = await response.json() as {
    MerchantRequestID?: unknown
    CheckoutRequestID?: unknown
    ResponseCode?: unknown
    CustomerMessage?: unknown
  }
  if (!response.ok || result.ResponseCode !== '0' || typeof result.MerchantRequestID !== 'string' || typeof result.CheckoutRequestID !== 'string') {
    throw new Error(typeof result.CustomerMessage === 'string' ? result.CustomerMessage : 'Safaricom could not start the M-Pesa prompt.')
  }
  return { merchantRequestId: result.MerchantRequestID, checkoutRequestId: result.CheckoutRequestID, customerMessage: typeof result.CustomerMessage === 'string' ? result.CustomerMessage : 'Check your phone and approve the M-Pesa prompt.' }
}

export async function verifyStkTransaction(checkoutRequestId: string, configuration?: DarajaConfiguration | null) {
  const config = configuration === undefined ? getDarajaConfiguration() : configuration
  if (!config) throw new Error('M-Pesa checkout is not configured.')
  const accessToken = await requestDarajaToken(config)
  const timestamp = timestampNow()
  const response = await fetch(`${darajaBaseUrl(config.environment)}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: stkPassword(config, timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error('Safaricom transaction verification failed.')
  return await response.json() as { ResultCode?: unknown; ResultDesc?: unknown }
}