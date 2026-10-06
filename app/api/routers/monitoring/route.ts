import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routerMonitors, sites } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'
import { buildRouterMonitorScript } from '@/lib/router-monitor-script'
import { hashRouterMonitorToken } from '@/lib/router-monitoring'

export async function POST(request: NextRequest) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to enable router monitoring.' }, { status: 401 })

  let input: { siteId?: unknown; routerName?: unknown }
  try {
    input = await request.json() as { siteId?: unknown; routerName?: unknown }
  } catch {
    return NextResponse.json({ error: 'Router monitoring request must be valid JSON.' }, { status: 400 })
  }

  const siteId = typeof input.siteId === 'string' ? input.siteId : ''
  const routerName = typeof input.routerName === 'string' ? input.routerName.trim() : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(siteId) ||
      !/^[a-zA-Z0-9 _-]{1,48}$/.test(routerName)) {
    return NextResponse.json({ error: 'Choose a valid network site and router name.' }, { status: 400 })
  }
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
  const telemetryUrl = new URL('/api/routers/telemetry', baseUrl)

  try {
    const monitorId = await db.transaction(async (tx) => {
      const [site] = await tx.select({ id: sites.id }).from(sites).where(and(
        eq(sites.id, siteId),
        eq(sites.tenantId, session.tenantId),
      )).limit(1)
      if (!site) return null

      const [existing] = await tx.select({
        id: routerMonitors.id,
        tokenHash: routerMonitors.tokenHash,
      }).from(routerMonitors).where(and(
        eq(routerMonitors.tenantId, session.tenantId),
        eq(routerMonitors.routerName, routerName),
      )).limit(1)
      const id = existing?.id || site.id
      if (existing) {
        await tx.update(routerMonitors).set({
          siteId,
          previousTokenHash: existing.tokenHash,
          previousTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          tokenHash: hashRouterMonitorToken(token),
          enabled: true,
        }).where(and(eq(routerMonitors.id, id), eq(routerMonitors.tenantId, session.tenantId)))
      } else {
        await tx.insert(routerMonitors).values({
          id,
          tenantId: session.tenantId,
          siteId,
          routerName,
          tokenHash: hashRouterMonitorToken(token),
        })
      }
      return id
    })

    if (!monitorId) return NextResponse.json({ error: 'Network site not found in this workspace.' }, { status: 404 })
    const script = buildRouterMonitorScript({
      routerId: monitorId,
      monitorToken: token,
      telemetryUrl: telemetryUrl.toString(),
    })
    return NextResponse.json({ script, routerName }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to enable router monitoring', error)
    return NextResponse.json({ error: 'Unable to enable router monitoring.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
