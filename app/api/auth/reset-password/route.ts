import { and, eq, gt } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { passwordResetTokens, tenantSessions, tenantUsers } from '@/lib/db/schema'
import { hashPassword, hashSessionToken } from '@/lib/db/tenant'
import { getPasswordValidationErrors } from '@/lib/password-policy'

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json({ error: 'Password reset is temporarily unavailable.' }, { status: 503 })
  }

  let input: { token?: unknown; password?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'This reset link is invalid or has expired. Request a new one.' }, { status: 400 })
  }
  const token = typeof input.token === 'string' ? input.token : ''
  const password = typeof input.password === 'string' ? input.password : ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired. Request a new one.' }, { status: 400 })
  }
  const passwordErrors = getPasswordValidationErrors(password)
  if (passwordErrors.length) {
    return NextResponse.json({ error: `Password must have ${passwordErrors.join(', ').toLowerCase()}.` }, { status: 400 })
  }

  try {
    const passwordHash = await hashPassword(password)
    const tokenHash = hashSessionToken(token)
    const result = await db.transaction(async (tx) => {
      const [reset] = await tx.select({ userId: passwordResetTokens.userId })
        .from(passwordResetTokens)
        .where(and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          gt(passwordResetTokens.expiresAt, new Date()),
        ))
        .limit(1)
      if (!reset) return false

      await tx.update(tenantUsers).set({ passwordHash }).where(eq(tenantUsers.id, reset.userId))
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, reset.userId))
      await tx.delete(tenantSessions).where(eq(tenantSessions.userId, reset.userId))
      return true
    })
    if (!result) {
      return NextResponse.json({ error: 'This reset link is invalid or has expired. Request a new one.' }, { status: 400 })
    }
    return NextResponse.json({ message: 'Your password has been reset. You can now sign in.' })
  } catch (error) {
    console.error('Failed to reset tenant user password', error)
    return NextResponse.json({ error: 'Unable to reset your password right now. Please try again.' }, { status: 503 })
  }
}
