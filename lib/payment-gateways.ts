export const paymentGatewayProviders = ['airtel-money', 'pesapal', 'intasend'] as const
export type PaymentGatewayProvider = typeof paymentGatewayProviders[number]
export type PaymentGatewayEnvironment = 'sandbox' | 'production'

export const paymentGatewayDefinitions: Record<PaymentGatewayProvider, {
  name: string
  available: boolean
  secretFields: { key: string; label: string }[]
}> = {
  'airtel-money': {
    name: 'Airtel Money',
    available: false,
    secretFields: [],
  },
  pesapal: {
    name: 'Pesapal',
    available: true,
    secretFields: [
      { key: 'consumerKey', label: 'Consumer key' },
      { key: 'consumerSecret', label: 'Consumer secret' },
    ],
  },
  intasend: {
    name: 'IntaSend',
    available: true,
    secretFields: [
      { key: 'publishableKey', label: 'Publishable key' },
      { key: 'secretKey', label: 'Secret key' },
      { key: 'webhookChallenge', label: 'Webhook challenge (32+ characters)' },
    ],
  },
}

export function isPaymentGatewayProvider(value: unknown): value is PaymentGatewayProvider {
  return typeof value === 'string' && paymentGatewayProviders.some((provider) => provider === value)
}
