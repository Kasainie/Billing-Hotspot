import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function encryptionKey() {
  const configured = process.env.TENANT_SECRETS_ENCRYPTION_KEY?.trim() || ''
  const key = /^[0-9a-f]{64}$/i.test(configured) ? Buffer.from(configured, 'hex') : Buffer.from(configured, 'base64')
  if (key.length !== 32) throw new Error('TENANT_SECRETS_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hexadecimal characters or base64.')
  return key
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
