import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

export const DEFAULT_TENANT_ID = 'default'

export const tenants = pgTable('tenants', {
  id: text('id').notNull().primaryKey().default(DEFAULT_TENANT_ID),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tenantUsers = pgTable('tenant_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  googleSubject: text('google_subject'),
  emailVerified: boolean('email_verified').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('tenant_users_google_subject_unique_idx').on(table.googleSubject),
])

export const emailVerificationCodes = pgTable('email_verification_codes', {
  userId: uuid('user_id').notNull().primaryKey().references(() => tenantUsers.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const adminActionConfirmationCodes = pgTable('admin_action_confirmation_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  ownerUserId: uuid('owner_user_id').notNull().references(() => tenantUsers.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  recordId: text('record_id').notNull(),
  payloadHash: text('payload_hash').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('admin_action_confirmation_lookup_idx').on(table.tenantId, table.action, table.recordId),
])

export const tenantMemberships = pgTable('tenant_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => tenantUsers.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('owner'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('tenant_memberships_tenant_user_unique_idx').on(table.tenantId, table.userId),
])

export const tenantSessions = pgTable('tenant_sessions', {
  tokenHash: text('token_hash').notNull().primaryKey(),
  userId: uuid('user_id').notNull().references(() => tenantUsers.id, { onDelete: 'cascade' }),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const passkeyCredentials = pgTable('passkey_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => tenantUsers.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id').notNull().unique(),
  publicKey: text('public_key').notNull(),
  counter: bigint('counter', { mode: 'number' }).notNull().default(0),
  transports: jsonb('transports').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('passkey_credentials_user_created_idx').on(table.userId, table.createdAt),
])

export const passkeyChallenges = pgTable('passkey_challenges', {
  challengeHash: text('challenge_hash').primaryKey(),
  challenge: text('challenge').notNull(),
  userId: uuid('user_id').references(() => tenantUsers.id, { onDelete: 'cascade' }),
  purpose: text('purpose').notNull(),
  origin: text('origin').notNull(),
  rpId: text('rp_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('passkey_challenges_expires_idx').on(table.expiresAt),
])

export const passkeyMobileHandoffs = pgTable('passkey_mobile_handoffs', {
  tokenHash: text('token_hash').primaryKey(),
  codeChallenge: text('code_challenge').notNull(),
  userId: uuid('user_id').notNull().references(() => tenantUsers.id, { onDelete: 'cascade' }),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('passkey_mobile_handoffs_expires_idx').on(table.expiresAt),
])

export const passwordResetTokens = pgTable('password_reset_tokens', {
  tokenHash: text('token_hash').notNull().primaryKey(),
  userId: uuid('user_id').notNull().references(() => tenantUsers.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('password_reset_tokens_user_unique_idx').on(table.userId),
])

export const tenantPaymentSettings = pgTable('tenant_payment_settings', {
  tenantId: text('tenant_id').notNull().primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  environment: text('environment').notNull().default('sandbox'),
  consumerKeyEncrypted: text('consumer_key_encrypted').notNull(),
  consumerSecretEncrypted: text('consumer_secret_encrypted').notNull(),
  shortcode: text('shortcode').notNull(),
  passkeyEncrypted: text('passkey_encrypted').notNull(),
  callbackUrl: text('callback_url').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tenantPaymentGateways = pgTable('tenant_payment_gateways', {
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  environment: text('environment').notNull().default('sandbox'),
  enabled: boolean('enabled').notNull().default(false),
  publicSettings: jsonb('public_settings').$type<Record<string, string>>().notNull().default({}),
  secretsEncrypted: text('secrets_encrypted').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.provider], name: 'tenant_payment_gateways_pkey' }),
])

export const tenantSmsSettings = pgTable('tenant_sms_settings', {
  tenantId: text('tenant_id').notNull().primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  environment: text('environment').notNull().default('production'),
  infobipBaseUrl: text('infobip_base_url'),
  infobipApiKeyEncrypted: text('infobip_api_key_encrypted'),
  infobipSmsSender: text('infobip_sms_sender'),
  infobipWhatsappSender: text('infobip_whatsapp_sender'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tenantWorkspaceSettings = pgTable('tenant_workspace_settings', {
  tenantId: text('tenant_id').notNull().primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  settings: jsonb('settings').$type<Record<string, Record<string, string | number | boolean>>>().notNull().default({}),
  settingsEncrypted: text('settings_encrypted'),
  secretsConfigured: jsonb('secrets_configured').$type<Record<string, string[]>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const smsMessages = pgTable('sms_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id'),
  channel: text('channel').notNull().default('sms'),
  eventKey: text('event_key').notNull(),
  recipient: text('recipient').notNull(),
  messageEncrypted: text('message_encrypted').notNull(),
  status: text('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  lastError: text('last_error'),
  providerMessageId: text('provider_message_id'),
  deliveryStatus: text('delivery_status').notNull().default('queued'),
  deliveryReport: jsonb('delivery_report'),
  deliveryReportedAt: timestamp('delivery_reported_at', { withTimezone: true }),
  resendOfId: uuid('resend_of_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('sms_messages_tenant_event_unique_idx').on(table.tenantId, table.eventKey),
  index('sms_messages_queued_next_attempt_idx').on(table.status, table.nextAttemptAt),
  index('sms_messages_tenant_customer_created_idx').on(table.tenantId, table.customerId, table.createdAt),
])

export const mobileMoneyTransactions = pgTable('mobile_money_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  transactionId: text('transaction_id').notNull(),
  billReference: text('bill_reference').notNull(),
  amount: integer('amount').notNull(),
  phone: text('phone'),
  transactionAt: timestamp('transaction_at', { withTimezone: true }),
  status: text('status').notNull().default('unmatched'),
  customerId: uuid('customer_id').references(() => customers.id),
  matchReason: text('match_reason'),
  callbackPayload: jsonb('callback_payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('mobile_money_transactions_tenant_transaction_unique_idx').on(table.tenantId, table.transactionId),
])

export const sites = pgTable('sites', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT_ID),
  name: text('name').notNull(),
  location: text('location').notNull(),
  status: text('status').notNull().default('active'),
  customersCount: integer('customers_count').notNull().default(0),
  monthlyRevenue: integer('monthly_revenue').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT_ID),
  siteId: uuid('site_id'),
  location: text('location'),
  accountNumber: integer('account_number'),
  name: text('name').notNull(),
  email: text('email').notNull(),
  radiusUsername: text('radius_username'),
  phone: text('phone'),
  status: text('status').notNull().default('active'),
  plan: text('plan'),
  isVip: boolean('is_vip').notNull().default(false),
  monthlyRate: integer('monthly_rate').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('customers_radius_username_unique_idx').on(table.radiusUsername)])

export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT_ID),
  customerId: uuid('customer_id'),
  amount: integer('amount').notNull(),
  status: text('status').notNull().default('paid'),
  method: text('method'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
  reference: text('reference'),
})

export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  location: text('location'),
  coverageStatus: text('coverage_status').notNull().default('pending'),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  source: text('source'),
  status: text('status').notNull().default('new'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  requesterName: text('requester_name').notNull(),
  requesterEmail: text('requester_email'),
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull().default('other'),
  priority: text('priority').notNull().default('normal'),
  status: text('status').notNull().default('open'),
  assignedTo: text('assigned_to'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const expenses = pgTable('expenses', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  description: text('description').notNull(),
  amount: integer('amount').notNull(),
  paidTo: text('paid_to'),
  reference: text('reference'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const packages = pgTable('packages', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT_ID),
  name: text('name').notNull(),
  type: text('type').notNull().default('Hotspot'),
  availability: text('availability').notNull().default('live'),
  listed: boolean('listed').notNull().default(true),
  downloadMbps: integer('download_mbps').notNull(),
  uploadMbps: integer('upload_mbps').notNull(),
  rateLimit: text('rate_limit').notNull().default('20M/10M'),
  monthlyPrice: integer('monthly_price').notNull(),
  durationSeconds: integer('duration_seconds').notNull().default(2592000),
  devicesPerAccount: integer('devices_per_account').notNull().default(1),
  burstLimit: text('burst_limit'),
  burstThreshold: text('burst_threshold'),
  burstTimeSeconds: integer('burst_time_seconds'),
  fupEnabled: boolean('fup_enabled').notNull().default(false),
  fupLimitBytes: bigint('fup_limit_bytes', { mode: 'number' }),
  fupUploadRate: text('fup_upload_rate'),
  fupDownloadRate: text('fup_download_rate'),
  scheduleEnabled: boolean('schedule_enabled').notNull().default(false),
  scheduleSpec: text('schedule_spec'),
  nasRestrictions: jsonb('nas_restrictions').$type<string[]>().notNull().default([]),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const vouchers = pgTable('vouchers', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  packageId: uuid('package_id').notNull().references(() => packages.id, { onDelete: 'restrict' }),
  username: text('username').notNull(),
  status: text('status').notNull().default('active'),
  validitySeconds: integer('validity_seconds'),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('vouchers_tenant_username_unique_idx').on(table.tenantId, table.username),
])

export const equipment = pgTable('equipment', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  category: text('category').notNull(),
  serialNumber: text('serial_number'),
  manufacturer: text('manufacturer'),
  model: text('model'),
  status: text('status').notNull().default('in_service'),
  condition: text('condition').notNull().default('good'),
  quantity: integer('quantity').notNull().default(0),
  unit: text('unit').notNull().default('pcs'),
  minimumQuantity: integer('minimum_quantity').notNull().default(0),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const procurementItems = pgTable('procurement_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull().default('Network equipment'),
  quantity: integer('quantity').notNull().default(1),
  unit: text('unit').notNull().default('pcs'),
  estimatedUnitCost: integer('estimated_unit_cost').notNull().default(0),
  priority: text('priority').notNull().default('normal'),
  status: text('status').notNull().default('needed'),
  supplier: text('supplier'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('procurement_items_tenant_created_idx').on(table.tenantId, table.createdAt),
])

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  equipmentId: uuid('equipment_id').notNull().references(() => equipment.id, { onDelete: 'cascade' }),
  movementType: text('movement_type').notNull(),
  quantity: integer('quantity').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tr069Devices = pgTable('tr069_devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
  serialNumber: text('serial_number').notNull(),
  manufacturer: text('manufacturer'),
  model: text('model'),
  firmwareVersion: text('firmware_version'),
  connectionRequestUrl: text('connection_request_url'),
  status: text('status').notNull().default('pending'),
  lastInformAt: timestamp('last_inform_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('tr069_devices_tenant_serial_unique_idx').on(table.tenantId, table.serialNumber),
])

export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
  invoiceNumber: text('invoice_number').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  amount: integer('amount').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('draft'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('invoices_tenant_number_unique_idx').on(table.tenantId, table.invoiceNumber),
  uniqueIndex('invoices_tenant_customer_period_unique_idx').on(table.tenantId, table.customerId, table.periodStart),
])

export const subscriberCredits = pgTable('subscriber_credits', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
  type: text('type').notNull(),
  amount: integer('amount').notNull(),
  reason: text('reason').notNull(),
  reference: text('reference'),
  createdBy: uuid('created_by').references(() => tenantUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('subscriber_credits_tenant_customer_created_idx').on(table.tenantId, table.customerId, table.createdAt),
  uniqueIndex('subscriber_credits_tenant_reference_unique_idx').on(table.tenantId, table.reference),
])

export const subscriberEvents = pgTable('subscriber_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull(),
  eventType: text('event_type').notNull(),
  description: text('description').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid('created_by').references(() => tenantUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('subscriber_events_tenant_customer_created_idx').on(table.tenantId, table.customerId, table.createdAt),
])

export const hotspotPortalSettings = pgTable('hotspot_portal_settings', {
  id: integer('id').notNull().default(1),
  tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT_ID),
  activeTemplate: text('active_template').notNull().default('original'),
  companyName: text('company_name').notNull().default('LKTECH'),
  welcomeHeadline: text('welcome_headline').notNull().default('Connect to what matters.'),
  welcomeMessage: text('welcome_message').notNull().default('Work, learn, stream, and stay close to the people who matter. Choose a plan and get online.'),
  supportMessage: text('support_message').notNull().default('Need help? Contact your network operator.'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.id] }),
])

export const radcheck = pgTable('radcheck', {
  id: serial('id').primaryKey(),
  tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT_ID),
  username: text('username').notNull().default(''),
  attribute: text('attribute').notNull().default(''),
  op: varchar('op', { length: 2 }).notNull().default('=='),
  value: text('value').notNull().default(''),
})

export const routerProvisioningTokens = pgTable('router_provisioning_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT_ID),
  tokenHash: text('token_hash').notNull().unique(),
  configScript: text('config_script'),
  status: text('status').notNull().default('pending'),
  sourceIp: text('source_ip'),
  routerData: jsonb('router_data').$type<{
    interfaces: Array<{ name: string; running: boolean; disabled: boolean }>
    bridgePorts: Array<{ interface: string; bridge: string }>
    wanInterfaces: string[]
    bridges?: string[]
    interfaceNetworks?: Array<{ interface: string; network: string }>
    bridgeName: string | null
    serviceConfiguration?: {
      bridgeName: string
      lanBridgeName?: string | null
      ports: string[]
      managedPorts: string[]
      movablePorts?: string[]
      wanPorts: string[]
      services: string[]
      hotspotSubnet: string | null
      pppoeSubnet: string | null
      hotspotAntiSharing: boolean
      preparedAt: string
    }
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  downloadedAt: timestamp('downloaded_at', { withTimezone: true }),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  configuredAt: timestamp('configured_at', { withTimezone: true }),
})

export const routerMonitors = pgTable('router_monitors', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  routerName: text('router_name').notNull(),
  tokenHash: text('token_hash').notNull(),
  previousTokenHash: text('previous_token_hash'),
  previousTokenExpiresAt: timestamp('previous_token_expires_at', { withTimezone: true }),
  enabled: boolean('enabled').notNull().default(true),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  lastSourceIp: text('last_source_ip'),
  connectorTokenHash: text('connector_token_hash'),
  connectorLastSeenAt: timestamp('connector_last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('router_monitors_tenant_name_unique_idx').on(table.tenantId, table.routerName),
  uniqueIndex('router_monitors_token_hash_unique_idx').on(table.tokenHash),
])

export const routerRemoteSessions = pgTable('router_remote_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  routerId: uuid('router_id').notNull().references(() => routerMonitors.id, { onDelete: 'cascade' }),
  sessionType: text('session_type').notNull(),
  routerSessionId: text('router_session_id').notNull(),
  username: text('username').notNull(),
  macAddress: text('mac_address'),
  ipAddress: text('ip_address'),
  callerId: text('caller_id'),
  uptimeSeconds: integer('uptime_seconds'),
  downloadBytes: bigint('download_bytes', { mode: 'bigint' }),
  uploadBytes: bigint('upload_bytes', { mode: 'bigint' }),
  downloadBps: bigint('download_bps', { mode: 'bigint' }),
  uploadBps: bigint('upload_bps', { mode: 'bigint' }),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('router_remote_sessions_identity_unique_idx').on(table.routerId, table.sessionType, table.routerSessionId),
  index('router_remote_sessions_observed_idx').on(table.routerId, table.observedAt),
])

export const routerConnectorCommands = pgTable('router_connector_commands', {
  id: uuid('id').defaultRandom().primaryKey(),
  routerId: uuid('router_id').notNull().references(() => routerMonitors.id, { onDelete: 'cascade' }),
  requestedBy: uuid('requested_by').references(() => tenantUsers.id, { onDelete: 'set null' }),
  sessionType: text('session_type').notNull(),
  routerSessionId: text('router_session_id').notNull(),
  username: text('username').notNull(),
  status: text('status').notNull().default('queued'),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  claimToken: uuid('claim_token'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('router_connector_commands_queue_idx').on(table.routerId, table.status, table.createdAt),
])

export const routerConnectorQueries = pgTable('router_connector_queries', {
  id: uuid('id').defaultRandom().primaryKey(),
  routerId: uuid('router_id').notNull().references(() => routerMonitors.id, { onDelete: 'cascade' }),
  requestedBy: uuid('requested_by').references(() => tenantUsers.id, { onDelete: 'set null' }),
  resource: text('resource').notNull(),
  status: text('status').notNull().default('queued'),
  result: jsonb('result'),
  errorMessage: text('error_message'),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  claimToken: uuid('claim_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('router_connector_queries_queue_idx').on(table.routerId, table.status, table.createdAt),
])

export const routerMetricSamples = pgTable('router_metric_samples', {
  id: uuid('id').defaultRandom().primaryKey(),
  routerId: uuid('router_id').notNull().references(() => routerMonitors.id, { onDelete: 'cascade' }),
  sampledAt: timestamp('sampled_at', { withTimezone: true }).notNull().defaultNow(),
  cpuLoad: integer('cpu_load').notNull(),
  freeMemoryBytes: bigint('free_memory_bytes', { mode: 'number' }).notNull(),
  totalMemoryBytes: bigint('total_memory_bytes', { mode: 'number' }).notNull(),
  freeDiskBytes: bigint('free_disk_bytes', { mode: 'number' }),
  totalDiskBytes: bigint('total_disk_bytes', { mode: 'number' }),
  totalRxBytes: bigint('total_rx_bytes', { mode: 'number' }),
  totalTxBytes: bigint('total_tx_bytes', { mode: 'number' }),
  activeHotspotUsers: integer('active_hotspot_users').notNull().default(0),
  activePppoeUsers: integer('active_pppoe_users').notNull().default(0),
  uptimeSeconds: bigint('uptime_seconds', { mode: 'number' }).notNull(),
  routerOsVersion: text('router_os_version'),
  boardName: text('board_name'),
  temperatureCelsius: integer('temperature_celsius'),
  winboxEnabled: boolean('winbox_enabled'),
  winboxPort: integer('winbox_port'),
  webEnabled: boolean('web_enabled'),
  webScheme: text('web_scheme'),
  webPort: integer('web_port'),
  wireguardIp: text('wireguard_ip'),
}, (table) => [
  index('router_metric_samples_router_sampled_idx').on(table.routerId, table.sampledAt),
])

export const radreply = pgTable('radreply', {
  id: serial('id').primaryKey(),
  tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT_ID),
  username: text('username').notNull().default(''),
  attribute: text('attribute').notNull().default(''),
  op: varchar('op', { length: 2 }).notNull().default('='),
  value: text('value').notNull().default(''),
})

export const pppoeAccounts = pgTable('pppoe_accounts', {
  accountNumber: integer('account_number').generatedAlwaysAsIdentity({ startWith: 42000 }).primaryKey(),
  tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT_ID),
  phone: text('phone').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  customerId: uuid('customer_id').unique().references(() => customers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('pppoe_accounts_tenant_phone_unique_idx').on(table.tenantId, table.phone),
])

export const pppoePayments = pgTable('pppoe_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT_ID),
  accountNumber: integer('account_number').notNull().references(() => pppoeAccounts.accountNumber),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  durationSeconds: integer('duration_seconds').notNull(),
  amount: integer('amount').notNull(),
  packageSnapshot: jsonb('package_snapshot').$type<{
    rateLimit: string
    devicesPerAccount: number
  }>().notNull(),
  status: text('status').notNull().default('initiating'),
  gatewayProvider: text('gateway_provider').notNull().default('daraja'),
  merchantRequestId: text('merchant_request_id'),
  checkoutRequestId: text('checkout_request_id'),
  receipt: text('receipt'),
  failureReason: text('failure_reason'),
  callbackPayload: jsonb('callback_payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('pppoe_payments_checkout_request_unique_idx').on(table.checkoutRequestId),
  uniqueIndex('pppoe_payments_receipt_unique_idx').on(table.receipt),
])

export const hotspotPurchases = pgTable('hotspot_purchases', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().default(DEFAULT_TENANT_ID),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  durationSeconds: integer('duration_seconds').notNull(),
  amount: integer('amount').notNull(),
  phone: text('phone'),
  sourceIp: text('source_ip'),
  clientMac: text('client_mac'),
  packageSnapshot: jsonb('package_snapshot').$type<{
    type: string
    rateLimit: string
    devicesPerAccount: number
    burstLimit: string | null
    burstThreshold: string | null
    burstTimeSeconds: number | null
    fupEnabled: boolean
    fupLimitBytes: number | null
    fupUploadRate: string | null
    fupDownloadRate: string | null
    scheduleEnabled: boolean
    scheduleSpec: string | null
    nasRestrictions: string[]
  }>(),
  status: text('status').notNull().default('initiating'),
  gatewayProvider: text('gateway_provider').notNull().default('daraja'),
  merchantRequestId: text('merchant_request_id'),
  checkoutRequestId: text('checkout_request_id'),
  receipt: text('receipt'),
  radiusUsername: text('radius_username'),
  failureReason: text('failure_reason'),
  callbackPayload: jsonb('callback_payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('hotspot_purchases_checkout_request_unique_idx').on(table.checkoutRequestId),
  uniqueIndex('hotspot_purchases_receipt_unique_idx').on(table.receipt),
])

export const schema = { tenants, tenantUsers, emailVerificationCodes, tenantMemberships, tenantSessions, passwordResetTokens, tenantPaymentSettings, tenantPaymentGateways, tenantSmsSettings, tenantWorkspaceSettings, smsMessages, mobileMoneyTransactions, sites, customers, payments, leads, supportTickets, expenses, packages, vouchers, equipment, inventoryMovements, tr069Devices, invoices, hotspotPortalSettings, radcheck, radreply, pppoeAccounts, pppoePayments, hotspotPurchases, routerProvisioningTokens, routerMonitors, routerRemoteSessions, routerConnectorCommands, routerConnectorQueries, routerMetricSamples }
export type Site = typeof sites.$inferSelect
export type Customer = typeof customers.$inferSelect
export type Payment = typeof payments.$inferSelect
export type Package = typeof packages.$inferSelect
export type Tenant = typeof tenants.$inferSelect
export type Lead = typeof leads.$inferSelect
export type SupportTicket = typeof supportTickets.$inferSelect
export type Expense = typeof expenses.$inferSelect
export type Voucher = typeof vouchers.$inferSelect
export type Equipment = typeof equipment.$inferSelect
export type Tr069Device = typeof tr069Devices.$inferSelect
export type Invoice = typeof invoices.$inferSelect

export default schema
