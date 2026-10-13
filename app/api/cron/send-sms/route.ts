import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { processQueuedTenantSms } from '@/lib/db/tenant-sms'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET || ''
  const authorization = request.headers.get('authorization') || ''
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
    return NextResponse.json({ error: 'CRON_SECRET must be configured with at least 32 URL-safe characters.' }, { status: 503 })
  }
  const matches = timingSafeEqual(
    Buffer.from(supplied.padEnd(secret.length).slice(0, secret.length)),
    Buffer.from(secret),
  ) && supplied.length === secret.length
  if (!matches) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  try {
    await processQueuedTenantSms()
    return NextResponse.json({ processedAt: new Date().toISOString() })
  } catch (error) {
    console.error('Failed to process queued SMS notifications', error)
    return NextResponse.json({ error: 'Unable to process queued SMS notifications.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
