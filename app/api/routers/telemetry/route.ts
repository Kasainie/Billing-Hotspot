import { randomUUID } from 'node:crypto'
import { and, eq, gt, lt, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { isIP } from 'node:net'
import { db } from '@/lib/db'
import { routerMetricSamples, routerMonitors } from '@/lib/db/schema'
import { hashRouterMonitorToken, parseRouterTimestamp, parseRouterUptime } from '@/lib/router-monitoring'

type TelemetryInput = {
  cpuLoad?: unknown
  freeMemoryBytes?: unknown
  totalMemoryBytes?: unknown
  freeDiskBytes?: unknown
  totalDiskBytes?: unknown
  totalRxBytes?: unknown
  totalTxBytes?: unknown
  activeHotspotUsers?: unknown
  activePppoeUsers?: unknown
  uptime?: unknown
  routerOsVersion?: unknown
  boardName?: unknown
  winboxEnabled?: unknown
  winboxPort?: unknown
  webEnabled?: unknown
  webScheme?: unknown
  webPort?: unknown
}

function nonNegativeInteger(value: unknown, maxValue = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maxValue
    ? value
    : null
}

function optionalLabel(value: unknown) {
  if (typeof value !== 'string') return null
  const label = value.trim()
  return label && label.length <= 80 && /^[a-zA-Z0-9 ._()+-]+$/.test(label) ? label : null
}

function optionalPort(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 65535
    ? value
    : null
}

export async function POST(request: NextRequest) {
  const routerId = request.headers.get('x-router-monitor-id') || ''
  const token = request.headers.get('x-router-monitor-token') || ''
  if (!/^[0-9a-f-]{36}$/i.test(routerId) || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return NextResponse.json({ error: 'Router monitoring credentials are invalid.' }, { status: 401 })
  }

  let input: TelemetryInput
  try {
    input = await request.json() as TelemetryInput
  } catch {
    return NextResponse.json({ error: 'Router telemetry must be valid JSON.' }, { status: 400 })
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return NextResponse.json({ error: 'Router telemetry is invalid.' }, { status: 400 })
  }

  const cpuLoad = nonNegativeInteger(input.cpuLoad, 100)
  const freeMemoryBytes = nonNegativeInteger(input.freeMemoryBytes)
  const totalMemoryBytes = nonNegativeInteger(input.totalMemoryBytes)
  const freeDiskBytes = input.freeDiskBytes === null || input.freeDiskBytes === undefined
    ? null
    : nonNegativeInteger(input.freeDiskBytes)
  const totalDiskBytes = input.totalDiskBytes === null || input.totalDiskBytes === undefined
    ? null
    : nonNegativeInteger(input.totalDiskBytes)
  const totalRxBytes = input.totalRxBytes === undefined ? null : nonNegativeInteger(input.totalRxBytes)
  const totalTxBytes = input.totalTxBytes === undefined ? null : nonNegativeInteger(input.totalTxBytes)
  const activeHotspotUsers = nonNegativeInteger(input.activeHotspotUsers, 1_000_000)
  const activePppoeUsers = nonNegativeInteger(input.activePppoeUsers, 1_000_000)
  const uptimeSeconds = typeof input.uptime === 'string' ? parseRouterUptime(input.uptime) : null
  const winboxEnabled = typeof input.winboxEnabled === 'boolean' ? input.winboxEnabled : null
  const winboxPort = optionalPort(input.winboxPort)
  const webEnabled = typeof input.webEnabled === 'boolean' ? input.webEnabled : null
  const webPort = optionalPort(input.webPort)
  const webScheme = input.webScheme === 'http' || input.webScheme === 'https' ? input.webScheme : null

  const diskMetricsInvalid = (freeDiskBytes === null) !== (totalDiskBytes === null) ||
    (freeDiskBytes !== null && totalDiskBytes !== null &&
      ((totalDiskBytes > 0 && freeDiskBytes > totalDiskBytes) || (totalDiskBytes === 0 && freeDiskBytes > 0)))
  if (cpuLoad === null || freeMemoryBytes === null || totalMemoryBytes === null || totalMemoryBytes === 0 ||
      freeMemoryBytes > totalMemoryBytes || diskMetricsInvalid || totalRxBytes === null || totalTxBytes === null ||
      activeHotspotUsers === null || activePppoeUsers === null || uptimeSeconds === null) {
    return NextResponse.json({ error: 'Router telemetry contains invalid resource or session metrics.' }, { status: 400 })
  }

  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ''
  const sourceIp = isIP(forwardedIp) ? forwardedIp : null
  const sampledAt = new Date()

  try {
    const accepted = await db.transaction(async (tx) => {
      const [monitor] = await tx.select({
        id: routerMonitors.id,
        lastSeenAt: routerMonitors.lastSeenAt,
        tokenHash: routerMonitors.tokenHash,
      }).from(routerMonitors).where(and(
        eq(routerMonitors.id, routerId),
        eq(routerMonitors.enabled, true),
        or(
          eq(routerMonitors.tokenHash, hashRouterMonitorToken(token)),
          and(
            eq(routerMonitors.previousTokenHash, hashRouterMonitorToken(token)),
            gt(routerMonitors.previousTokenExpiresAt, sampledAt),
          ),
        ),
      )).for('update').limit(1)
      if (!monitor) return false

      await tx.insert(routerMetricSamples).values({
        id: randomUUID(),
        routerId: monitor.id,
        sampledAt,
        cpuLoad,
        freeMemoryBytes,
        totalMemoryBytes,
        freeDiskBytes: totalDiskBytes !== null && totalDiskBytes > 0 ? freeDiskBytes : null,
        totalDiskBytes: totalDiskBytes !== null && totalDiskBytes > 0 ? totalDiskBytes : null,
        totalRxBytes,
        totalTxBytes,
        activeHotspotUsers,
        activePppoeUsers,
        uptimeSeconds,
        routerOsVersion: optionalLabel(input.routerOsVersion),
        boardName: optionalLabel(input.boardName),
        winboxEnabled,
        winboxPort: winboxEnabled ? winboxPort : null,
        webEnabled,
        webScheme: webEnabled && webScheme && webPort ? webScheme : null,
        webPort: webEnabled ? webPort : null,
      })
      await tx.update(routerMonitors).set({
        lastSeenAt: sampledAt,
        lastSourceIp: sourceIp,
        previousTokenHash: monitor.tokenHash === hashRouterMonitorToken(token) ? null : undefined,
        previousTokenExpiresAt: monitor.tokenHash === hashRouterMonitorToken(token) ? null : undefined,
      })
        .where(eq(routerMonitors.id, monitor.id))

      const monitorLastSeenAt = parseRouterTimestamp(monitor.lastSeenAt)
      if (!monitorLastSeenAt || monitorLastSeenAt.getTime() < sampledAt.getTime() - 24 * 60 * 60 * 1000) {
        await tx.delete(routerMetricSamples).where(and(
          eq(routerMetricSamples.routerId, monitor.id),
          lt(routerMetricSamples.sampledAt, new Date(sampledAt.getTime() - 35 * 24 * 60 * 60 * 1000)),
        ))
      }
      return true
    })

    if (!accepted) return NextResponse.json({ error: 'Router monitor is disabled or not registered.' }, { status: 401 })
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('Failed to accept router monitoring telemetry', error)
    return NextResponse.json({ error: 'Unable to record router telemetry.' }, { status: 503 })
  }
}

export const dynamic = 'force-dynamic'
