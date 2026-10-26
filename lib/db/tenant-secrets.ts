import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function encryptionKey() {
  const configured = process.env.TENANT_SECRETS_ENCRYPTION_KEY?.trim() || ''
  const key = /^[0-9a-f]{64}$/i.test(configured) ? Buffer.from(configured, 'hex') : Buffer.from(configured, 'base64')
  if (key.length !== 32) throw new Error('TENANT_SECRETS_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hexadecimal characters or base64.')
  return key
}

export function getTenantSecretConfigurationError(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  if (error.message.includes('TENANT_SECRETS_ENCRYPTION_KEY')) {
    return 'Set TENANT_SECRETS_ENCRYPTION_KEY to the same stable 32-byte key used to encrypt this workspace data.'
  }
  if (error.message.toLowerCase().includes('unable to authenticate data')) {
    return 'The configured TENANT_SECRETS_ENCRYPTION_KEY does not match the key used to encrypt this workspace data.'
  }
  return null
}

export function encryptTenantSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`
}

export function decryptTenantSecret(value: string) {
  const [ivEncoded, tagEncoded, dataEncoded] = value.split('.')
  if (!ivEncoded || !tagEncoded || !dataEncoded) throw new Error('Stored workspace credentials are invalid.')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivEncoded, 'base64'))
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataEncoded, 'base64')), decipher.final()]).toString('utf8')
}

export function tryDecryptTenantSecret(value: string): { value: string; error: null } | { value: null; error: string } {
  try {
    return { value: decryptTenantSecret(value), error: null }
  } catch (error) {
    const configurationError = getTenantSecretConfigurationError(error)
    if (configurationError) return { value: null, error: configurationError }
    throw error
  }
}
