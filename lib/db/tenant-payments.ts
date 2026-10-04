import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tenantPaymentSettings } from '@/lib/db/schema'
import { getDarajaConfiguration, type DarajaConfiguration } from '@/lib/daraja'

type TenantPaymentInput = {
  environment: 'sandbox' | 'production'
  consumerKey: string
  consumerSecret: string
  shortcode: string
  passkey: string
  callbackUrl: string
}

function encryptionKey() {
  const configured = process.env.TENANT_SECRETS_ENCRYPTION_KEY?.trim() || ''
  const key = /^[0-9a-f]{64}$/i.test(configured) ? Buffer.from(configured, 'hex') : Buffer.from(configured, 'base64')
  if (key.length !== 32) throw new Error('TENANT_SECRETS_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hexadecimal characters or base64.')
  return key
}

function encrypt(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`
}

function decrypt(value: string) {
  const [ivEncoded, tagEncoded, dataEncoded] = value.split('.')
  if (!ivEncoded || !tagEncoded || !dataEncoded) throw new Error('Stored Daraja credentials are invalid.')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivEncoded, 'base64'))
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataEncoded, 'base64')), decipher.final()]).toString('utf8')
}

export function validateTenantPaymentInput(input: Record<string, unknown>): TenantPaymentInput | null {
  const environment = input.environment
  const consumerKey = typeof input.consumerKey === 'string' ? input.consumerKey.trim() : ''
  const consumerSecret = typeof input.consumerSecret === 'string' ? input.consumerSecret.trim() : ''
  const shortcode = typeof input.shortcode === 'string' ? input.shortcode.trim() : ''
  const passkey = typeof input.passkey === 'string' ? input.passkey.trim() : ''
  const callbackUrl = typeof input.callbackUrl === 'string' ? input.callbackUrl.trim() : ''
  if ((environment !== 'sandbox' && environment !== 'production') ||
      consumerKey.length < 1 || consumerKey.length > 512 ||
      consumerSecret.length < 1 || consumerSecret.length > 512 ||
      !/^\d{5,7}$/.test(shortcode) ||
      passkey.length < 1 || passkey.length > 512) return null
  try {
    if (new URL(callbackUrl).protocol !== 'https:' || callbackUrl.length > 2048) return null
  } catch {
    return null
  }
  return { environment, consumerKey, consumerSecret, shortcode, passkey, callbackUrl }
}

export async function saveTenantPaymentSettings(tenantId: string, input: TenantPaymentInput) {
  const values = {
    tenantId,
    environment: input.environment,
    consumerKeyEncrypted: encrypt(input.consumerKey),
    consumerSecretEncrypted: encrypt(input.consumerSecret),
    shortcode: input.shortcode,
    passkeyEncrypted: encrypt(input.passkey),
    callbackUrl: input.callbackUrl,
    updatedAt: new Date(),
  }
  await db.insert(tenantPaymentSettings).values(values).onConflictDoUpdate({
    target: tenantPaymentSettings.tenantId,
    set: {
      environment: values.environment,
      consumerKeyEncrypted: values.consumerKeyEncrypted,
      consumerSecretEncrypted: values.consumerSecretEncrypted,
      shortcode: values.shortcode,
      passkeyEncrypted: values.passkeyEncrypted,
      callbackUrl: values.callbackUrl,
      updatedAt: values.updatedAt,
    },
  })
}

export async function getTenantDarajaConfiguration(tenantId: string): Promise<DarajaConfiguration | null> {
  const [settings] = await db.select().from(tenantPaymentSettings)
    .where(eq(tenantPaymentSettings.tenantId, tenantId))
    .limit(1)
  if (!settings) return tenantId === 'default' ? getDarajaConfiguration() : null
  return {
    environment: settings.environment === 'production' ? 'production' : 'sandbox',
    consumerKey: decrypt(settings.consumerKeyEncrypted),
    consumerSecret: decrypt(settings.consumerSecretEncrypted),
    shortcode: settings.shortcode,
    passkey: decrypt(settings.passkeyEncrypted),
    callbackUrl: settings.callbackUrl,
  }
}

export async function hasTenantDarajaConfiguration(tenantId: string) {
  const [settings] = await db.select({ tenantId: tenantPaymentSettings.tenantId }).from(tenantPaymentSettings)
    .where(eq(tenantPaymentSettings.tenantId, tenantId))
    .limit(1)
  return Boolean(settings) || (tenantId === 'default' && Boolean(getDarajaConfiguration()))
}

export async function getTenantPaymentMetadata(tenantId: string) {
  const [settings] = await db.select({
    environment: tenantPaymentSettings.environment,
    shortcode: tenantPaymentSettings.shortcode,
    callbackUrl: tenantPaymentSettings.callbackUrl,
  }).from(tenantPaymentSettings)
    .where(eq(tenantPaymentSettings.tenantId, tenantId))
    .limit(1)
  if (settings) return { ...settings, configured: true }
  const legacyConfig = tenantId === 'default' ? getDarajaConfiguration() : null
  return {
    environment: legacyConfig?.environment || 'sandbox',
    shortcode: legacyConfig?.shortcode || '',
    callbackUrl: legacyConfig?.callbackUrl || '',
    configured: Boolean(legacyConfig),
  }
}
