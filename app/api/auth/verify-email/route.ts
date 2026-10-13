import { timingSafeEqual } from 'node:crypto'
import { and, eq, gt, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emailVerificationCodes, tenantMemberships, tenantSessions, tenantUsers, tenants } from '@/lib/db/schema'
import { createSessionToken, SESSION_DURATION_SECONDS, sessionCookieOptions } from '@/lib/db/tenant'
import { getEmailConfiguration } from '@/lib/email'
import { hashVerificationCode, sendSignupVerificationCode } from '@/lib/email-verification'

const maximumAttempts = 5
const genericResendMessage = 'If your account is awaiting verification, check your inbox. New codes can be requested once per minute.'

function matchesCode(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, 'hex')
  const actualBuffer = Buffer.from(actual, 'hex')
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json({ error: 'Email verification is temporarily unavailable.' }, { status: 503 })
  }

  let input: { email?: unknown; code?: unknown; action?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Enter your email and the six-digit verification code.' }, { status: 400 })
  }
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  if (input.action === 'resend') {
    const mail = getEmailConfiguration()
    if (!mail) {
      console.error('Signup verification email is not configured; set RESEND_API_KEY and PASSWORD_RESET_FROM')
      return NextResponse.json({ error: 'Verification email is not configured yet. Contact your administrator.' }, { status: 503 })
    }
    try {
      await sendSignupVerificationCode(email, mail)
      return NextResponse.json({ message: genericResendMessage })
    } catch (error) {
      console.error('Failed to resend signup verification code', error)
      return NextResponse.json({ error: 'Unable to send a verification code right now. Please try again later.' }, { status: 503 })
    }
  }

  const code = typeof input.code === 'string' ? input.code : ''
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the six-digit verification code from your email.' }, { status: 400 })
  }

  const { token, tokenHash } = createSessionToken()
  const now = new Date()
  try {
    const result = await db.transaction(async (tx) => {
      const [user] = await tx.select({ id: tenantUsers.id, name: tenantUsers.name, email: tenantUsers.email })
        .from(tenantUsers)
        .where(and(eq(tenantUsers.email, email), eq(tenantUsers.emailVerified, false)))
        .limit(1)
        .for('update')
      if (!user) return { error: 'That verification code is invalid or has expired.' } as const

      const [verification] = await tx.select({
        codeHash: emailVerificationCodes.codeHash,
        attempts: emailVerificationCodes.attempts,
      }).from(emailVerificationCodes)
        .where(and(
          eq(emailVerificationCodes.userId, user.id),
          gt(emailVerificationCodes.expiresAt, now),
        ))
        .limit(1)
        .for('update')
      if (!verification) return { error: 'That verification code is invalid or has expired.' } as const
      if (verification.attempts >= maximumAttempts) {
        return { error: 'Too many incorrect attempts. Request a new verification code.' } as const
      }

      const expectedHash = hashVerificationCode(user.id, code)
      if (!matchesCode(verification.codeHash, expectedHash)) {
        await tx.update(emailVerificationCodes)
          .set({ attempts: sql`${emailVerificationCodes.attempts} + 1` })
          .where(eq(emailVerificationCodes.userId, user.id))
        return { error: 'That verification code is invalid or has expired.' } as const
      }

      const [membership] = await tx.select({
        tenantId: tenantMemberships.tenantId,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
      }).from(tenantMemberships)
        .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
        .where(and(eq(tenantMemberships.userId, user.id), eq(tenants.status, 'active')))
        .orderBy(tenants.createdAt)
        .limit(1)
      if (!membership) return { error: 'This account has no active workspace.' } as const

      const expiresAt = new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000)
      await tx.update(tenantUsers).set({ emailVerified: true }).where(eq(tenantUsers.id, user.id))
      await tx.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, user.id))
      await tx.insert(tenantSessions).values({ tokenHash, userId: user.id, tenantId: membership.tenantId, expiresAt })
      return {
        user: { id: user.id, name: user.name, email: user.email },
        tenant: { id: membership.tenantId, name: membership.tenantName, slug: membership.tenantSlug },
      } as const
    })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })

    const response = NextResponse.json(result)
    response.cookies.set('billing_session', token, sessionCookieOptions())
    return response
  } catch (error) {
    console.error('Failed to verify signup email', error)
    return NextResponse.json({ error: 'Unable to verify the email right now. Please try again.' }, { status: 503 })
  }
}
