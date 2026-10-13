import { NextRequest, NextResponse } from 'next/server'
import { getTenantSession } from '@/lib/db/tenant'
import { getTenantSmsOverview, saveTenantSmsSettings, sendTestTenantSms, validateTenantSmsInput } from '@/lib/db/tenant-sms'

export async function GET(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view SMS settings.' }, { status: 401 })
  try {
    return NextResponse.json(await getTenantSmsOverview(session.tenantId, request.nextUrl.origin), { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load tenant SMS settings', error)
    return NextResponse.json({ error: 'Unable to load SMS settings.' }, { status: 503 })
  }
}

export async function PUT(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to update SMS settings.' }, { status: 401 })
  let input: Record<string, unknown>
  try {
    input = await request.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'SMS settings are invalid.' }, { status: 400 })
  }
  const settings = validateTenantSmsInput(input)
  if (!settings) {
    return NextResponse.json({ error: 'Enter a valid environment, Africa’s Talking username, API key, and optional sender ID.' }, { status: 400 })
  }
  try {
    await saveTenantSmsSettings(session.tenantId, settings)
    return NextResponse.json({ configured: true, environment: settings.environment, username: settings.username, senderId: settings.senderId || '' })
  } catch (error) {
    console.error('Failed to save tenant SMS settings', error)
    const message = error instanceof Error && error.message.includes('TENANT_SECRETS_ENCRYPTION_KEY')
      ? 'Set TENANT_SECRETS_ENCRYPTION_KEY to a secure 32-byte key before saving SMS credentials.'
      : 'Unable to save SMS settings.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to test SMS settings.' }, { status: 401 })
  let input: { phone?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Enter a phone number for the test message.' }, { status: 400 })
  }
  if (typeof input.phone !== 'string') return NextResponse.json({ error: 'Enter a phone number for the test message.' }, { status: 400 })
  try {
    await sendTestTenantSms(session.tenantId, input.phone)
    return NextResponse.json({ message: 'Test SMS sent successfully.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send a test SMS.'
    const status = message.startsWith('Enter a valid') ? 400 : message.startsWith('Configure') ? 409 : 502
    if (status === 502) console.error('Failed to send tenant SMS test', error)
    return NextResponse.json({ error: message }, { status })
  }
}

export const dynamic = 'force-dynamic'
