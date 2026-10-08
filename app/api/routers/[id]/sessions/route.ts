import { and, eq, gt, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routerConnectorCommands, routerMonitors, routerRemoteSessions } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'
import { isRouterSessionId, isRouterSessionType } from '@/lib/router-connector'

type RouteContext = { params: Promise<{ id: string }> }
const routerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function getAccess(request: NextRequest, routerId: string) {
  const session = await getTenantSession(request)
  if (!session) return { response: NextResponse.json({ error: 'Sign in to manage router sessions.' }, { status: 401 }) }
  if (!routerIdPattern.test(routerId)) {
    return { response: NextResponse.json({ error: 'Router id is invalid.' }, { status: 400 }) }
  }
  try {
    const [monitor] = await db.select({
      id: routerMonitors.id,
      connectorLastSeenAt: routerMonitors.connectorLastSeenAt,
      connectorEnabled: routerMonitors.connectorTokenHash,
    }).from(routerMonitors).where(and(
      eq(routerMonitors.id, routerId),
      eq(routerMonitors.tenantId, session.tenantId),
      eq(routerMonitors.enabled, true),
    )).limit(1)
    if (!monitor) return { response: NextResponse.json({ error: 'Router not found in this workspace.' }, { status: 404 }) }
    return { session, monitor }
  } catch (error) {
    console.error('Failed to authorize router session access', error)
    return { response: NextResponse.json({ error: 'Unable to access router sessions.' }, { status: 503 }) }
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await getAccess(request, id)
  if ('response' in access) return access.response

  try {
    const rows = await db.select({
      sessionType: routerRemoteSessions.sessionType,
      routerSessionId: routerRemoteSessions.routerSessionId,
      username: routerRemoteSessions.username,
      macAddress: routerRemoteSessions.macAddress,
      ipAddress: routerRemoteSessions.ipAddress,
      callerId: routerRemoteSessions.callerId,
      uptimeSeconds: routerRemoteSessions.uptimeSeconds,
      observedAt: routerRemoteSessions.observedAt,
    }).from(routerRemoteSessions).where(and(
      eq(routerRemoteSessions.routerId, access.monitor.id),
      gt(routerRemoteSessions.observedAt, new Date(Date.now() - 30_000)),
    )).orderBy(routerRemoteSessions.sessionType, routerRemoteSessions.username)

    return NextResponse.json({
      connected: Boolean(access.monitor.connectorEnabled && access.monitor.connectorLastSeenAt &&
        access.monitor.connectorLastSeenAt.getTime() > Date.now() - 30_000),
      connectorEnabled: Boolean(access.monitor.connectorEnabled),
      connectorLastSeenAt: access.monitor.connectorLastSeenAt?.toISOString() ?? null,
      sessions: rows.map((row) => ({
        ...row,
        observedAt: row.observedAt.toISOString(),
      })),
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to load router sessions', error)
    return NextResponse.json({ error: 'Unable to load router sessions.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await getAccess(request, id)
  if ('response' in access) return access.response

  let input: { sessionType?: unknown; routerSessionId?: unknown }
  try {
    input = await request.json() as { sessionType?: unknown; routerSessionId?: unknown }
  } catch {
    return NextResponse.json({ error: 'Disconnect request must be valid JSON.' }, { status: 400 })
  }
  const sessionType = input?.sessionType
  const routerSessionId = input?.routerSessionId
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !isRouterSessionType(sessionType) || !isRouterSessionId(routerSessionId)) {
    return NextResponse.json({ error: 'Choose a valid active router session.' }, { status: 400 })
  }

  try {
    const command = await db.transaction(async (tx) => {
      await tx.select({ id: routerMonitors.id }).from(routerMonitors).where(and(
        eq(routerMonitors.id, access.monitor.id),
        eq(routerMonitors.tenantId, access.session.tenantId),
        eq(routerMonitors.enabled, true),
      )).for('update').limit(1)
      const [activeSession] = await tx.select({
        routerSessionId: routerRemoteSessions.routerSessionId,
        username: routerRemoteSessions.username,
      }).from(routerRemoteSessions).where(and(
        eq(routerRemoteSessions.routerId, access.monitor.id),
        eq(routerRemoteSessions.sessionType, sessionType),
        eq(routerRemoteSessions.routerSessionId, routerSessionId),
        gt(routerRemoteSessions.observedAt, new Date(Date.now() - 30_000)),
      )).limit(1)
      if (!activeSession) return null

      const [pending] = await tx.select({ id: routerConnectorCommands.id }).from(routerConnectorCommands).where(and(
        eq(routerConnectorCommands.routerId, access.monitor.id),
        eq(routerConnectorCommands.sessionType, sessionType),
        eq(routerConnectorCommands.routerSessionId, routerSessionId),
        or(eq(routerConnectorCommands.status, 'queued'), eq(routerConnectorCommands.status, 'processing')),
      )).limit(1)
      if (pending) return { id: pending.id, alreadyQueued: true }

      const [created] = await tx.insert(routerConnectorCommands).values({
        routerId: access.monitor.id,
        requestedBy: access.session.userId,
        sessionType,
        routerSessionId: activeSession.routerSessionId,
        username: activeSession.username,
      }).returning({ id: routerConnectorCommands.id })
      return { id: created.id, alreadyQueued: false }
    })

    if (!command) return NextResponse.json({ error: 'That router session is no longer active. Refresh the list.' }, { status: 409 })
    return NextResponse.json({ commandId: command.id, queued: !command.alreadyQueued }, { status: 202 })
  } catch (error) {
    console.error('Failed to queue router session disconnect', error)
    return NextResponse.json({ error: 'Unable to queue the router session disconnect.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
