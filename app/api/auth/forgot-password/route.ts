import { randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { passwordResetTokens, tenantUsers } from '@/lib/db/schema'
import { hashSessionToken } from '@/lib/db/tenant'

const resetTokenDurationMs = 30 * 60 * 1000
const requestCooldownMs = 60 * 1000
const genericMessage = 'If an account exists for that email, a password reset link will be sent shortly.'

function getMailConfiguration(requestUrl: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.PASSWORD_RESET_FROM?.trim()
  const configuredAppUrl = process.env.APP_URL?.trim()
  if (!apiKey || !from || !configuredAppUrl) return null

  let parsedUrl: URL
  try {
    const requestOrigin = new URL(requestUrl)
    const localDevelopment = process.env.NODE_ENV === 'development' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(requestOrigin.hostname)
    parsedUrl = new URL(localDevelopment ? requestOrigin.origin : configuredAppUrl)
  } catch {
    return null
  }
  const localDevelopment = process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname)
  if ((parsedUrl.protocol !== 'https:' && !(localDevelopment && parsedUrl.protocol === 'http:')) ||
      parsedUrl.username || parsedUrl.password || parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash) {
    return null
  }

  return { apiKey, from, origin: parsedUrl.origin }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json({ error: 'Password reset is temporarily unavailable.' }, { status: 503 })
  }
  const mail = getMailConfiguration(request.url)
  if (!mail) {
    console.error('Password reset email is not configured; set RESEND_API_KEY, PASSWORD_RESET_FROM, and APP_URL')
    return NextResponse.json({ error: 'Password reset email is not configured yet. Contact your administrator.' }, { status: 503 })
  }

  let input: { email?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  let issuedTokenHash: string | null = null
  try {
    const [user] = await db.select({ id: tenantUsers.id, name: tenantUsers.name })
      .from(tenantUsers).where(eq(tenantUsers.email, email)).limit(1)
    if (!user) return NextResponse.json({ message: genericMessage })

    const token = randomBytes(32).toString('base64url')
    const tokenHash = hashSessionToken(token)
    issuedTokenHash = tokenHash
    const now = new Date()
    const expiresAt = new Date(now.getTime() + resetTokenDurationMs)
    const shouldSend = await db.transaction(async (tx) => {
      const [existing] = await tx.select({ createdAt: passwordResetTokens.createdAt })
        .from(passwordResetTokens)
        .where(and(
          eq(passwordResetTokens.userId, user.id),
          gt(passwordResetTokens.expiresAt, now),
        ))
        .limit(1)
      if (existing && now.getTime() - existing.createdAt.getTime() < requestCooldownMs) return false

      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id))
      await tx.insert(passwordResetTokens).values({ tokenHash, userId: user.id, expiresAt })
      return true
    })
    if (!shouldSend) return NextResponse.json({ message: genericMessage })

    const resetUrl = new URL('/reset-password', mail.origin)
    resetUrl.searchParams.set('token', token)
    const name = escapeHtml(user.name)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${mail.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: mail.from,
        to: [email],
        subject: 'Reset your LKTECH password',
        html: `<p>Hello ${name},</p><p>We received a request to reset your LKTECH password.</p><p><a href="${resetUrl.toString()}">Reset your password</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>`,
        text: `Hello ${user.name},\n\nWe received a request to reset your LKTECH password.\n\nReset your password: ${resetUrl.toString()}\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this email.`,
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      console.error('Resend rejected password reset email', { status: response.status })
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash))
      return NextResponse.json({ error: 'Unable to send a password reset email right now. Please try again later.' }, { status: 503 })
    }
    return NextResponse.json({ message: genericMessage })
  } catch (error) {
    console.error('Failed to request a password reset', error)
    if (issuedTokenHash) {
      try {
        await db.delete(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, issuedTokenHash))
      } catch (cleanupError) {
        console.error('Failed to remove an unsent password reset token', cleanupError)
      }
    }
    return NextResponse.json({ error: 'Unable to request a password reset right now.' }, { status: 503 })
  }
}
