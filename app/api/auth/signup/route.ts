import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tenantMemberships, tenantSessions, tenantUsers, tenants } from '@/lib/db/schema'
import { createSessionToken, hashPassword, SESSION_DURATION_SECONDS, sessionCookieOptions } from '@/lib/db/tenant'
import { getPasswordValidationErrors } from '@/lib/password-policy'

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

  try {
    const passwordHash = await hashPassword(password)
    const { token, tokenHash } = createSessionToken()
    const userId = randomUUID()
    const claimDefaultWorkspace = process.env.DEFAULT_TENANT_OWNER_EMAIL?.trim().toLowerCase() === email
    const tenantId = claimDefaultWorkspace ? 'default' : randomUUID()
    const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000)
    const workspace = await db.transaction(async (tx) => {
      await tx.insert(tenantUsers).values({ id: userId, name, email, passwordHash })
      if (claimDefaultWorkspace) {
        const [defaultWorkspace] = await tx.select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
          .from(tenants).where(eq(tenants.id, tenantId)).limit(1)
        if (!defaultWorkspace) throw new Error('The default workspace has not been created. Apply the tenant migration first.')
        await tx.insert(tenantMemberships).values({ tenantId, userId, role: 'owner' })
        await tx.insert(tenantSessions).values({ tokenHash, userId, tenantId, expiresAt })
        return defaultWorkspace
      }
      await tx.insert(tenants).values({ id: tenantId, name: tenantName, slug })
      await tx.insert(tenantMemberships).values({ tenantId, userId, role: 'owner' })
      await tx.insert(tenantSessions).values({ tokenHash, userId, tenantId, expiresAt })
      return { id: tenantId, name: tenantName, slug }
    })
    const response = NextResponse.json({ user: { id: userId, name, email }, tenant: workspace }, { status: 201 })
    response.cookies.set('billing_session', token, sessionCookieOptions())
    return response
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'That email address or workspace slug is already in use.' }, { status: 409 })
    }
    console.error('Failed to create tenant account', error)
    return NextResponse.json({ error: 'Unable to create the account right now.' }, { status: 503 })
  }
}
