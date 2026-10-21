import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tenantPaymentGateways } from '@/lib/db/schema'
import { decryptTenantSecret, encryptTenantSecret } from '@/lib/db/tenant-secrets'
import {
  isPaymentGatewayProvider,
  paymentGatewayDefinitions,
  type PaymentGatewayEnvironment,
  type PaymentGatewayProvider,
} from '@/lib/payment-gateways'

export async function getTenantPaymentGateway(tenantId: string, provider: PaymentGatewayProvider, includeDisabled = false) {
  if (!paymentGatewayDefinitions[provider].available) return null
  const conditions = [
    eq(tenantPaymentGateways.tenantId, tenantId),
    eq(tenantPaymentGateways.provider, provider),
  ]
  if (!includeDisabled) conditions.push(eq(tenantPaymentGateways.enabled, true))
  const [gateway] = await db.select().from(tenantPaymentGateways).where(and(...conditions)).limit(1)
  if (!gateway) return null
  const secrets: unknown = JSON.parse(decryptTenantSecret(gateway.secretsEncrypted))
  if (!secrets || typeof secrets !== 'object' || Array.isArray(secrets)) {
    throw new Error('Stored payment gateway credentials are invalid.')
  }
  return {
    provider,
    environment: gateway.environment as PaymentGatewayEnvironment,
    settings: gateway.publicSettings,
    secrets: secrets as Record<string, string>,
  }
}

export async function listTenantPaymentGateways(tenantId: string) {
  const rows = await db.select({
    provider: tenantPaymentGateways.provider,
    environment: tenantPaymentGateways.environment,
    enabled: tenantPaymentGateways.enabled,
    secretsEncrypted: tenantPaymentGateways.secretsEncrypted,
  }).from(tenantPaymentGateways).where(eq(tenantPaymentGateways.tenantId, tenantId))
  const byProvider = new Map(rows.map((row) => [row.provider, row]))
  return Object.entries(paymentGatewayDefinitions).map(([provider, definition]) => {
    const row = byProvider.get(provider)
    let configuredSecrets: string[] = []
    if (row) {
      const parsed: unknown = JSON.parse(decryptTenantSecret(row.secretsEncrypted))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Stored payment gateway credentials are invalid.')
      }
      configuredSecrets = Object.keys(parsed)
    }
    return {
      provider,
      name: definition.name,
      environment: row?.environment === 'production' ? 'production' : 'sandbox',
      enabled: row?.enabled || false,
      configuredSecrets,
      requiredSecrets: definition.secretFields.map(({ key }) => key),
    }
  })
}

export function validatePaymentGatewayInput(input: unknown): {
  provider: PaymentGatewayProvider
  environment: PaymentGatewayEnvironment
  enabled: boolean
  secrets: Record<string, string>
} | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const values = input as Record<string, unknown>
  const provider = values.provider
  const environment = values.environment
  const enabled = values.enabled
  const secrets = values.secrets
  if (!isPaymentGatewayProvider(provider) ||
      !paymentGatewayDefinitions[provider].available ||
      (environment !== 'sandbox' && environment !== 'production') ||
      typeof enabled !== 'boolean' ||
      !secrets || typeof secrets !== 'object' || Array.isArray(secrets)) return null
  const allowedKeys = new Set(paymentGatewayDefinitions[provider].secretFields.map(({ key }) => key))
  if (Object.keys(secrets).some((key) => !allowedKeys.has(key))) return null
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(secrets)) {
    if (typeof value !== 'string' || value.trim().length > 2048) return null
    if (provider === 'intasend' && key === 'webhookChallenge' && value.trim().length < 32) return null
    if (value.trim()) normalized[key] = value.trim()
  }
  return { provider, environment, enabled, secrets: normalized }
}

export async function saveTenantPaymentGateway(tenantId: string, input: NonNullable<ReturnType<typeof validatePaymentGatewayInput>>) {
  const [existing] = await db.select().from(tenantPaymentGateways).where(and(
    eq(tenantPaymentGateways.tenantId, tenantId),
    eq(tenantPaymentGateways.provider, input.provider),
  )).limit(1)
  const previous: Record<string, string> = existing
    ? JSON.parse(decryptTenantSecret(existing.secretsEncrypted)) as Record<string, string>
    : {}
  const secrets = { ...previous, ...input.secrets }
  const required = paymentGatewayDefinitions[input.provider].secretFields.map(({ key }) => key)
  if (required.some((key) => !secrets[key]?.trim())) {
    throw new Error('Enter all required credentials before saving this gateway.')
  }
  if (input.enabled && required.some((key) => !secrets[key]?.trim())) {
    throw new Error('Configure all required credentials before enabling this gateway.')
  }
  const values = {
    tenantId,
    provider: input.provider,
    environment: input.environment,
    enabled: input.enabled,
    publicSettings: {},
    secretsEncrypted: encryptTenantSecret(JSON.stringify(secrets)),
    updatedAt: new Date(),
  }
  await db.insert(tenantPaymentGateways).values(values).onConflictDoUpdate({
    target: [tenantPaymentGateways.tenantId, tenantPaymentGateways.provider],
    set: {
      environment: values.environment,
      enabled: values.enabled,
      publicSettings: values.publicSettings,
      secretsEncrypted: values.secretsEncrypted,
      updatedAt: values.updatedAt,
    },
  })
}
