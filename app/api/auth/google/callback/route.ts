import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantMemberships, tenantSessions, tenantUsers, tenants } from '@/lib/db/schema'
import { createSessionToken, hashSessionToken, SESSION_DURATION_SECONDS, sessionCookieOptions } from '@/lib/db/tenant'
import { getGoogleOAuthConfiguration } from '@/lib/google-oauth'

const oauthCookieNames = ['google_oauth_state', 'google_oauth_nonce', 'google_oauth_verifier', 'google_oauth_mode'] as const

function clearOAuthCookies(response: NextResponse) {
  for (const name of oauthCookieNames) {
    response.cookies.set(name, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
  }
}

function failureRedirect(redirectUri: string, code: string, mode: 'login' | 'signup') {
  const response = NextResponse.redirect(new URL(`/${mode}?error=${encodeURIComponent(code)}`, new URL(redirectUri).origin))
  clearOAuthCookies(response)
  return response
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

function slugify(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 52)
}

export async function GET(request: NextRequest) {
  const mode = request.cookies.get('google_oauth_mode')?.value === 'signup' ? 'signup' : 'login'
  const configured = getGoogleOAuthConfiguration(request.url)
  if (!configured) return NextResponse.redirect(new URL(`/${mode}?error=google_unavailable`, request.url))
  if (!process.env.DATABASE_URL?.trim()) return failureRedirect(configured.redirectUri, 'database_unavailable', mode)
  const state = request.nextUrl.searchParams.get('state') || ''
  const code = request.nextUrl.searchParams.get('code') || ''
  const expectedState = request.cookies.get('google_oauth_state')?.value || ''
  const nonce = request.cookies.get('google_oauth_nonce')?.value || ''
  const codeVerifier = request.cookies.get('google_oauth_verifier')?.value || ''
  const providerError = request.nextUrl.searchParams.get('error')
  if (providerError) return failureRedirect(configured.redirectUri, 'google_cancelled', mode)
  if (!state || !expectedState || !safeEqual(state, expectedState) || !code || !nonce || !codeVerifier) {
    return failureRedirect(configured.redirectUri, 'google_invalid_state', mode)
  }

  try {
    const { tokens } = await configured.client.getToken({ code, codeVerifier })
    if (!tokens.id_token) return failureRedirect(configured.redirectUri, 'google_identity_unavailable', mode)
    const ticket = await configured.client.verifyIdToken({ idToken: tokens.id_token, audience: configured.clientId })
    const payload = ticket.getPayload()
    if (!payload?.sub || !payload.email || payload.email_verified !== true || payload.nonce !== nonce) {
      return failureRedirect(configured.redirectUri, 'google_identity_invalid', mode)
    }

    const email = payload.email.trim().toLowerCase()
    const name = (payload.name || email.split('@')[0]).trim().slice(0, 120)
    const { token, tokenHash } = createSessionToken()
    const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000)
    const defaultOwner = process.env.DEFAULT_TENANT_OWNER_EMAIL?.trim().toLowerCase() === email

    await db.transaction(async (tx) => {
      const oldToken = request.cookies.get('billing_session')?.value
      if (oldToken && /^[A-Za-z0-9_-]{43}$/.test(oldToken)) {
        await tx.delete(tenantSessions).where(eq(tenantSessions.tokenHash, hashSessionToken(oldToken)))
      }

      let [user] = await tx.select().from(tenantUsers).where(eq(tenantUsers.googleSubject, payload.sub!)).limit(1)
      if (!user) {
        const [emailMatch] = await tx.select().from(tenantUsers).where(eq(tenantUsers.email, email)).limit(1)
        if (emailMatch) {
          if (emailMatch.googleSubject && emailMatch.googleSubject !== payload.sub) throw new Error('GOOGLE_ACCOUNT_CONFLICT')
          user = emailMatch
          await tx.update(tenantUsers).set({ googleSubject: payload.sub, name: emailMatch.name || name }).where(eq(tenantUsers.id, emailMatch.id))
        } else {
          const userId = randomUUID()
          const tenantId = defaultOwner ? 'default' : randomUUID()
          const workspaceName = `${name}'s workspace`.slice(0, 80)
          let workspace: { id: string; name: string; slug: string }
          if (defaultOwner) {
            const [existingDefault] = await tx.select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
              .from(tenants).where(eq(tenants.id, 'default')).limit(1)
            if (!existingDefault) throw new Error('DEFAULT_WORKSPACE_MISSING')
            workspace = existingDefault
          } else {
            const slugBase = slugify(name) || 'workspace'
            const slug = `${slugBase}-${randomBytes(4).toString('hex')}`
            const [createdWorkspace] = await tx.insert(tenants).values({ id: tenantId, name: workspaceName, slug }).returning({
              id: tenants.id,
              name: tenants.name,
              slug: tenants.slug,
            })
            workspace = createdWorkspace
          }
          const [createdUser] = await tx.insert(tenantUsers).values({
            id: userId,
            email,
            name,
            passwordHash: null,
            googleSubject: payload.sub,
          }).returning()
          user = createdUser
          await tx.insert(tenantMemberships).values({ tenantId, userId, role: 'owner' })
          await tx.insert(tenantSessions).values({ tokenHash, userId, tenantId, expiresAt })
          return { user, tenantId, workspace }
        }
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

      if (!membership) {
        const tenantId = defaultOwner ? 'default' : randomUUID()
        let workspace: { id: string; name: string; slug: string }
        if (defaultOwner) {
          const [existingDefault] = await tx.select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
            .from(tenants).where(eq(tenants.id, tenantId)).limit(1)
          if (!existingDefault) throw new Error('DEFAULT_WORKSPACE_MISSING')
          workspace = existingDefault
        } else {
          const workspaceName = `${name}'s workspace`.slice(0, 80)
          const slug = `${slugify(name) || 'workspace'}-${randomBytes(4).toString('hex')}`
          const [createdWorkspace] = await tx.insert(tenants).values({ id: tenantId, name: workspaceName, slug }).returning({
            id: tenants.id,
            name: tenants.name,
            slug: tenants.slug,
          })
          workspace = createdWorkspace
        }
        await tx.insert(tenantMemberships).values({ tenantId, userId: user.id, role: 'owner' })
        await tx.insert(tenantSessions).values({ tokenHash, userId: user.id, tenantId, expiresAt })
        return { user, tenantId, workspace }
      }

      await tx.insert(tenantSessions).values({ tokenHash, userId: user.id, tenantId: membership.tenantId, expiresAt })
      return {
        user,
        tenantId: membership.tenantId,
        workspace: { id: membership.tenantId, name: membership.tenantName, slug: membership.tenantSlug },
      }
    })

    const response = NextResponse.redirect(new URL('/', new URL(configured.redirectUri).origin))
    response.cookies.set('billing_session', token, sessionCookieOptions())
    clearOAuthCookies(response)
    return response
  } catch (error) {
    if (error instanceof Error && error.message === 'GOOGLE_ACCOUNT_CONFLICT') return failureRedirect(configured.redirectUri, 'google_account_conflict', mode)
    if (error instanceof Error && error.message === 'DEFAULT_WORKSPACE_MISSING') return failureRedirect(configured.redirectUri, 'default_workspace_missing', mode)
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return failureRedirect(configured.redirectUri, 'google_account_conflict', mode)
    }
    console.error('Google sign-in callback failed', error)
    return failureRedirect(configured.redirectUri, 'google_signin_failed', mode)
  }
}
