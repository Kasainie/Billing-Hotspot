export type MessageTemplateId =
  | 'pppoeWelcome'
  | 'pppoePaymentReceipt'
  | 'hotspotPaymentReceipt'
  | 'hotspotVoucherDelivery'
  | 'pppoeCreditApplied'
  | 'pppoeExpiryNotice'
  | 'hotspotExpiryNotice'
  | 'pppoePreExpiry'
  | 'hotspotPreExpiry'
  | 'bundleWarning'

export type MessageTemplateDefinition = {
  id: MessageTemplateId
  title: string
  description: string
  enabledKey: string
  defaultEnabled: boolean
  defaultMessage: string
  tokens: string[]
}

export const messageTemplateDefinitions: MessageTemplateDefinition[] = [
  {
    id: 'pppoeWelcome',
    title: 'PPPoE welcome message',
    description: 'Sent when a PPPoE subscriber account is created.',
    enabledKey: 'pppoeWelcomeEnabled',
    defaultEnabled: true,
    defaultMessage: 'Hello {{name}}, your PPPoE account has been created. Username: {{username}}. Password: {{password}}. Plan: {{plan}}. Account number: {{accountNumber}}. Contact {{supportContact}} for help.',
    tokens: ['name', 'username', 'password', 'plan', 'accountNumber', 'supportContact', 'supportPhone'],
  },
  {
    id: 'pppoePaymentReceipt',
    title: 'PPPoE payment receipt',
    description: 'Sent after a PPPoE payment or renewal is confirmed.',
    enabledKey: 'pppoePaymentReceiptEnabled',
    defaultEnabled: true,
    defaultMessage: 'Hello {{name}}, KES {{amount}} received for {{plan}}. Receipt: {{reference}}. Account {{username}} is active until {{expiry}}. For help, contact {{supportContact}}.',
    tokens: ['name', 'amount', 'plan', 'reference', 'username', 'expiry', 'supportContact', 'supportPhone'],
  },
  {
    id: 'hotspotPaymentReceipt',
    title: 'Hotspot payment receipt',
    description: 'Sent after a Hotspot package purchase is confirmed.',
    enabledKey: 'hotspotPaymentReceiptEnabled',
    defaultEnabled: true,
    defaultMessage: 'Payment received: KES {{amount}} for {{plan}}. Receipt: {{reference}}. Wi-Fi username: {{username}}; password: {{password}}. Access expires {{expiry}}. For help, contact {{supportContact}}.',
    tokens: ['amount', 'plan', 'reference', 'username', 'password', 'expiry', 'supportContact', 'supportPhone'],
  },
  {
    id: 'hotspotVoucherDelivery',
    title: 'Hotspot voucher delivery',
    description: 'Sent to the phone number entered when generating vouchers.',
    enabledKey: 'hotspotVoucherDeliveryEnabled',
    defaultEnabled: true,
    defaultMessage: 'Your {{plan}} Wi-Fi voucher is ready. Username: {{username}}; password: {{password}}. Valid for {{duration}} after first connection. For help, contact {{supportContact}}.',
    tokens: ['plan', 'username', 'password', 'duration', 'supportContact', 'supportPhone'],
  },
  {
    id: 'pppoeCreditApplied',
    title: 'PPPoE payment saved as credit',
    description: 'Sent when account credit is added to a PPPoE subscriber.',
    enabledKey: 'pppoeCreditAppliedEnabled',
    defaultEnabled: true,
    defaultMessage: 'Hello {{name}}, KES {{amount}} has been added to your account as credit. Available balance: KES {{balance}}. For help, contact {{supportContact}}.',
    tokens: ['name', 'amount', 'balance', 'supportContact', 'supportPhone'],
  },
  {
    id: 'pppoeExpiryNotice',
    title: 'PPPoE expiry notice',
    description: 'Sent when a PPPoE service expires.',
    enabledKey: 'pppoeExpiryNoticeEnabled',
    defaultEnabled: true,
    defaultMessage: 'Hello {{name}}, your {{plan}} internet service expired on {{expiry}}. Please make a payment to restore access or contact {{supportContact}} for help.',
    tokens: ['name', 'plan', 'expiry', 'supportContact', 'supportPhone'],
  },
  {
    id: 'hotspotExpiryNotice',
    title: 'Hotspot expiry notice',
    description: 'Sent when a paid Hotspot package reaches its expiry time.',
    enabledKey: 'hotspotExpiryNoticeEnabled',
    defaultEnabled: true,
    defaultMessage: 'Your {{plan}} Wi-Fi access expired on {{expiry}}. Purchase another package to reconnect. For help, contact {{supportContact}}.',
    tokens: ['plan', 'expiry', 'supportContact', 'supportPhone'],
  },
  {
    id: 'pppoePreExpiry',
    title: 'PPPoE pre-expiry reminder',
    description: 'Sent before an active PPPoE subscription expires using the configured lead time.',
    enabledKey: 'pppoePreExpiryEnabled',
    defaultEnabled: true,
    defaultMessage: 'Hello {{name}}, your {{plan}} internet service expires on {{expiry}}. Renew now to stay connected. For help, contact {{supportContact}}.',
    tokens: ['name', 'plan', 'expiry', 'supportContact', 'supportPhone'],
  },
  {
    id: 'hotspotPreExpiry',
    title: 'Hotspot pre-expiry reminder',
    description: 'Sent before a paid Hotspot package expires using the configured lead time.',
    enabledKey: 'hotspotPreExpiryEnabled',
    defaultEnabled: true,
    defaultMessage: 'Your {{plan}} Wi-Fi access expires on {{expiry}}. Purchase another package to stay connected. For help, contact {{supportContact}}.',
    tokens: ['plan', 'expiry', 'supportContact', 'supportPhone'],
  },
  {
    id: 'bundleWarning',
    title: 'Bundle warning',
    description: 'Sent once when tracked data usage reaches the configured percentage of a bundle limit.',
    enabledKey: 'bundleWarningEnabled',
    defaultEnabled: true,
    defaultMessage: 'Hello {{name}}, you have used {{used}} of your {{limit}} bundle ({{percent}}%). For help, contact {{supportContact}}.',
    tokens: ['name', 'plan', 'used', 'limit', 'percent', 'supportContact', 'supportPhone'],
  },
]

export const messageTemplateDefaults: Record<string, string | number | boolean> = Object.fromEntries([
  ...messageTemplateDefinitions.flatMap((template) => [
    [template.enabledKey, template.defaultEnabled],
    [template.id, template.defaultMessage],
  ]),
  ['hotspotFirstPurchaseOnly', false],
  ['preExpiryDays', 3],
  ['bundleWarningThreshold', 50],
  ['supportContact', ''],
])
