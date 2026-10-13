import { randomInt } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { emailVerificationCodes, tenantUsers } from '@/lib/db/schema'
import { hashSessionToken } from '@/lib/db/tenant'
import { escapeEmailHtml, sendEmail, type EmailConfiguration } from '@/lib/email'

const codeDurationMs = 10 * 60 * 1000
const requestCooldownMs = 60 * 1000

export function hashVerificationCode(userId: string, code: string) {
  return hashSessionToken(`email-verification:${userId}:${code}`)
}

export async function deliverSignupVerificationCode(email: string, name: string, code: string, mail: EmailConfiguration) {
  const safeName = escapeEmailHtml(name)
  const sent = await sendEmail(mail, {
    to: [email],
    subject: 'Verify your LKTECH account',
    html: `<p>Hello ${safeName},</p><p>Use this code to verify your LKTECH account:</p><p style="font-size:28px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes. If you did not create this account, you can ignore this email.</p>`,
    text: `Hello ${name},\n\nYour LKTECH verification code is ${code}.\n\nThis code expires in 10 minutes. If you did not create this account, you can ignore this email.`,
  })
  if (!sent) throw new Error('Resend could not deliver the verification email.')
}

export async function sendSignupVerificationCode(email: string, mail: EmailConfiguration) {
  const [user] = await db.select({ id: tenantUsers.id, name: tenantUsers.name })
    .from(tenantUsers)
    .where(and(eq(tenantUsers.email, email), eq(tenantUsers.emailVerified, false), sql`${tenantUsers.passwordHash} is not null`))
    .limit(1)

  if (!user) return

  const now = new Date()
  const code = String(randomInt(100_000, 1_000_000))
  const expiresAt = new Date(now.getTime() + codeDurationMs)
  const codeHash = hashVerificationCode(user.id, code)
  const [issuedCode] = await db.insert(emailVerificationCodes).values({
    userId: user.id,
    codeHash,
    expiresAt,
    createdAt: now,
    attempts: 0,
  }).onConflictDoUpdate({
    target: emailVerificationCodes.userId,
    set: { codeHash: hashVerificationCode(user.id, code), expiresAt, createdAt: now, attempts: 0 },
    setWhere: sql`${emailVerificationCodes.createdAt} <= ${new Date(now.getTime() - requestCooldownMs)}`,
  }).returning({ userId: emailVerificationCodes.userId })
  if (!issuedCode) return

  try {
    await deliverSignupVerificationCode(email, user.name, code, mail)
  } catch (error) {
    await db.delete(emailVerificationCodes).where(and(
      eq(emailVerificationCodes.userId, user.id),
      eq(emailVerificationCodes.codeHash, codeHash),
    ))
    throw error
  }
}
