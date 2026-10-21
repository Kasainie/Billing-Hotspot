import { createHash } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  passkeyMobileHandoffs,
  tenantMemberships,
  tenantSessions,
  tenants,
} from '@/lib/db/schema'
import { createSessionToken, hashSessionToken, SESSION_DURATION_SECONDS, sessionCookieOptions } from '@/lib/db/tenant'

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 })
  }

  let input: { token?: unknown; codeVerifier?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Passkey handoff token is invalid or expired.' }, { status: 400 })
  }
  if (typeof input.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.token) ||
      typeof input.codeVerifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.codeVerifier)) {
    return NextResponse.json({ error: 'Passkey handoff token is invalid or expired.' }, { status: 400 })
  }

  try {
    const tokenHash = createHash('sha256').update(input.token).digest('hex')
    const codeChallenge = createHash('sha256').update(input.codeVerifier).digest('base64url')
    const sessionToken = createSessionToken()
    const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000)
    const result = await db.transaction(async (tx) => {
      const [handoff] = await tx.delete(passkeyMobileHandoffs)
        .where(and(
          eq(passkeyMobileHandoffs.tokenHash, tokenHash),
          eq(passkeyMobileHandoffs.codeChallenge, codeChallenge),
          gt(passkeyMobileHandoffs.expiresAt, new Date()),
        ))
        .returning({
          userId: passkeyMobileHandoffs.userId,
          tenantId: passkeyMobileHandoffs.tenantId,
        })
      if (!handoff) return null

      const [membership] = await tx.select({
        tenantId: tenantMemberships.tenantId,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
      }).from(tenantMemberships)
        .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
        .where(and(
          eq(tenantMemberships.userId, handoff.userId),
          eq(tenantMemberships.tenantId, handoff.tenantId),
          eq(tenants.status, 'active'),
        ))
        .limit(1)
      if (!membership) return null

      const oldToken = request.cookies.get('billing_session')?.value
      if (oldToken && /^[A-Za-z0-9_-]{43}$/.test(oldToken)) {
        await tx.delete(tenantSessions).where(eq(tenantSessions.tokenHash, hashSessionToken(oldToken)))
      }
      await tx.insert(tenantSessions).values({
        tokenHash: sessionToken.tokenHash,
        userId: handoff.userId,
        tenantId: handoff.tenantId,
        expiresAt,
      })
      return membership
    })

    if (!result) {
      return NextResponse.json({ error: 'Passkey handoff token is invalid or expired.' }, { status: 401 })
    }

    const response = NextResponse.json({ authenticated: true, tenant: result })
    response.cookies.set('billing_session', sessionToken.token, sessionCookieOptions())
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('Failed to exchange mobile passkey handoff', error)
    return NextResponse.json({ error: 'Unable to complete passkey sign-in. Please try again.' }, { status: 503 })
  }
}
