import { randomInt, timingSafeEqual } from 'node:crypto'
import { createHash } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminActionConfirmationCodes, tenantMemberships, tenantUsers } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'
import { getEmailConfiguration, sendEmail } from '@/lib/email'

export const sensitiveAdminActions = new Set(['rename_site', 'delete_site', 'rename_router', 'delete_router'])

export function canonicalConfirmationPayload(payload: unknown) {
  return JSON.stringify(payload ?? {})
}

export function isSensitiveAdminMutation(pathname: string, method: string) {
  const upperMethod = method.toUpperCase()
  if (pathname === '/api/sites' && ['PATCH', 'DELETE'].includes(upperMethod)) return true
  if (/^\/api\/routers\/[^/]+\/monitoring$/.test(pathname) && ['PATCH', 'DELETE'].includes(upperMethod)) return true
  return false
}

export async function getOwnerForTenant(request: NextRequest, tenantId: string) {
  const [owner] = await db.select({ id: tenantUsers.id, name: tenantUsers.name, email: tenantUsers.email })
    .from(tenantMemberships)
    .innerJoin(tenantUsers, eq(tenantUsers.id, tenantMemberships.userId))
    .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.role, 'owner')))
    .limit(1)
  if (owner) return owner

  const session = await getTenantSession(request)
  if (!session || session.tenantId !== tenantId) return null
  const [fallback] = await db.select({ id: tenantUsers.id, name: tenantUsers.name, email: tenantUsers.email })
    .from(tenantUsers)
    .where(eq(tenantUsers.id, session.userId))
    .limit(1)
  return fallback ?? null
}

export async function requestAdminActionConfirmation(
  request: NextRequest,
  action: string,
  recordId: string,
  payload: unknown,
) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to manage this workspace.' }, { status: 401 })
  if (!sensitiveAdminActions.has(action) || !recordId) {
    return NextResponse.json({ error: 'Invalid confirmation action.' }, { status: 400 })
  }
  const mail = getEmailConfiguration()
  if (!mail) return NextResponse.json({ error: 'Owner confirmation email is not configured.' }, { status: 503 })
  const owner = await getOwnerForTenant(request, session.tenantId)
  if (!owner) return NextResponse.json({ error: 'This workspace has no owner email configured.' }, { status: 409 })

  const now = new Date()
  const code = String(randomInt(100000, 1000000))
  const payloadHash = createHash('sha256').update(canonicalConfirmationPayload(payload)).digest('hex')
  const codeHash = createHash('sha256').update(`${session.tenantId}:${action}:${recordId}:${code}`).digest('hex')

  await db.delete(adminActionConfirmationCodes).where(and(
    eq(adminActionConfirmationCodes.tenantId, session.tenantId),
    eq(adminActionConfirmationCodes.action, action),
    eq(adminActionConfirmationCodes.recordId, recordId),
  ))
  await db.insert(adminActionConfirmationCodes).values({
    tenantId: session.tenantId,
    ownerUserId: owner.id,
    action,
    recordId,
    payloadHash,
    codeHash,
    attempts: 0,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
  })

  const actionLabel = action.replaceAll('_', ' ')
  const sent = await sendEmail(mail, {
    to: [owner.email],
    subject: `Confirm ${actionLabel}`,
    html: `<p>Hello ${owner.name},</p><p>Use this code to confirm <strong>${actionLabel}</strong> for record ${recordId}:</p><p style="font-size:28px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes and can be used once. If you did not request this change, ignore it.</p>`,
    text: `Hello ${owner.name},\n\nYour LKTECH confirmation code for ${actionLabel} is ${code}.\n\nThis code expires in 10 minutes. Record: ${recordId}`,
  })
  if (!sent) return NextResponse.json({ error: 'Unable to send the owner confirmation email.' }, { status: 503 })
  return NextResponse.json({ message: 'A confirmation code was sent to the workspace owner.', ownerEmail: owner.email })
}

export async function requireAdminActionConfirmation(
  request: NextRequest,
  action: string,
  recordId: string,
  payload: unknown,
) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to manage this workspace.' }, { status: 401 })
  const code = request.headers.get('x-admin-email-confirmation')?.trim() || ''
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the owner confirmation code sent by email.', code: 'email_confirmation_required' }, { status: 428 })
  }
  const now = new Date()
  const payloadHash = createHash('sha256').update(canonicalConfirmationPayload(payload)).digest('hex')
  const [confirmation] = await db.select().from(adminActionConfirmationCodes).where(and(
    eq(adminActionConfirmationCodes.tenantId, session.tenantId),
    eq(adminActionConfirmationCodes.action, action),
    eq(adminActionConfirmationCodes.recordId, recordId),
    gt(adminActionConfirmationCodes.expiresAt, now),
    eq(adminActionConfirmationCodes.payloadHash, payloadHash),
  )).limit(1).for('update')
  if (!confirmation || confirmation.attempts >= 5) {
    return NextResponse.json({ error: 'The owner confirmation code is invalid or expired.', code: 'email_confirmation_invalid' }, { status: 403 })
  }
  const expected = createHash('sha256').update(`${session.tenantId}:${action}:${recordId}:${code}`).digest('hex')
  const matches = confirmation.codeHash.length === expected.length && timingSafeEqual(Buffer.from(confirmation.codeHash), Buffer.from(expected))
  if (!matches) {
    await db.update(adminActionConfirmationCodes).set({ attempts: confirmation.attempts + 1 })
      .where(eq(adminActionConfirmationCodes.id, confirmation.id))
    return NextResponse.json({ error: 'The owner confirmation code is invalid.', code: 'email_confirmation_invalid' }, { status: 403 })
  }
  await db.delete(adminActionConfirmationCodes).where(eq(adminActionConfirmationCodes.id, confirmation.id))
  return null
}
