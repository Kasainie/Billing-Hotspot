import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

export const sites = pgTable('sites', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  location: text('location').notNull(),
  status: text('status').notNull().default('active'),
  customersCount: integer('customers_count').notNull().default(0),
  monthlyRevenue: integer('monthly_revenue').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id'),
  name: text('name').notNull(),
  email: text('email').notNull(),
  radiusUsername: text('radius_username'),
  phone: text('phone'),
  status: text('status').notNull().default('active'),
  plan: text('plan'),
  monthlyRate: integer('monthly_rate').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('customers_radius_username_unique_idx').on(table.radiusUsername)])

export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id'),
  amount: integer('amount').notNull(),
  status: text('status').notNull().default('paid'),
  method: text('method'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
  reference: text('reference'),
})

export const packages = pgTable('packages', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  downloadMbps: integer('download_mbps').notNull(),
  uploadMbps: integer('upload_mbps').notNull(),
  monthlyPrice: integer('monthly_price').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const radcheck = pgTable('radcheck', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().default(''),
  attribute: text('attribute').notNull().default(''),
  op: varchar('op', { length: 2 }).notNull().default('=='),
  value: text('value').notNull().default(''),
})

export const routerProvisioningTokens = pgTable('router_provisioning_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  configScript: text('config_script'),
  status: text('status').notNull().default('pending'),
  sourceIp: text('source_ip'),
  routerData: jsonb('router_data').$type<{
    interfaces: Array<{ name: string; running: boolean; disabled: boolean }>
    bridgePorts: Array<{ interface: string; bridge: string }>
    wanInterfaces: string[]
    bridgeName: string | null
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  downloadedAt: timestamp('downloaded_at', { withTimezone: true }),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
})

export const schema = { sites, customers, payments, packages, radcheck, routerProvisioningTokens }
export type Site = typeof sites.$inferSelect
export type Customer = typeof customers.$inferSelect
export type Payment = typeof payments.$inferSelect
export type Package = typeof packages.$inferSelect

export default schema
