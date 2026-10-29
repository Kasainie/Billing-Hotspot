export type TenantSettingField = {
  key: string
  label: string
  type: 'text' | 'email' | 'url' | 'number' | 'textarea' | 'toggle' | 'select' | 'password'
  help: string
  options?: { label: string; value: string }[]
  maxLength?: number
  secret?: boolean
}

export type TenantSettingSection = {
  id: string
  group: string
  label: string
  description: string
  status: string
  fields: TenantSettingField[]
}

const field = (key: string, label: string, type: TenantSettingField['type'], help: string, extra: Partial<TenantSettingField> = {}): TenantSettingField =>
  ({ key, label, type, help, ...extra })

export const tenantSettingSections: TenantSettingSection[] = [
  {
    id: 'branding',
    group: 'GENERAL',
    label: 'Branding',
    description: 'Set the identity customers see on your captive portal and customer-facing communications.',
    status: 'Portal name and message are connected to your live HotSpot portal. Other brand assets are saved for future surface integrations.',
    fields: [
      field('companyName', 'Network or brand name', 'text', 'Shown on the captive portal.', { maxLength: 48 }),
      field('welcomeHeadline', 'Welcome headline', 'text', 'Portal headline.', { maxLength: 80 }),
      field('welcomeMessage', 'Welcome message', 'textarea', 'Portal introduction.', { maxLength: 180 }),
      field('supportMessage', 'Support message', 'text', 'Shown on the captive portal.', { maxLength: 120 }),
      field('logoUrl', 'Logo image URL', 'url', 'HTTPS image URL; custom logo rendering depends on the selected portal template.', { maxLength: 500 }),
      field('brandColor', 'Brand color', 'text', 'Hex color used by compatible customer-facing surfaces.', { maxLength: 7 }),
      field('supportPhone', 'Support phone', 'text', 'Customer support contact.', { maxLength: 32 }),
      field('supportEmail', 'Support email', 'email', 'Customer support contact.', { maxLength: 254 }),
    ],
  },
  {
    id: 'domain',
    group: 'GENERAL',
    label: 'Domain',
    description: 'Manage your workspace address and record a custom customer-facing hostname.',
    status: 'The workspace slug updates the application tenant address. Custom hostnames need DNS and hosting-provider verification before they can serve traffic.',
    fields: [
      field('workspaceSlug', 'Workspace address', 'text', 'Lowercase letters, numbers, and hyphens; updates your tenant slug.', { maxLength: 63 }),
      field('customDomain', 'Custom domain', 'text', 'Example: wifi.example.com. Saving does not configure DNS or TLS.', { maxLength: 253 }),
    ],
  },
  {
    id: 'pppoe',
    group: 'NETWORK',
    label: 'PPPoE',
    description: 'Workspace defaults for PPPoE service operations.',
    status: 'Saved as workspace defaults. Router provisioning and RADIUS enforcement must be configured on the corresponding routers.',
    fields: [
      field('serviceName', 'Service name', 'text', 'Label for your PPPoE service.', { maxLength: 64 }),
      field('primaryDns', 'Primary DNS server', 'text', 'IPv4 or IPv6 DNS address.', { maxLength: 64 }),
      field('secondaryDns', 'Secondary DNS server', 'text', 'Optional secondary DNS address.', { maxLength: 64 }),
      field('sessionTimeoutMinutes', 'Default session timeout (minutes)', 'number', 'Workspace default; does not overwrite existing plans.', { maxLength: 6 }),
      field('allowMultipleSessions', 'Allow multiple sessions per account', 'toggle', 'Preference for future PPPoE provisioning.'),
    ],
  },
  {
    id: 'hotspot',
    group: 'NETWORK',
    label: 'Hotspot',
    description: 'Set the customer-facing HotSpot portal content and behavior.',
    status: 'Portal copy is applied immediately. Access rules and router behavior remain controlled by plans and router provisioning.',
    fields: [
      field('companyName', 'Portal brand name', 'text', 'Shown on the HotSpot portal.', { maxLength: 48 }),
      field('welcomeHeadline', 'Welcome headline', 'text', 'Shown above the available packages.', { maxLength: 80 }),
      field('welcomeMessage', 'Welcome message', 'textarea', 'Short customer-facing description.', { maxLength: 180 }),
      field('supportMessage', 'Support message', 'text', 'Shown to customers who need help.', { maxLength: 120 }),
    ],
  },
  {
    id: 'email',
    group: 'BILLING & MESSAGING',
    label: 'Email',
    description: 'Configure SMTP delivery details for workspace email notifications.',
    status: 'Credentials are encrypted at rest. Email sending is not yet connected to an SMTP delivery worker.',
    fields: [
      field('host', 'SMTP host', 'text', 'Your email provider SMTP hostname.', { maxLength: 255 }),
      field('port', 'SMTP port', 'number', 'Usually 465 (implicit TLS) or 587 (STARTTLS).', { maxLength: 5 }),
      field('username', 'SMTP username', 'text', 'Provider account username.', { maxLength: 254 }),
      field('password', 'SMTP password', 'password', 'Encrypted when saved; leave blank to keep the saved password.', { maxLength: 2048, secret: true }),
      field('fromName', 'Sender name', 'text', 'Name displayed to customers.', { maxLength: 120 }),
      field('fromEmail', 'Sender email', 'email', 'Verified sender address.', { maxLength: 254 }),
    ],
  },
  {
    id: 'whatsapp',
    group: 'BILLING & MESSAGING',
    label: 'WhatsApp',
    description: 'Store WhatsApp Business Cloud API connection details.',
    status: 'Credentials are encrypted at rest. Message delivery needs a Meta app, approved templates, and a delivery integration.',
    fields: [
      field('phoneNumberId', 'Phone number ID', 'text', 'Meta WhatsApp Business phone number ID.', { maxLength: 100 }),
      field('businessAccountId', 'Business account ID', 'text', 'WhatsApp Business account ID.', { maxLength: 100 }),
      field('accessToken', 'Access token', 'password', 'Encrypted when saved; leave blank to keep the saved token.', { maxLength: 4096, secret: true }),
      field('webhookVerifyToken', 'Webhook verify token', 'password', 'Secret used to verify webhook setup.', { maxLength: 256, secret: true }),
    ],
  },
  {
    id: 'templates',
    group: 'BILLING & MESSAGING',
    label: 'Message templates',
    description: 'Customize and enable SMS messages for subscriber and Hotspot events.',
    status: 'Enabled templates are used by live SMS notifications. The help contact is shared across all templates.',
    fields: [
      field('supportContact', 'Customer help contact', 'text', 'Contact shown in SMS templates, such as a support phone number, WhatsApp number, or helpdesk email.', { maxLength: 120 }),
      field('pppoeWelcomeEnabled', 'PPPoE welcome enabled', 'toggle', 'Send a welcome SMS when a PPPoE account is created.'),
      field('pppoeWelcome', 'PPPoE welcome message', 'textarea', 'Available placeholders: {{name}}, {{username}}, {{password}}, {{plan}}, {{accountNumber}}, {{supportPhone}}.', { maxLength: 1000 }),
      field('pppoePaymentReceiptEnabled', 'PPPoE payment receipt enabled', 'toggle', 'Send a receipt after a PPPoE payment or renewal is confirmed.'),
      field('pppoePaymentReceipt', 'PPPoE payment receipt', 'textarea', 'Available placeholders: {{name}}, {{amount}}, {{plan}}, {{reference}}, {{username}}, {{expiry}}.', { maxLength: 1000 }),
      field('hotspotPaymentReceiptEnabled', 'Hotspot payment receipt enabled', 'toggle', 'Send a receipt after a Hotspot package purchase is confirmed.'),
      field('hotspotFirstPurchaseOnly', 'Only send on first purchase', 'toggle', 'When enabled, the Hotspot payment receipt is sent only for a customer’s first completed purchase.'),
      field('hotspotPaymentReceipt', 'Hotspot payment receipt', 'textarea', 'Available placeholders: {{amount}}, {{plan}}, {{reference}}, {{username}}, {{password}}, {{expiry}}.', { maxLength: 1000 }),
      field('hotspotVoucherDeliveryEnabled', 'Hotspot voucher delivery enabled', 'toggle', 'Allow voucher credentials to be sent by SMS when generating vouchers.'),
      field('hotspotVoucherDelivery', 'Hotspot voucher delivery', 'textarea', 'Available placeholders: {{plan}}, {{username}}, {{password}}, {{duration}}, {{supportPhone}}.', { maxLength: 1000 }),
      field('pppoeCreditAppliedEnabled', 'PPPoE credit SMS enabled', 'toggle', 'Notify subscribers when credit is added to their account.'),
      field('pppoeCreditApplied', 'PPPoE payment saved as credit', 'textarea', 'Available placeholders: {{name}}, {{amount}}, {{balance}}, {{supportPhone}}.', { maxLength: 1000 }),
      field('pppoeExpiryNoticeEnabled', 'PPPoE expiry notice enabled', 'toggle', 'Notify subscribers when their PPPoE service expires.'),
      field('pppoeExpiryNotice', 'PPPoE expiry notice', 'textarea', 'Available placeholders: {{name}}, {{plan}}, {{expiry}}, {{supportPhone}}.', { maxLength: 1000 }),
      field('hotspotExpiryNoticeEnabled', 'Hotspot expiry notice enabled', 'toggle', 'Notify customers when their paid Hotspot package expires.'),
      field('hotspotExpiryNotice', 'Hotspot expiry notice', 'textarea', 'Available placeholders: {{plan}}, {{expiry}}, {{supportPhone}}.', { maxLength: 1000 }),
      field('pppoePreExpiryEnabled', 'PPPoE pre-expiry reminder enabled', 'toggle', 'Send one reminder before an active PPPoE service expires.'),
      field('pppoePreExpiry', 'PPPoE pre-expiry reminder', 'textarea', 'Available placeholders: {{name}}, {{plan}}, {{expiry}}, {{supportPhone}}.', { maxLength: 1000 }),
      field('hotspotPreExpiryEnabled', 'Hotspot pre-expiry reminder enabled', 'toggle', 'Send one reminder before a paid Hotspot package expires.'),
      field('hotspotPreExpiry', 'Hotspot pre-expiry reminder', 'textarea', 'Available placeholders: {{plan}}, {{expiry}}, {{supportPhone}}.', { maxLength: 1000 }),
      field('preExpiryDays', 'Pre-expiry reminder lead time (days)', 'number', 'Send reminders this many days before expiry.', { maxLength: 2 }),
      field('bundleWarningEnabled', 'Bundle warning enabled', 'toggle', 'Send one warning when tracked data usage reaches the threshold below.'),
      field('bundleWarning', 'Bundle warning', 'textarea', 'Available placeholders: {{name}}, {{plan}}, {{used}}, {{limit}}, {{percent}}, {{supportPhone}}.', { maxLength: 1000 }),
      field('bundleWarningThreshold', 'Bundle warning threshold (%)', 'number', 'Send the warning when usage reaches this percentage of the bundle limit.', { maxLength: 2 }),
    ],
  },
  {
    id: 'loyalty',
    group: 'BILLING & MESSAGING',
    label: 'Loyalty points',
    description: 'Configure workspace loyalty program defaults.',
    status: 'Settings are saved; points are not yet automatically awarded or redeemable in checkout.',
    fields: [
      field('enabled', 'Enable loyalty program', 'toggle', 'Turns on the loyalty program preference.'),
      field('pointsPerCurrencyUnit', 'Points per KSh spent', 'number', 'Whole number of points for each KSh.', { maxLength: 5 }),
      field('redemptionValue', 'KSh value per point', 'number', 'KSh credit for each redeemed point.', { maxLength: 8 }),
      field('minimumRedemption', 'Minimum points to redeem', 'number', 'Minimum whole points before redemption.', { maxLength: 8 }),
    ],
  },
  {
    id: 'alerts',
    group: 'NOTIFICATIONS',
    label: 'Operator alerts',
    description: 'Choose which operational events should raise alerts for this workspace.',
    status: 'Alert preferences are saved. Delivery channels are controlled by the configured notification integrations.',
    fields: [
      field('routerOffline', 'Router goes offline', 'toggle', 'Alert preference.'),
      field('routerOnline', 'Router comes online', 'toggle', 'Alert preference.'),
      field('subscriberExpiry', 'Subscriber expiry warnings', 'toggle', 'Alert preference.'),
      field('paymentFailure', 'Payment processing failures', 'toggle', 'Alert preference.'),
      field('dailySummary', 'Daily operations summary', 'toggle', 'Alert preference.'),
      field('emailRecipient', 'Alert email', 'email', 'Destination for supported email notifications.', { maxLength: 254 }),
    ],
  },
  {
    id: 'ai',
    group: 'INTEGRATIONS',
    label: 'AI Assistant',
    description: 'Save an AI provider configuration for a future assistant integration.',
    status: 'API key is encrypted at rest. No AI provider requests are made by this settings page.',
    fields: [
      field('provider', 'Provider', 'select', 'AI service provider.', { options: [{ label: 'OpenAI', value: 'openai' }, { label: 'Anthropic', value: 'anthropic' }, { label: 'Amazon Bedrock', value: 'bedrock' }] }),
      field('model', 'Model name', 'text', 'Model identifier supported by your provider.', { maxLength: 120 }),
      field('apiKey', 'API key', 'password', 'Encrypted when saved; leave blank to keep the saved key.', { maxLength: 4096, secret: true }),
    ],
  },
  {
    id: 'accounting',
    group: 'INTEGRATIONS',
    label: 'Accounting',
    description: 'Set the accounting preferences used for future exports and integrations.',
    status: 'Preferences are saved. No external accounting platform is connected.',
    fields: [
      field('currency', 'Currency', 'select', 'Currency for accounting exports.', { options: [{ label: 'Kenyan shilling (KES)', value: 'KES' }, { label: 'US dollar (USD)', value: 'USD' }, { label: 'Euro (EUR)', value: 'EUR' }] }),
      field('taxRate', 'Default tax rate (%)', 'number', 'Default rate for future invoices; existing records are unchanged.', { maxLength: 5 }),
      field('businessName', 'Legal business name', 'text', 'Name for accounting records.', { maxLength: 160 }),
      field('taxNumber', 'Tax registration number', 'text', 'Optional tax identifier.', { maxLength: 80 }),
      field('fiscalYearStart', 'Fiscal year start month', 'select', 'First month of your fiscal year.', { options: Array.from({ length: 12 }, (_, index) => ({ label: new Date(2000, index, 1).toLocaleString('en', { month: 'long' }), value: String(index + 1) })) }),
    ],
  },
  {
    id: 'developer',
    group: 'INTEGRATIONS',
    label: 'Developer',
    description: 'Configure a webhook destination for future event delivery.',
    status: 'Webhook details are saved; delivery and API-token issuance are not enabled in this version.',
    fields: [
      field('webhookUrl', 'Webhook URL', 'url', 'HTTPS endpoint that you plan to receive workspace events at.', { maxLength: 2048 }),
      field('webhookEvents', 'Subscribed events', 'textarea', 'One event per line, such as subscriber.created or payment.received.', { maxLength: 2000 }),
      field('signingSecret', 'Webhook signing secret', 'password', 'Encrypted when saved; leave blank to keep the saved secret.', { maxLength: 256, secret: true }),
    ],
  },
]

export const tenantSettingSectionById = new Map(tenantSettingSections.map((section) => [section.id, section]))
