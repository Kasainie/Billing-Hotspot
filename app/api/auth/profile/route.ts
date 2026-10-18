import { and, eq, ne } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantSessions, tenantUsers } from '@/lib/db/schema'
import { getTenantSession, hashPassword, verifyPassword } from '@/lib/db/tenant'
import { getPasswordValidationErrors } from '@/lib/password-policy'

export async function PATCH(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to update your profile.' }, { status: 401 })
  let input: { name?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Profile details must be valid JSON.' }, { status: 400 })
  }
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length < 2 || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) {
    return NextResponse.json({ error: 'Name must be between 2 and 120 characters.' }, { status: 400 })
  }
  try {
    await db.update(tenantUsers).set({ name }).where(eq(tenantUsers.id, session.userId))
    return NextResponse.json({ name })
  } catch (error) {
    console.error('Failed to update account profile', error)
    return NextResponse.json({ error: 'Unable to update your profile.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to change your password.' }, { status: 401 })
  let input: { currentPassword?: unknown; newPassword?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Password details must be valid JSON.' }, { status: 400 })
  }
  const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : ''
  const newPassword = typeof input.newPassword === 'string' ? input.newPassword : ''
  const errors = getPasswordValidationErrors(newPassword)
  if (errors.length) return NextResponse.json({ error: `New password must have ${errors.join(', ').toLowerCase()}.` }, { status: 400 })

  try {
    const [user] = await db.select({ passwordHash: tenantUsers.passwordHash })
      .from(tenantUsers)
      .where(eq(tenantUsers.id, session.userId))
      .limit(1)
    if (!user?.passwordHash) {
      return NextResponse.json({ error: 'This account uses external sign-in and does not have a local password to change.' }, { status: 409 })
    }
    if (!await verifyPassword(currentPassword, user.passwordHash)) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 })
    }
    const passwordHash = await hashPassword(newPassword)
    await db.transaction(async (tx) => {
      await tx.update(tenantUsers).set({ passwordHash }).where(eq(tenantUsers.id, session.userId))
      await tx.delete(tenantSessions).where(and(
        eq(tenantSessions.userId, session.userId),
        ne(tenantSessions.tokenHash, session.tokenHash),
      ))
    })
    return NextResponse.json({ message: 'Password changed. Other active sessions were signed out.' })
  } catch (error) {
    console.error('Failed to change account password', error)
    return NextResponse.json({ error: 'Unable to change your password.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
