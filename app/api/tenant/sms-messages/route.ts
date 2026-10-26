import { NextRequest, NextResponse } from 'next/server'
import { getTenantSession } from '@/lib/db/tenant'
import { requireTenantAdmin } from '@/lib/db/tenant-authorization'
import { getTenantSmsMessages, sendManualTenantSms } from '@/lib/db/tenant-sms'
import { getTenantSecretConfigurationError } from '@/lib/db/tenant-secrets'

export async function GET(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view SMS delivery history.' }, { status: 401 })
  const status = request.nextUrl.searchParams.get('status') || 'all'
  if (!['all', 'queued', 'pending', 'delivered', 'failed'].includes(status)) {
    return NextResponse.json({ error: 'Choose a valid SMS status filter.' }, { status: 400 })
  }
  const requestedOffset = Number(request.nextUrl.searchParams.get('offset') || '0')
  if (!Number.isSafeInteger(requestedOffset) || requestedOffset < 0 || requestedOffset > 1_000_000) {
    return NextResponse.json({ error: 'SMS history page is invalid.' }, { status: 400 })
  }
  try {
    const result = await getTenantSmsMessages(session.tenantId, status, requestedOffset, 50)
    return NextResponse.json({ ...result, offset: requestedOffset, limit: 50 }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load SMS delivery history', { tenantId: session.tenantId, error })
    return NextResponse.json({ error: getTenantSecretConfigurationError(error) || 'Unable to load SMS delivery history.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireTenantAdmin(request)
  if (access.response) return access.response
  let input: { phone?: unknown; message?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Enter a recipient and message.' }, { status: 400 })
  }
  if (typeof input.phone !== 'string' || typeof input.message !== 'string') {
    return NextResponse.json({ error: 'Enter a recipient and message.' }, { status: 400 })
  }
  try {
    const result = await sendManualTenantSms(access.session.tenantId, input.phone, input.message)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.httpStatus })
    return NextResponse.json({ status: result.status, message: 'SMS message submitted.' }, { status: 201 })
  } catch (error) {
    console.error('Failed to send manual tenant SMS', { tenantId: access.session.tenantId, error })
    return NextResponse.json({ error: 'Unable to submit this SMS message.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
