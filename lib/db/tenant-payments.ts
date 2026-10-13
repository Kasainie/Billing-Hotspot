import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tenantPaymentSettings } from '@/lib/db/schema'
import { decryptTenantSecret, encryptTenantSecret } from '@/lib/db/tenant-secrets'
import { getDarajaConfiguration, type DarajaConfiguration } from '@/lib/daraja'

type TenantPaymentInput = {
  environment: 'sandbox' | 'production'
  consumerKey: string
  consumerSecret: string
  shortcode: string
  passkey: string
  callbackUrl: string
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
    consumerKeyEncrypted: encryptTenantSecret(input.consumerKey),
    consumerSecretEncrypted: encryptTenantSecret(input.consumerSecret),
    shortcode: input.shortcode,
    passkeyEncrypted: encryptTenantSecret(input.passkey),
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
    consumerKey: decryptTenantSecret(settings.consumerKeyEncrypted),
    consumerSecret: decryptTenantSecret(settings.consumerSecretEncrypted),
    shortcode: settings.shortcode,
    passkey: decryptTenantSecret(settings.passkeyEncrypted),
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
