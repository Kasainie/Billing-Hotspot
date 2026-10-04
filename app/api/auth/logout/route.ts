import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantSessions } from '@/lib/db/schema'
import { hashSessionToken } from '@/lib/db/tenant'

export async function POST(request: NextRequest) {
  const token = request.cookies.get('billing_session')?.value
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token) && process.env.DATABASE_URL?.trim()) {
    try {
      await db.delete(tenantSessions).where(eq(tenantSessions.tokenHash, hashSessionToken(token)))
    } catch (error) {
      console.error('Failed to revoke tenant session', error)
      return NextResponse.json({ error: 'Unable to end the session right now.' }, { status: 503 })
    }
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.set('billing_session', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
  return response
}
