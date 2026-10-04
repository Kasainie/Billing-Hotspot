import { timingSafeEqual } from 'node:crypto'
import { and, eq, inArray, isNotNull, lte } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { customers } from '@/lib/db/schema'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET || ''
  const authorization = request.headers.get('authorization') || ''
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) return NextResponse.json({ error: 'CRON_SECRET must be configured with at least 32 URL-safe characters.' }, { status: 503 })
  const matches = timingSafeEqual(
    Buffer.from(supplied.padEnd(secret.length).slice(0, secret.length)),
    Buffer.from(secret),
  ) && supplied.length === secret.length
  if (!matches) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  try {
    const now = new Date()
    const expired = await db.select({ id: customers.id }).from(customers).where(and(
      eq(customers.status, 'active'),
      isNotNull(customers.expiresAt),
      lte(customers.expiresAt, now),
    )).limit(1000)
    if (expired.length) {
      await db.update(customers).set({ status: 'expired' }).where(and(
        inArray(customers.id, expired.map((customer) => customer.id)),
        eq(customers.status, 'active'),
        isNotNull(customers.expiresAt),
        lte(customers.expiresAt, now),
      ))
    }
    return NextResponse.json({ expired: expired.length, checkedAt: now.toISOString() })
  } catch (error) {
    console.error('Failed to expire customer accounts', error)
    return NextResponse.json({ error: 'Unable to update expired subscribers.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
