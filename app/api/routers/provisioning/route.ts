import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { isIPv4 } from 'node:net'
import { and, eq, lt, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProvisioningDbErrorMessage } from '@/lib/provisioning-errors'
import { buildFetchCommand, buildProvisioningScript, buildServiceConfigFetchCommand, isValidProvisioningBaseUrl } from '@/lib/router-provisioning'
import { routerProvisioningTokens } from '@/lib/db/schema'

type ProvisionInput = {
  routerName?: unknown
}

function isLocalRequest(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0]
  if (host !== '127.0.0.1' && host !== 'localhost') return false

  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    const parsedOrigin = new URL(origin)
    return parsedOrigin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsedOrigin.hostname) && parsedOrigin.host === request.headers.get('host')
  } catch {
    return false
  }
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function hasProvisioningAdminKey(request: NextRequest) {
  const expected = process.env.PROVISIONING_ADMIN_KEY || ''
  const provided = request.headers.get('x-provisioning-admin-key') || ''
  if (expected.length < 32 || !provided) return false
  const expectedHash = createHash('sha256').update(expected).digest()
  const providedHash = createHash('sha256').update(provided).digest()
  return timingSafeEqual(expectedHash, providedHash)
}

function isAuthorized(request: NextRequest) {
  return process.env.NODE_ENV === 'development' ? isLocalRequest(request) : hasProvisioningAdminKey(request)
}

function authorizationError() {
  if (process.env.NODE_ENV !== 'development' && !process.env.PROVISIONING_ADMIN_KEY) {
    return NextResponse.json({ error: 'Set PROVISIONING_ADMIN_KEY in the deployment environment before creating router scripts' }, { status: 503 })
  }
  return NextResponse.json({ error: 'Provisioning admin key is missing or invalid' }, { status: 401 })
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return authorizationError()

  let input: ProvisionInput
  try {
    input = await request.json() as ProvisionInput
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const routerName = typeof input.routerName === 'string' ? input.routerName.trim() : ''
  const radiusServerAddress = (process.env.RADIUS_SERVER_ADDRESS || '').trim()
  const radiusSecret = process.env.RADIUS_SHARED_SECRET || ''

  if (!/^[a-zA-Z0-9 _-]{1,48}$/.test(routerName)) return NextResponse.json({ error: 'Router name is invalid' }, { status: 400 })
  if (!isIPv4(radiusServerAddress) || !/^[a-zA-Z0-9-]{16,64}$/.test(radiusSecret)) {
    return NextResponse.json({ error: 'Router provisioning is not configured. Ask your network administrator.' }, { status: 503 })
  }
  let baseUrl: URL
  try {
    baseUrl = new URL(process.env.PROVISIONING_BASE_URL || 'https://billing.lktech.life')
  } catch {
    return NextResponse.json({ error: 'PROVISIONING_BASE_URL is invalid' }, { status: 500 })
  }
  if (!isValidProvisioningBaseUrl(baseUrl)) {
    return NextResponse.json({ error: 'PROVISIONING_BASE_URL must be an HTTPS origin, or http://localhost in development' }, { status: 500 })
  }

  const token = randomBytes(32).toString('base64url')
  const completeUrl = new URL(`/provision/${token}/complete`, baseUrl).toString()
  const configScript = buildProvisioningScript({ routerName, radiusServerAddress, radiusSecret, completeUrl })
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000)

  try {
    await db.delete(routerProvisioningTokens).where(or(
      lt(routerProvisioningTokens.expiresAt, now),
      and(eq(routerProvisioningTokens.status, 'applied'), lt(routerProvisioningTokens.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000))),
    ))
    const [record] = await db.insert(routerProvisioningTokens).values({
      tokenHash: tokenHash(token),
      configScript,
      status: 'pending',
      expiresAt,
    }).returning({ id: routerProvisioningTokens.id })

    const scriptUrl = new URL(`/provision/${token}`, baseUrl).toString()
    const fetchCommand = buildFetchCommand({ scriptUrl })

    return NextResponse.json({ id: record.id, fetchCommand, expiresAt: expiresAt.toISOString() }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to create router provisioning token', error)
    return NextResponse.json({ error: getProvisioningDbErrorMessage(error) }, { status: 503 })
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return authorizationError()

  const id = request.nextUrl.searchParams.get('id') || ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid provisioning id' }, { status: 400 })
  }

  try {
    const [record] = await db.select({ status: routerProvisioningTokens.status, expiresAt: routerProvisioningTokens.expiresAt, sourceIp: routerProvisioningTokens.sourceIp, routerData: routerProvisioningTokens.routerData })
      .from(routerProvisioningTokens)
      .where(eq(routerProvisioningTokens.id, id))
      .limit(1)
    if (!record) return NextResponse.json({ error: 'Provisioning record not found' }, { status: 404 })
    const status = record.status !== 'applied' && record.expiresAt.getTime() <= Date.now() ? 'expired' : record.status
    if (status === 'expired' && record.status !== 'expired') {
      await db.update(routerProvisioningTokens).set({ status: 'expired', configScript: null }).where(eq(routerProvisioningTokens.id, id))
    }
    return NextResponse.json({ status, sourceIp: record.sourceIp, routerData: record.routerData }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to read provisioning status' }, { status: 503 })
  }
}

export async function PUT(request: NextRequest) {
  if (!isAuthorized(request)) return authorizationError()

  let input: { token?: unknown; configScript?: unknown }
  try {
    input = await request.json() as { token?: unknown; configScript?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const token = typeof input.token === 'string' ? input.token : ''
  const configScript = typeof input.configScript === 'string' ? input.configScript : ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !configScript.trim() || configScript.length > 32768) {
    return NextResponse.json({ error: 'Router configuration is invalid' }, { status: 400 })
  }

  let baseUrl: URL
  try {
    baseUrl = new URL(process.env.PROVISIONING_BASE_URL || 'https://billing.lktech.life')
  } catch {
    return NextResponse.json({ error: 'PROVISIONING_BASE_URL is invalid' }, { status: 500 })
  }
  if (!isValidProvisioningBaseUrl(baseUrl)) {
    return NextResponse.json({ error: 'PROVISIONING_BASE_URL must be an HTTPS origin, or http://localhost in development' }, { status: 500 })
  }

  try {
    const [record] = await db.select({ id: routerProvisioningTokens.id, status: routerProvisioningTokens.status, expiresAt: routerProvisioningTokens.expiresAt })
      .from(routerProvisioningTokens)
      .where(eq(routerProvisioningTokens.tokenHash, tokenHash(token)))
      .limit(1)
    if (!record || record.status !== 'applied' || record.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Provisioning link is not ready for configuration or has expired.' }, { status: 409 })
    }

    await db.update(routerProvisioningTokens)
      .set({ configScript })
      .where(eq(routerProvisioningTokens.id, record.id))

    const scriptUrl = new URL(`/provision/${token}/configure`, baseUrl).toString()
    return NextResponse.json({ fetchCommand: buildServiceConfigFetchCommand({ scriptUrl }) }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to store router service configuration', error)
    return NextResponse.json({ error: getProvisioningDbErrorMessage(error) }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'