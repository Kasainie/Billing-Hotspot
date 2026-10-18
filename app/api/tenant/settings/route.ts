import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantWorkspaceSettings } from '@/lib/db/schema'
import { requireTenantAdmin } from '@/lib/db/tenant-authorization'
import { decryptTenantSecret, encryptTenantSecret } from '@/lib/db/tenant-secrets'
import { tenantSettingSectionById } from '@/lib/tenant-settings'

type SettingValues = Record<string, string | number | boolean>
type StoredSettings = Record<string, SettingValues>
type StoredSecrets = Record<string, Record<string, string>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readSecrets(encrypted: string): StoredSecrets {
  const parsed: unknown = JSON.parse(decryptTenantSecret(encrypted))
  if (!isRecord(parsed)) throw new Error('Stored workspace secrets are invalid.')
  return parsed as StoredSecrets
}

export async function GET(request: NextRequest) {
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  try {
    const [record] = await db.select({
      settings: tenantWorkspaceSettings.settings,
      settingsEncrypted: tenantWorkspaceSettings.settingsEncrypted,
      secretsConfigured: tenantWorkspaceSettings.secretsConfigured,
    })
      .from(tenantWorkspaceSettings)
      .where(eq(tenantWorkspaceSettings.tenantId, access.session.tenantId))
      .limit(1)
    const settings: StoredSettings = record && isRecord(record.settings) ? record.settings as StoredSettings : {}
    const secretsConfigured = record?.secretsConfigured && isRecord(record.secretsConfigured)
      ? record.secretsConfigured as Record<string, string[]>
      : {}
    for (const section of tenantSettingSectionById.values()) {
      const values = { ...(settings[section.id] || {}) }
      for (const field of section.fields) {
        if (field.secret) values[field.key] = ''
      }
      settings[section.id] = values
    }
    return NextResponse.json({ settings, configured: secretsConfigured }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load workspace settings', error)
    return NextResponse.json({ error: 'Unable to load workspace settings.' }, { status: 503 })
  }
}

export async function PUT(request: NextRequest) {
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  let input: { section?: unknown; values?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Settings request must be valid JSON.' }, { status: 400 })
  }
  if (typeof input.section !== 'string' || !input.values || typeof input.values !== 'object' || Array.isArray(input.values)) {
    return NextResponse.json({ error: 'Choose a valid settings section.' }, { status: 400 })
  }
  const section = tenantSettingSectionById.get(input.section)
  if (!section) return NextResponse.json({ error: 'Choose a valid settings section.' }, { status: 400 })
  const submitted = input.values as Record<string, unknown>
  const allowedKeys = new Set(section.fields.map((field) => field.key))
  if (Object.keys(submitted).some((key) => !allowedKeys.has(key))) {
    return NextResponse.json({ error: 'Settings contain an unsupported field.' }, { status: 400 })
  }

  const updates: SettingValues = {}
  const secretUpdates: Record<string, string> = {}
  for (const field of section.fields) {
    if (!(field.key in submitted)) continue
    const value = submitted[field.key]
    if (field.type === 'toggle') {
      if (typeof value !== 'boolean') return NextResponse.json({ error: `${field.label} must be enabled or disabled.` }, { status: 400 })
      updates[field.key] = value
      continue
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      return NextResponse.json({ error: `Enter a valid ${field.label.toLowerCase()}.` }, { status: 400 })
    }
    const normalized = String(value).trim()
    if (normalized.length > (field.maxLength || 5000)) {
      return NextResponse.json({ error: `${field.label} is too long.` }, { status: 400 })
    }
    if (field.type === 'email' && normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return NextResponse.json({ error: `Enter a valid ${field.label.toLowerCase()}.` }, { status: 400 })
    }
    if (field.type === 'url' && normalized) {
      try {
        const parsed = new URL(normalized)
        if (parsed.protocol !== 'https:') throw new Error()
      } catch {
        return NextResponse.json({ error: `${field.label} must be an HTTPS URL.` }, { status: 400 })
      }
    }
    if (field.type === 'number' && normalized) {
      const number = Number(normalized)
      if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(number)) {
        return NextResponse.json({ error: `${field.label} must be a non-negative whole number.` }, { status: 400 })
      }
      updates[field.key] = number
      continue
    }
    if (field.type === 'select' && field.options && !field.options.some((option) => option.value === normalized)) {
      return NextResponse.json({ error: `Choose a valid ${field.label.toLowerCase()}.` }, { status: 400 })
    }
    if (field.secret) {
      if (normalized) secretUpdates[field.key] = normalized
      continue
    }
    if (field.key === 'brandColor' && normalized && !/^#[0-9a-f]{6}$/i.test(normalized)) {
      return NextResponse.json({ error: 'Brand color must be a six-digit hex color.' }, { status: 400 })
    }
    if (field.key === 'workspaceSlug' && normalized && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
      return NextResponse.json({ error: 'Workspace address must use lowercase letters, numbers, and hyphens.' }, { status: 400 })
    }
    if (field.key === 'customDomain' && normalized && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/i.test(normalized)) {
      return NextResponse.json({ error: 'Enter a valid hostname, such as wifi.example.com.' }, { status: 400 })
    }
    updates[field.key] = normalized
  }

  try {
    const [existing] = await db.select({
      settings: tenantWorkspaceSettings.settings,
      settingsEncrypted: tenantWorkspaceSettings.settingsEncrypted,
      secretsConfigured: tenantWorkspaceSettings.secretsConfigured,
    })
      .from(tenantWorkspaceSettings)
      .where(eq(tenantWorkspaceSettings.tenantId, access.session.tenantId))
      .limit(1)
    const settings: StoredSettings = existing && isRecord(existing.settings) ? existing.settings as StoredSettings : {}
    const configured = existing?.secretsConfigured && isRecord(existing.secretsConfigured)
      ? existing.secretsConfigured as Record<string, string[]>
      : {}
    let encryptedSecrets = existing?.settingsEncrypted || null
    if (Object.keys(secretUpdates).length) {
      const secrets = existing?.settingsEncrypted ? readSecrets(existing.settingsEncrypted) : {}
      secrets[section.id] = { ...secrets[section.id], ...secretUpdates }
      encryptedSecrets = encryptTenantSecret(JSON.stringify(secrets))
      configured[section.id] = [...new Set([...(configured[section.id] || []), ...Object.keys(secretUpdates)])]
    }
    settings[section.id] = { ...settings[section.id], ...updates }
    await db.insert(tenantWorkspaceSettings).values({
      tenantId: access.session.tenantId,
      settings,
      settingsEncrypted: encryptedSecrets,
      secretsConfigured: configured,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: tenantWorkspaceSettings.tenantId,
      set: { settings, settingsEncrypted: encryptedSecrets, secretsConfigured: configured, updatedAt: new Date() },
    })
    const returned = { ...settings[section.id] }
    for (const field of section.fields) if (field.secret) returned[field.key] = ''
    return NextResponse.json({ settings: returned, configured: configured[section.id] || [] })
  } catch (error) {
    console.error('Failed to save workspace settings', error)
    const message = error instanceof Error && error.message.includes('TENANT_SECRETS_ENCRYPTION_KEY')
      ? 'Set TENANT_SECRETS_ENCRYPTION_KEY before saving workspace settings.'
      : 'Unable to save workspace settings.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
