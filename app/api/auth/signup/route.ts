import { randomInt, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emailVerificationCodes, tenantMemberships, tenantUsers, tenants } from '@/lib/db/schema'
import { hashPassword, hashSessionToken } from '@/lib/db/tenant'
import { getPasswordValidationErrors } from '@/lib/password-policy'
import { getEmailConfiguration } from '@/lib/email'
import { deliverSignupVerificationCode, hashVerificationCode, sendSignupVerificationCode } from '@/lib/email-verification'

const verificationCodeDurationMs = 10 * 60 * 1000

function getDatabaseErrorCode(error: unknown) {
  let current = error
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== 'object') return undefined
    if ('code' in current && typeof current.code === 'string') return current.code
    current = 'cause' in current ? current.cause : undefined
  }
  return undefined
}

function getDatabaseErrorConstraint(error: unknown) {
  let current = error
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== 'object') return undefined
    if ('constraint' in current && typeof current.constraint === 'string') return current.constraint
    current = 'cause' in current ? current.cause : undefined
  }
  return undefined
}

function slugify(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63)
}

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ error: 'Account creation requires a configured database.' }, { status: 503 })

  let input: { name?: unknown; email?: unknown; password?: unknown; tenantName?: unknown; tenantSlug?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Enter your account and workspace details.' }, { status: 400 })
  }

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const password = typeof input.password === 'string' ? input.password : ''
  const tenantName = typeof input.tenantName === 'string' && input.tenantName.trim()
    ? input.tenantName.trim()
    : `${name}'s ISP workspace`.slice(0, 80)
  const slug = slugify(typeof input.tenantSlug === 'string' && input.tenantSlug.trim() ? input.tenantSlug : tenantName)
  const passwordErrors = getPasswordValidationErrors(password)
  if (passwordErrors.length) {
    return NextResponse.json({ error: `Password must have ${passwordErrors.join(', ').toLowerCase()}.` }, { status: 400 })
  }
  if (name.length < 2 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      tenantName.length < 2 || tenantName.length > 80 ||
      !slug || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    return NextResponse.json({ error: 'Provide a valid name, email, workspace name, and workspace slug.' }, { status: 400 })
  }

  const mail = getEmailConfiguration()
  if (!mail) {
    console.error('Signup verification email is not configured; set RESEND_API_KEY and PASSWORD_RESET_FROM')
    return NextResponse.json({ error: 'Email verification is not configured yet. Contact your administrator.' }, { status: 503 })
  }

  const verificationCode = String(randomInt(100_000, 1_000_000))
  const verificationExpiresAt = new Date(Date.now() + verificationCodeDurationMs)
  let accountCreated = false
  let createdUserId = ''
  try {
    const passwordHash = await hashPassword(password)
    const userId = randomUUID()
    createdUserId = userId
    const claimDefaultWorkspace = process.env.DEFAULT_TENANT_OWNER_EMAIL?.trim().toLowerCase() === email
    const tenantId = claimDefaultWorkspace ? 'default' : randomUUID()
    const workspace = await db.transaction(async (tx) => {
      await tx.insert(tenantUsers).values({ id: userId, name, email, passwordHash, emailVerified: false })
      let createdWorkspace: { id: string; name: string; slug: string }
      if (claimDefaultWorkspace) {
        const [defaultWorkspace] = await tx.select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
          .from(tenants).where(eq(tenants.id, tenantId)).limit(1)
        if (!defaultWorkspace) throw new Error('The default workspace has not been created. Apply the tenant migration first.')
        createdWorkspace = defaultWorkspace
      } else {
        await tx.insert(tenants).values({ id: tenantId, name: tenantName, slug })
        createdWorkspace = { id: tenantId, name: tenantName, slug }
      }
      await tx.insert(tenantMemberships).values({ tenantId, userId, role: 'owner' })
      await tx.insert(emailVerificationCodes).values({
        userId,
        codeHash: hashVerificationCode(userId, verificationCode),
        expiresAt: verificationExpiresAt,
      })
      return createdWorkspace
    })
    accountCreated = true
    try {
      await deliverSignupVerificationCode(email, name, verificationCode, mail)
    } catch (error) {
      await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, userId))
      throw error
    }
    return NextResponse.json({ user: { id: userId, name, email }, tenant: workspace, verificationRequired: true }, { status: 201 })
  } catch (error) {
    if (getDatabaseErrorCode(error) === '23505') {
      const [existingUser] = await db.select({ email: tenantUsers.email, emailVerified: tenantUsers.emailVerified, passwordHash: tenantUsers.passwordHash })
        .from(tenantUsers).where(eq(tenantUsers.email, email)).limit(1)
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `Signup unique conflict: ${existingUser ? 'email' : 'workspace_slug'}; ` +
          `constraint=${getDatabaseErrorConstraint(error) ?? 'unknown'}; ` +
          `emailVerified=${existingUser?.emailVerified ?? 'unknown'}; ` +
          `hasPassword=${Boolean(existingUser?.passwordHash)}`,
        )
      }
      if (existingUser) {
        if (!existingUser.emailVerified && existingUser.passwordHash) {
          try {
            await sendSignupVerificationCode(email, mail)
            return NextResponse.json({ verificationRequired: true, user: { email } }, { status: 202 })
          } catch (mailError) {
            console.error('Failed to resend signup verification email', mailError)
            return NextResponse.json({
              error: 'This account still needs email verification. Request a new code to continue.',
              verificationRequired: true,
              user: { email },
            }, { status: 503 })
          }
        }
        const diagnostic = process.env.NODE_ENV === 'development'
          ? `Signup diagnostic: matching account found (verified=${existingUser.emailVerified}, password=${Boolean(existingUser.passwordHash)}).`
          : undefined
        return NextResponse.json({
          error: 'An account with this email already exists. Sign in or reset your password.',
          ...(diagnostic ? { diagnostic } : {}),
        }, { status: 409 })
      }
      return NextResponse.json({ error: 'That workspace name is already taken. Choose a different name.' }, { status: 409 })
    }
    console.error('Failed to create tenant account', error)
    if (accountCreated) {
      if (createdUserId) {
        try {
          await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, createdUserId))
        } catch (cleanupError) {
          console.error('Failed to remove an unsent signup verification code', cleanupError)
        }
      }
      return NextResponse.json({
        error: 'Your account is ready for verification, but we could not send the email. Request a new code to try again.',
        verificationRequired: true,
        user: { email },
      }, { status: 503 })
    }
    const databaseCode = getDatabaseErrorCode(error)
    const diagnostic = process.env.NODE_ENV === 'development' && databaseCode
      ? `Database error ${databaseCode}`
      : undefined
    return NextResponse.json({
      error: 'Unable to create the account right now.',
      ...(diagnostic ? { diagnostic } : {}),
    }, { status: 503 })
  }
}
