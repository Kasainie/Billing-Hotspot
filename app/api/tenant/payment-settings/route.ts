import { NextRequest, NextResponse } from 'next/server'
import { getTenantSession } from '@/lib/db/tenant'
import { getTenantPaymentMetadata, saveTenantPaymentSettings, validateTenantPaymentInput } from '@/lib/db/tenant-payments'
import { getTenantC2bCallbackToken } from '@/lib/mobile-money-callback'

export async function GET(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view payment settings.' }, { status: 401 })
  try {
    const metadata = await getTenantPaymentMetadata(session.tenantId)
    const token = getTenantC2bCallbackToken(session.tenantId)
    const baseUrl = process.env.APP_URL?.trim() || request.nextUrl.origin
    const c2bUrls = token ? {
      validationUrl: new URL(`/api/hotspot/daraja/c2b/validation?tenant=${encodeURIComponent(session.tenantSlug)}&token=${token}`, baseUrl).toString(),
      confirmationUrl: new URL(`/api/hotspot/daraja/c2b/confirmation?tenant=${encodeURIComponent(session.tenantSlug)}&token=${token}`, baseUrl).toString(),
    } : { validationUrl: '', confirmationUrl: '' }
    return NextResponse.json({ ...metadata, c2bUrls }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load tenant payment settings', error)
    return NextResponse.json({ error: 'Unable to load payment settings.' }, { status: 503 })
  }
}

export async function PUT(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to update payment settings.' }, { status: 401 })
  let input: Record<string, unknown>
  try {
    input = await request.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Payment settings are invalid.' }, { status: 400 })
  }
  const settings = validateTenantPaymentInput(input)
  if (!settings) {
    return NextResponse.json({ error: 'Enter a valid environment, consumer key, consumer secret, 5-7 digit shortcode, passkey, and HTTPS callback URL.' }, { status: 400 })
  }
  try {
    await saveTenantPaymentSettings(session.tenantId, settings)
    return NextResponse.json({ configured: true, environment: settings.environment, shortcode: settings.shortcode, callbackUrl: settings.callbackUrl })
  } catch (error) {
    console.error('Failed to save tenant payment settings', error)
    const message = error instanceof Error && error.message.includes('TENANT_SECRETS_ENCRYPTION_KEY')
      ? 'Set TENANT_SECRETS_ENCRYPTION_KEY to a secure 32-byte key before saving payment credentials.'
      : 'Unable to save payment settings.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
