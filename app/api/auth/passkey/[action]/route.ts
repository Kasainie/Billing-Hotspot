import { randomBytes, createHash } from 'node:crypto'
import { and, eq, gt, isNull, lt } from 'drizzle-orm'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  passkeyChallenges,
  passkeyCredentials,
  passkeyMobileHandoffs,
  tenantMemberships,
  tenantSessions,
  tenantUsers,
  tenants,
} from '@/lib/db/schema'
import { createSessionToken, getTenantSession, hashSessionToken, SESSION_DURATION_SECONDS, sessionCookieOptions } from '@/lib/db/tenant'

const challengeCookie = 'lktech_passkey_challenge'
const challengeLifetimeMs = 5 * 60 * 1000

function getRelyingParty(request: NextRequest) {
  const hostname = request.nextUrl.hostname.toLowerCase()
  const configuredRpId = process.env.PASSKEY_RP_ID?.trim().toLowerCase()
  const rpId = configuredRpId || (hostname === 'lktech.life' || hostname.endsWith('.lktech.life') ? 'lktech.life' : hostname)
  if (!/^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/.test(rpId) ||
      (hostname !== rpId && !hostname.endsWith(`.${rpId}`))) {
    throw new Error('Passkey relying-party domain does not match this host.')
  }
  const origin = request.nextUrl.origin
  if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://')) {
    throw new Error('Passkeys require a secure HTTPS origin.')
  }
  return { rpId, origin }
}

function hashChallengeToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

async function createChallenge(
  request: NextRequest,
  purpose: 'registration' | 'authentication',
  challenge: string,
  userId: string | null,
) {
  const relyingParty = getRelyingParty(request)
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  await db.delete(passkeyChallenges).where(lt(passkeyChallenges.expiresAt, now))
  await db.insert(passkeyChallenges).values({
    challengeHash: hashChallengeToken(token),
    challenge,
    userId,
    purpose,
    origin: relyingParty.origin,
    rpId: relyingParty.rpId,
    expiresAt: new Date(now.getTime() + challengeLifetimeMs),
  })
  return { token, relyingParty }
}

async function consumeChallenge(
  request: NextRequest,
  purpose: 'registration' | 'authentication',
  userId: string | null,
) {
  const token = request.cookies.get(challengeCookie)?.value || ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const origin = request.headers.get('origin')
  const filters = [
    eq(passkeyChallenges.challengeHash, hashChallengeToken(token)),
    eq(passkeyChallenges.purpose, purpose),
    userId ? eq(passkeyChallenges.userId, userId) : isNull(passkeyChallenges.userId),
  ]
  const [challenge] = await db.delete(passkeyChallenges)
    .where(and(...filters, gt(passkeyChallenges.expiresAt, new Date())))
    .returning()
  if (!challenge || !origin || origin !== challenge.origin) return null
  return challenge
}

function clearChallengeCookie(response: NextResponse) {
  response.cookies.set(challengeCookie, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
}

function challengeOptionsResponse(options: unknown, token: string) {
  const response = NextResponse.json({ options })
  response.cookies.set(challengeCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(challengeLifetimeMs / 1000),
  })
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function GET(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params
  if (action !== 'credentials') return NextResponse.json({ error: 'Unknown passkey operation.' }, { status: 404 })
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to manage passkeys.' }, { status: 401 })
  try {
    const credentials = await db.select({
      credentialId: passkeyCredentials.credentialId,
      createdAt: passkeyCredentials.createdAt,
    }).from(passkeyCredentials)
      .where(eq(passkeyCredentials.userId, session.userId))
      .orderBy(passkeyCredentials.createdAt)
    return NextResponse.json({
      credentials: credentials.map(({ credentialId, createdAt }) => ({
        credentialId,
        createdAt: createdAt.toISOString(),
      })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load passkey credentials', error)
    return NextResponse.json({ error: 'Unable to load passkeys.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params
  if (!['register-options', 'register-verify', 'login-options', 'login-verify'].includes(action)) {
    return NextResponse.json({ error: 'Unknown passkey operation.' }, { status: 404 })
  }
  if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ error: 'Passkey sign-in requires a configured database.' }, { status: 503 })

  try {
    if (action === 'register-options') {
      const session = await getTenantSession(request)
      if (!session) return NextResponse.json({ error: 'Sign in before adding a passkey.' }, { status: 401 })
      const [user] = await db.select().from(tenantUsers).where(eq(tenantUsers.id, session.userId)).limit(1)
      if (!user || !user.emailVerified) return NextResponse.json({ error: 'A verified account is required to add a passkey.' }, { status: 403 })
      const relyingParty = getRelyingParty(request)
      const existing = await db.select({
        credentialId: passkeyCredentials.credentialId,
        transports: passkeyCredentials.transports,
      }).from(passkeyCredentials).where(eq(passkeyCredentials.userId, user.id))
      const options = await generateRegistrationOptions({
        rpName: 'LKTECH',
        rpID: relyingParty.rpId,
        userName: user.email,
        userDisplayName: user.name,
        userID: new Uint8Array(Buffer.from(user.id)),
        attestationType: 'none',
        excludeCredentials: existing.map((credential) => ({
          id: credential.credentialId,
          transports: credential.transports,
        })),
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
      })
      const { token } = await createChallenge(request, 'registration', options.challenge, user.id)
      return challengeOptionsResponse(options, token)
    }

    if (action === 'register-verify') {
      const session = await getTenantSession(request)
      if (!session) return NextResponse.json({ error: 'Sign in before adding a passkey.' }, { status: 401 })
      const challenge = await consumeChallenge(request, 'registration', session.userId)
      if (!challenge) {
        const response = NextResponse.json({ error: 'Passkey setup expired. Please try again.' }, { status: 400 })
        clearChallengeCookie(response)
        return response
      }
      let input: { response?: RegistrationResponseJSON }
      try {
        input = await request.json() as typeof input
      } catch {
        const response = NextResponse.json({ error: 'Invalid passkey response.' }, { status: 400 })
        clearChallengeCookie(response)
        return response
      }
      if (!input.response || typeof input.response.id !== 'string') {
        const response = NextResponse.json({ error: 'Invalid passkey response.' }, { status: 400 })
        clearChallengeCookie(response)
        return response
      }
      let verification
      try {
        verification = await verifyRegistrationResponse({
          response: input.response,
          expectedChallenge: challenge.challenge,
          expectedOrigin: challenge.origin,
          expectedRPID: challenge.rpId,
          requireUserVerification: true,
        })
      } catch {
        const response = NextResponse.json({ error: 'Passkey verification failed. Please try again.' }, { status: 400 })
        clearChallengeCookie(response)
        return response
      }
      if (!verification.verified) {
        const response = NextResponse.json({ error: 'Passkey verification failed. Please try again.' }, { status: 400 })
        clearChallengeCookie(response)
        return response
      }
      const { credential } = verification.registrationInfo
      await db.insert(passkeyCredentials).values({
        userId: session.userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: input.response.response.transports || [],
      })
      const response = NextResponse.json({ verified: true })
      clearChallengeCookie(response)
      return response
    }

    if (action === 'login-options') {
      const relyingParty = getRelyingParty(request)
      const options = await generateAuthenticationOptions({
        rpID: relyingParty.rpId,
        userVerification: 'required',
      })
      const { token } = await createChallenge(request, 'authentication', options.challenge, null)
      return challengeOptionsResponse(options, token)
    }

    const challenge = await consumeChallenge(request, 'authentication', null)
    if (!challenge) {
      const response = NextResponse.json({ error: 'Passkey sign-in expired. Please try again.' }, { status: 400 })
      clearChallengeCookie(response)
      return response
    }
    let input: {
      response?: AuthenticationResponseJSON
      mobileHandoff?: boolean
      mobileCodeChallenge?: string
    }
    try {
      input = await request.json() as typeof input
    } catch {
      const response = NextResponse.json({ error: 'Invalid passkey response.' }, { status: 400 })
      clearChallengeCookie(response)
      return response
    }
    if (!input.response || typeof input.response.id !== 'string') {
      const response = NextResponse.json({ error: 'This passkey could not identify an account. Try another sign-in method.' }, { status: 401 })
      clearChallengeCookie(response)
      return response
    }
    const [credential] = await db.select().from(passkeyCredentials)
      .where(eq(passkeyCredentials.credentialId, input.response.id))
      .limit(1)
    if (!credential || (input.response.response.userHandle &&
        input.response.response.userHandle !== Buffer.from(credential.userId).toString('base64url'))) {
      const response = NextResponse.json({ error: 'This passkey is not recognized. Try another sign-in method.' }, { status: 401 })
      clearChallengeCookie(response)
      return response
    }
    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: challenge.origin,
        expectedRPID: challenge.rpId,
        credential: {
          id: credential.credentialId,
          publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64url')),
          counter: credential.counter,
          transports: credential.transports,
        },
        requireUserVerification: true,
      })
    } catch {
      const response = NextResponse.json({ error: 'Passkey verification failed. Try another sign-in method.' }, { status: 401 })
      clearChallengeCookie(response)
      return response
    }
    if (!verification.verified) {
      const response = NextResponse.json({ error: 'Passkey verification failed. Try another sign-in method.' }, { status: 401 })
      clearChallengeCookie(response)
      return response
    }
    const [user] = await db.select().from(tenantUsers).where(eq(tenantUsers.id, credential.userId)).limit(1)
    if (!user || !user.emailVerified) {
      const response = NextResponse.json({ error: 'This account is unavailable. Try another sign-in method.' }, { status: 401 })
      clearChallengeCookie(response)
      return response
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
    if (!membership) {
      const response = NextResponse.json({ error: 'This account has no active workspace.' }, { status: 403 })
      clearChallengeCookie(response)
      return response
    }

    const mobileHandoff = input.mobileHandoff === true
    if (mobileHandoff && !/^[A-Za-z0-9_-]{43}$/.test(input.mobileCodeChallenge || '')) {
      const response = NextResponse.json({ error: 'Mobile passkey handoff could not be verified.' }, { status: 400 })
      clearChallengeCookie(response)
      return response
    }
    const { token, tokenHash } = createSessionToken()
    const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000)
    const mobileToken = mobileHandoff ? randomBytes(32).toString('base64url') : null
    await db.transaction(async (tx) => {
      await tx.update(passkeyCredentials).set({ counter: verification.authenticationInfo.newCounter })
        .where(eq(passkeyCredentials.id, credential.id))
      if (mobileToken) {
        await tx.delete(passkeyMobileHandoffs).where(lt(passkeyMobileHandoffs.expiresAt, new Date()))
        await tx.insert(passkeyMobileHandoffs).values({
          tokenHash: createHash('sha256').update(mobileToken).digest('hex'),
          codeChallenge: input.mobileCodeChallenge!,
          userId: user.id,
          tenantId: membership.tenantId,
          expiresAt: new Date(Date.now() + 90_000),
        })
      } else {
        const oldToken = request.cookies.get('billing_session')?.value
        if (oldToken && /^[A-Za-z0-9_-]{43}$/.test(oldToken)) {
          await tx.delete(tenantSessions).where(eq(tenantSessions.tokenHash, hashSessionToken(oldToken)))
        }
        await tx.insert(tenantSessions).values({ tokenHash, userId: user.id, tenantId: membership.tenantId, expiresAt })
        await tx.delete(tenantSessions).where(lt(tenantSessions.expiresAt, new Date()))
      }
    })
    const response = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      tenant: { id: membership.tenantId, name: membership.tenantName, slug: membership.tenantSlug },
      ...(mobileToken ? {
        mobileRedirectUrl: `life.lktech.billing://auth/passkey?token=${encodeURIComponent(mobileToken)}`,
      } : {}),
    })
    if (!mobileHandoff) response.cookies.set('billing_session', token, sessionCookieOptions())
    clearChallengeCookie(response)
    return response
  } catch (error) {
    console.error('Passkey operation failed', error)
    return NextResponse.json({ error: 'Unable to complete the passkey operation. Please try again.' }, { status: 503 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params
  if (action !== 'credentials') return NextResponse.json({ error: 'Unknown passkey operation.' }, { status: 404 })
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to manage passkeys.' }, { status: 401 })
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Request origin is invalid.' }, { status: 403 })
  }
  let input: { credentialId?: unknown }
  try {
    input = await request.json() as typeof input
  } catch {
    return NextResponse.json({ error: 'Select a passkey to remove.' }, { status: 400 })
  }
  if (typeof input.credentialId !== 'string' || input.credentialId.length < 1 || input.credentialId.length > 2048) {
    return NextResponse.json({ error: 'Select a valid passkey to remove.' }, { status: 400 })
  }
  try {
    const removed = await db.delete(passkeyCredentials).where(and(
      eq(passkeyCredentials.userId, session.userId),
      eq(passkeyCredentials.credentialId, input.credentialId),
    )).returning({ id: passkeyCredentials.id })
    if (!removed.length) return NextResponse.json({ error: 'Passkey not found.' }, { status: 404 })
    return NextResponse.json({ removed: true })
  } catch (error) {
    console.error('Failed to remove passkey credential', error)
    return NextResponse.json({ error: 'Unable to remove this passkey.' }, { status: 503 })
  }
}
