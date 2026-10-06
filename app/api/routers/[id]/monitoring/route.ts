import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routerMonitors } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'
import { buildRouterMonitorScript } from '@/lib/router-monitor-script'
import { hashRouterMonitorToken } from '@/lib/router-monitoring'

async function authorize(request: NextRequest, id: string) {
  const session = await getTenantSession(request)
  if (!session) return { response: NextResponse.json({ error: 'Sign in to manage router monitoring.' }, { status: 401 }) }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { response: NextResponse.json({ error: 'Router id is invalid.' }, { status: 400 }) }
  }
  return { tenantId: session.tenantId, id }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const access = await authorize(request, id)
  if ('response' in access) return access.response

  let baseUrl: URL
  try {
    baseUrl = new URL(process.env.PROVISIONING_BASE_URL || 'https://billing.lktech.life')
  } catch {
    return NextResponse.json({ error: 'PROVISIONING_BASE_URL is invalid.' }, { status: 503 })
  }
  if (baseUrl.protocol !== 'https:' && !(process.env.NODE_ENV === 'development' && ['localhost', '127.0.0.1'].includes(baseUrl.hostname))) {
    return NextResponse.json({ error: 'Router monitoring requires an HTTPS application URL.' }, { status: 503 })
  }

  const token = randomBytes(32).toString('base64url')
  try {
    const [monitor] = await db.select({
      id: routerMonitors.id,
      routerName: routerMonitors.routerName,
      tokenHash: routerMonitors.tokenHash,
    }).from(routerMonitors).where(and(
      eq(routerMonitors.id, access.id),
      eq(routerMonitors.tenantId, access.tenantId),
    )).limit(1)
    if (!monitor) return NextResponse.json({ error: 'Router monitor not found in this workspace.' }, { status: 404 })

    await db.update(routerMonitors).set({
      previousTokenHash: monitor.tokenHash,
      previousTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      tokenHash: hashRouterMonitorToken(token),
      enabled: true,
    }).where(and(eq(routerMonitors.id, monitor.id), eq(routerMonitors.tenantId, access.tenantId)))

    const script = buildRouterMonitorScript({
      routerId: monitor.id,
      monitorToken: token,
      telemetryUrl: new URL('/api/routers/telemetry', baseUrl).toString(),
    })
    return NextResponse.json({ script, routerName: monitor.routerName }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to prepare router monitoring script', error)
    return NextResponse.json({ error: 'Unable to prepare router monitoring script.' }, { status: 503 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const access = await authorize(request, id)
  if ('response' in access) return access.response
  try {
    const [removed] = await db.delete(routerMonitors).where(and(
      eq(routerMonitors.id, access.id),
      eq(routerMonitors.tenantId, access.tenantId),
    )).returning({ id: routerMonitors.id })
    if (!removed) return NextResponse.json({ error: 'Router monitor not found in this workspace.' }, { status: 404 })
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to remove router monitoring', error)
    return NextResponse.json({ error: 'Unable to remove router monitoring.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
