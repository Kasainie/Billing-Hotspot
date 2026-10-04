import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { getTenantDarajaConfiguration } from '@/lib/db/tenant-payments'
import type { C2BPayload } from '@/lib/mobile-money-parser'
export { parseC2bTransaction } from '@/lib/mobile-money-parser'

function tokenMatches(provided: string, expected: string) {
  const providedHash = createHash('sha256').update(provided).digest()
  const expectedHash = createHash('sha256').update(expected).digest()
  return timingSafeEqual(providedHash, expectedHash)
}

export function getTenantC2bCallbackToken(tenantId: string) {
  const secret = process.env.C2B_CALLBACK_SECRET || ''
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) return null
  return createHmac('sha256', secret).update(`lktech-c2b:${tenantId}`).digest('base64url')
}

export async function authorizeC2bCallback(request: NextRequest, tenantId: string, payload: C2BPayload) {
  const expectedToken = getTenantC2bCallbackToken(tenantId)
  if (!expectedToken) return { ok: false as const, status: 503, error: 'C2B_CALLBACK_SECRET must be configured with at least 32 URL-safe characters.' }
  if (!tokenMatches(request.nextUrl.searchParams.get('token') || '', expectedToken)) {
    return { ok: false as const, status: 401, error: 'Invalid payment callback token.' }
  }

  const configuration = await getTenantDarajaConfiguration(tenantId)
  if (!configuration) return { ok: false as const, status: 503, error: 'Workspace payment settings are not configured.' }
  if (String(payload.BusinessShortCode || '') !== configuration.shortcode) {
    return { ok: false as const, status: 400, error: 'Payment shortcode does not match this workspace.' }
  }
  return { ok: true as const }
}
