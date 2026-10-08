import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, eq, isNull, lt, notInArray, or, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routerConnectorCommands, routerMetricSamples, routerMonitors, routerRemoteSessions } from '@/lib/db/schema'
import { getTenantSession } from '@/lib/db/tenant'
import { isValidProvisioningBaseUrl } from '@/lib/router-provisioning'
import {
  matchesRouterConnectorToken,
  parseRouterConnectorCommandResults,
  parseRouterConnectorSessions,
  parseRouterConnectorTelemetry,
} from '@/lib/router-connector'

type RouteContext = { params: Promise<{ id: string }> }
const routerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function enroll(request: NextRequest, routerId: string) {
  const session = await getTenantSession(request)
  if (!session) return NextResponse.json({ error: 'Sign in to enable the router API connector.' }, { status: 401 })

  let baseUrl: URL
  try {
    baseUrl = new URL(process.env.PROVISIONING_BASE_URL || 'https://billing.lktech.life')
  } catch {
    return NextResponse.json({ error: 'The application URL is invalid. Configure PROVISIONING_BASE_URL before enabling the router connector.' }, { status: 503 })
  }
  if (!isValidProvisioningBaseUrl(baseUrl)) {
    return NextResponse.json({ error: 'The application URL must use HTTPS before enabling the router connector.' }, { status: 503 })
  }

  const token = randomBytes(32).toString('base64url')
  try {
    const [monitor] = await db.update(routerMonitors).set({
      connectorTokenHash: createHash('sha256').update(token).digest('hex'),
      connectorLastSeenAt: null,
    }).where(and(
      eq(routerMonitors.id, routerId),
      eq(routerMonitors.tenantId, session.tenantId),
      eq(routerMonitors.enabled, true),
    )).returning({
      id: routerMonitors.id,
      routerName: routerMonitors.routerName,
    })
    if (!monitor) return NextResponse.json({ error: 'Enable monitoring for this router before enrolling its API connector.' }, { status: 404 })

    return NextResponse.json({
      routerId: monitor.id,
      routerName: monitor.routerName,
      appUrl: baseUrl.origin,
      token,
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to enroll router API connector', error)
    return NextResponse.json({ error: 'Unable to enable the router API connector.' }, { status: 503 })
  }
}

async function report(request: NextRequest, routerId: string) {
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!routerIdPattern.test(routerId) || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return NextResponse.json({ error: 'Router connector credentials are invalid.' }, { status: 401 })
  }

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 1_000_000) return NextResponse.json({ error: 'Router connector report is too large.' }, { status: 413 })

  let input: { sessions?: unknown; commandResults?: unknown; telemetry?: unknown }
  try {
    input = await request.json() as { sessions?: unknown; commandResults?: unknown; telemetry?: unknown }
  } catch {
    return NextResponse.json({ error: 'Router connector report must be valid JSON.' }, { status: 400 })
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return NextResponse.json({ error: 'Router connector report is invalid.' }, { status: 400 })
  }
  const sessions = parseRouterConnectorSessions(input.sessions)
  const commandResults = parseRouterConnectorCommandResults(input.commandResults ?? [])
  const telemetry = input.telemetry === undefined || input.telemetry === null
    ? null
    : parseRouterConnectorTelemetry(input.telemetry)
  if (!sessions || !commandResults || (input.telemetry !== undefined && input.telemetry !== null && !telemetry)) {
    return NextResponse.json({ error: 'Router connector report contains invalid sessions, commands, or telemetry.' }, { status: 400 })
  }

  try {
    const commands = await db.transaction(async (tx) => {
      const [monitor] = await tx.select({
        id: routerMonitors.id,
        connectorTokenHash: routerMonitors.connectorTokenHash,
      }).from(routerMonitors).where(and(
        eq(routerMonitors.id, routerId),
        eq(routerMonitors.enabled, true),
      )).for('update').limit(1)
      if (!monitor || !matchesRouterConnectorToken(token, monitor.connectorTokenHash)) return null

      const [heartbeat] = await tx.update(routerMonitors)
        .set({
          connectorLastSeenAt: sql<Date>`clock_timestamp()`,
          lastSeenAt: sql<Date>`clock_timestamp()`,
        })
        .where(eq(routerMonitors.id, monitor.id))
        .returning({
          observedAt: routerMonitors.connectorLastSeenAt,
          lastSeenAt: routerMonitors.lastSeenAt,
        })
      if (!heartbeat?.observedAt) throw new Error('Router connector heartbeat timestamp was not recorded.')
      const { observedAt } = heartbeat
      if (telemetry) {
        await tx.insert(routerMetricSamples).values({
          id: telemetry.sampleId,
          routerId: monitor.id,
          sampledAt: heartbeat.lastSeenAt || observedAt,
          cpuLoad: telemetry.cpuLoad,
          freeMemoryBytes: telemetry.freeMemoryBytes,
          totalMemoryBytes: telemetry.totalMemoryBytes,
          freeDiskBytes: telemetry.totalDiskBytes ? telemetry.freeDiskBytes : null,
          totalDiskBytes: telemetry.totalDiskBytes ? telemetry.totalDiskBytes : null,
          totalRxBytes: telemetry.totalRxBytes,
          totalTxBytes: telemetry.totalTxBytes,
          activeHotspotUsers: telemetry.activeHotspotUsers,
          activePppoeUsers: telemetry.activePppoeUsers,
          uptimeSeconds: telemetry.uptimeSeconds,
          routerOsVersion: telemetry.routerOsVersion,
          boardName: telemetry.boardName,
        }).onConflictDoNothing({ target: routerMetricSamples.id })
        await tx.delete(routerMetricSamples).where(and(
          eq(routerMetricSamples.routerId, monitor.id),
          lt(routerMetricSamples.sampledAt, new Date(observedAt.getTime() - 35 * 24 * 60 * 60 * 1000)),
        ))
      }
      const reportedSessions = sessions.length
        ? await tx.insert(routerRemoteSessions).values(sessions.map((item) => ({
          routerId: monitor.id,
          sessionType: item.sessionType,
          routerSessionId: item.routerSessionId,
          username: item.username,
          macAddress: item.macAddress,
          ipAddress: item.ipAddress,
          callerId: item.callerId,
          uptimeSeconds: item.uptimeSeconds,
          observedAt,
        }))).onConflictDoUpdate({
          target: [
            routerRemoteSessions.routerId,
            routerRemoteSessions.sessionType,
            routerRemoteSessions.routerSessionId,
          ],
          set: {
            username: sql`excluded.username`,
            macAddress: sql`excluded.mac_address`,
            ipAddress: sql`excluded.ip_address`,
            callerId: sql`excluded.caller_id`,
            uptimeSeconds: sql`excluded.uptime_seconds`,
            observedAt: sql`excluded.observed_at`,
          },
        }).returning({ id: routerRemoteSessions.id })
        : []
      await tx.delete(routerRemoteSessions).where(reportedSessions.length
        ? and(
          eq(routerRemoteSessions.routerId, monitor.id),
          notInArray(routerRemoteSessions.id, reportedSessions.map((session) => session.id)),
        )
        : eq(routerRemoteSessions.routerId, monitor.id))

      for (const result of commandResults) {
        await tx.update(routerConnectorCommands).set({
          status: result.succeeded ? 'succeeded' : 'failed',
          errorMessage: result.errorMessage,
          completedAt: observedAt,
          claimExpiresAt: null,
          claimToken: null,
        }).where(and(
          eq(routerConnectorCommands.id, result.id),
          eq(routerConnectorCommands.routerId, monitor.id),
          eq(routerConnectorCommands.status, 'processing'),
          eq(routerConnectorCommands.claimToken, result.claimToken),
        ))
      }

      await tx.delete(routerConnectorCommands).where(and(
        eq(routerConnectorCommands.routerId, monitor.id),
        lt(routerConnectorCommands.createdAt, new Date(observedAt.getTime() - 30 * 24 * 60 * 60 * 1000)),
        or(
          eq(routerConnectorCommands.status, 'succeeded'),
          eq(routerConnectorCommands.status, 'failed'),
        ),
      ))

      const availableCommands = await tx.select({
        id: routerConnectorCommands.id,
        sessionType: routerConnectorCommands.sessionType,
        routerSessionId: routerConnectorCommands.routerSessionId,
        username: routerConnectorCommands.username,
      }).from(routerConnectorCommands).where(and(
        eq(routerConnectorCommands.routerId, monitor.id),
        or(
          eq(routerConnectorCommands.status, 'queued'),
          and(
            eq(routerConnectorCommands.status, 'processing'),
            or(
              isNull(routerConnectorCommands.claimExpiresAt),
              lt(routerConnectorCommands.claimExpiresAt, observedAt),
            ),
          ),
        ),
      )).orderBy(routerConnectorCommands.createdAt).limit(5).for('update', { skipLocked: true })

      const claimExpiresAt = new Date(observedAt.getTime() + 120_000)
      const claimedCommands: Array<(typeof availableCommands)[number] & { claimToken: string }> = []
      for (const command of availableCommands) {
        const claimToken = randomUUID()
        await tx.update(routerConnectorCommands).set({
          status: 'processing',
          claimExpiresAt,
          claimToken,
        }).where(eq(routerConnectorCommands.id, command.id))
        claimedCommands.push({ ...command, claimToken })
      }
      return claimedCommands
    })

    if (!commands) return NextResponse.json({ error: 'Router connector is disabled or not registered.' }, { status: 401 })
    return NextResponse.json({
      commands: commands.map((command) => ({
        id: command.id,
        claimToken: command.claimToken,
        sessionType: command.sessionType,
        routerSessionId: command.routerSessionId,
        username: command.username,
      })),
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to accept router connector report', error)
    return NextResponse.json({ error: 'Unable to record router connector report.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  if (!routerIdPattern.test(id)) return NextResponse.json({ error: 'Router id is invalid.' }, { status: 400 })
  return request.headers.has('authorization') ? report(request, id) : enroll(request, id)
}

export const dynamic = 'force-dynamic'
