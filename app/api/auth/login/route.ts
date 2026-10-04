import { and, eq, lt } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantMemberships, tenantSessions, tenantUsers, tenants } from '@/lib/db/schema'
import { createSessionToken, hashSessionToken, SESSION_DURATION_SECONDS, sessionCookieOptions, verifyPassword } from '@/lib/db/tenant'

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ error: 'Sign in requires a configured database.' }, { status: 503 })

  let input: { email?: unknown; password?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 })
  }
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const password = typeof input.password === 'string' ? input.password : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 1 || password.length > 128) {
    return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 })
  }

  try {
    const [user] = await db.select().from(tenantUsers).where(eq(tenantUsers.email, email)).limit(1)
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 })
    }
    const [membership] = await db.select({
      tenantId: tenantMemberships.tenantId,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
    }).from(tenantMemberships)
      .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
      .where(and(eq(tenantMemberships.userId, user.id), eq(tenants.status, 'active')))
      .orderBy(tenants.createdAt)
      .limit(1)
    if (!membership) return NextResponse.json({ error: 'This account has no active workspace.' }, { status: 403 })

    const { token, tokenHash } = createSessionToken()
    const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000)
    await db.transaction(async (tx) => {
      const oldToken = request.cookies.get('billing_session')?.value
      if (oldToken && /^[A-Za-z0-9_-]{43}$/.test(oldToken)) {
        await tx.delete(tenantSessions).where(eq(tenantSessions.tokenHash, hashSessionToken(oldToken)))
      }
      await tx.insert(tenantSessions).values({ tokenHash, userId: user.id, tenantId: membership.tenantId, expiresAt })
      await tx.delete(tenantSessions).where(lt(tenantSessions.expiresAt, new Date()))
    })

    const response = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      tenant: { id: membership.tenantId, name: membership.tenantName, slug: membership.tenantSlug },
    })
    response.cookies.set('billing_session', token, sessionCookieOptions())
    return response
  } catch (error) {
    console.error('Failed to sign in tenant user', error)
    return NextResponse.json({ error: 'Unable to sign in right now.' }, { status: 503 })
  }
}
