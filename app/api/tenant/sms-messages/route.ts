import { NextRequest, NextResponse } from 'next/server'
import { getTenantSession } from '@/lib/db/tenant'
import { getTenantSmsMessages } from '@/lib/db/tenant-sms'

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
    return NextResponse.json({ error: 'Unable to load SMS delivery history.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
