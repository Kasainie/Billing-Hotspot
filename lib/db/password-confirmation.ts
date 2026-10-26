import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantUsers } from '@/lib/db/schema'
import { verifyPassword } from '@/lib/db/tenant'

export async function requirePasswordConfirmation(request: NextRequest, userId: string) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return null

  const password = request.headers.get('x-admin-password-confirmation')
  if (!password || password.length > 128) {
    return NextResponse.json({
      error: 'Enter your account password to confirm this change.',
      code: 'password_confirmation_required',
    }, { status: 428 })
  }

  try {
    const [user] = await db.select({ passwordHash: tenantUsers.passwordHash })
      .from(tenantUsers)
      .where(eq(tenantUsers.id, userId))
      .limit(1)
    if (!user?.passwordHash) {
      return NextResponse.json({
        error: 'This account has no password set. Use the Forgot password link to create one before making changes.',
        code: 'password_setup_required',
      }, { status: 409 })
    }
    if (!await verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({
        error: 'The account password is incorrect. No changes were made.',
        code: 'password_confirmation_invalid',
      }, { status: 403 })
    }
    return null
  } catch (error) {
    console.error('Failed to verify password confirmation', error)
    return NextResponse.json({ error: 'Unable to verify your password. No changes were made.' }, { status: 503 })
  }
}
