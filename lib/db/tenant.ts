import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { and, eq, gt } from 'drizzle-orm'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { tenantMemberships, tenantSessions, tenantUsers, tenants } from '@/lib/db/schema'

const scrypt = promisify(scryptCallback)
export const DEFAULT_TENANT_ID = 'default'
export const SESSION_COOKIE = 'billing_session'
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30

export type TenantSession = {
  userId: string
  email: string
  name: string
  tenantId: string
  tenantName: string
  tenantSlug: string
  role: string
  tokenHash: string
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64) as Buffer
  return `scrypt$${salt}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, expectedHex] = encoded.split('$')
  if (algorithm !== 'scrypt' || !salt || !/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{128}$/.test(expectedHex || '')) return false
  const expected = Buffer.from(expectedHex, 'hex')
  const actual = await scrypt(password, salt, expected.length) as Buffer
  return timingSafeEqual(actual, expected)
}

export function createSessionToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashSessionToken(token) }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  }
}

async function readSessionToken(request?: NextRequest) {
  if (request) return request.cookies.get(SESSION_COOKIE)?.value || null
  const cookieStore = await cookies()
  return cookieStore.get(SESSION_COOKIE)?.value || null
}

export async function getTenantSession(request?: NextRequest): Promise<TenantSession | null> {
  if (!process.env.DATABASE_URL?.trim()) return null
  const token = await readSessionToken(request)
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null

  const tokenHash = hashSessionToken(token)
  const [row] = await db.select({
    userId: tenantUsers.id,
    email: tenantUsers.email,
    name: tenantUsers.name,
    tenantId: tenants.id,
    tenantName: tenants.name,
    tenantSlug: tenants.slug,
    role: tenantMemberships.role,
  }).from(tenantSessions)
    .innerJoin(tenantUsers, eq(tenantUsers.id, tenantSessions.userId))
    .innerJoin(tenantMemberships, and(
      eq(tenantMemberships.userId, tenantSessions.userId),
      eq(tenantMemberships.tenantId, tenantSessions.tenantId),
    ))
    .innerJoin(tenants, eq(tenants.id, tenantSessions.tenantId))
    .where(and(eq(tenantSessions.tokenHash, tokenHash), gt(tenantSessions.expiresAt, new Date()), eq(tenants.status, 'active')))
    .limit(1)

  return row ? { ...row, tokenHash } : null
}

export async function getTenantMemberships(userId: string) {
  return db.select({
    id: tenants.id,
    name: tenants.name,
    slug: tenants.slug,
    role: tenantMemberships.role,
  }).from(tenantMemberships)
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
    .where(and(eq(tenantMemberships.userId, userId), eq(tenants.status, 'active')))
    .orderBy(tenants.createdAt)
}

export async function resolvePublicTenantId(request: NextRequest): Promise<string | null> {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase() || ''
  const labels = host.split('.')
  const candidateSubdomain = labels.length > 2 ? labels[0] : ''
  const subdomain = ['www', 'app', 'billing', 'login'].includes(candidateSubdomain) ? '' : candidateSubdomain
  const slug = (
    request.nextUrl.searchParams.get('tenant') ||
    request.headers.get('x-tenant-slug') ||
    request.cookies.get('tenant_slug')?.value ||
    (subdomain && !['www', 'app'].includes(subdomain) ? subdomain : '') ||
    'default'
  ).trim().toLowerCase()

  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return null
  const [tenant] = await db.select({ id: tenants.id }).from(tenants)
    .where(and(eq(tenants.slug, slug), eq(tenants.status, 'active')))
    .limit(1)
  return tenant?.id || null
}
