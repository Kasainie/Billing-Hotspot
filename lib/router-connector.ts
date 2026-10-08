import { timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import { hashRouterMonitorToken } from './router-monitoring.ts'

export type RouterSessionType = 'hotspot' | 'pppoe'

export type RouterConnectorSession = {
  sessionType: RouterSessionType
  routerSessionId: string
  username: string
  macAddress: string | null
  ipAddress: string | null
  callerId: string | null
  uptimeSeconds: number | null
}

export type RouterConnectorCommandResult = {
  id: string
  claimToken: string
  succeeded: boolean
  errorMessage: string | null
}

export type RouterConnectorTelemetry = {
  sampleId: string
  cpuLoad: number
  freeMemoryBytes: number
  totalMemoryBytes: number
  freeDiskBytes: number | null
  totalDiskBytes: number | null
  totalRxBytes: number
  totalTxBytes: number
  activeHotspotUsers: number
  activePppoeUsers: number
  uptimeSeconds: number
  routerOsVersion: string | null
  boardName: string | null
}

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(trimmed)
    ? trimmed
    : null
}

function nonNegativeInteger(value: unknown, maxValue = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maxValue
    ? value
    : null
}

function optionalLabel(value: unknown) {
  if (value === null || value === undefined) return null
  return optionalText(value, 80)
}

export function parseRouterConnectorTelemetry(value: unknown): RouterConnectorTelemetry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const telemetry = value as Record<string, unknown>
  const sampleId = telemetry.sampleId
  const cpuLoad = nonNegativeInteger(telemetry.cpuLoad, 100)
  const freeMemoryBytes = nonNegativeInteger(telemetry.freeMemoryBytes)
  const totalMemoryBytes = nonNegativeInteger(telemetry.totalMemoryBytes)
  const freeDiskBytes = telemetry.freeDiskBytes === null
    ? null
    : nonNegativeInteger(telemetry.freeDiskBytes)
  const totalDiskBytes = telemetry.totalDiskBytes === null
    ? null
    : nonNegativeInteger(telemetry.totalDiskBytes)
  const totalRxBytes = nonNegativeInteger(telemetry.totalRxBytes)
  const totalTxBytes = nonNegativeInteger(telemetry.totalTxBytes)
  const activeHotspotUsers = nonNegativeInteger(telemetry.activeHotspotUsers, 1_000_000)
  const activePppoeUsers = nonNegativeInteger(telemetry.activePppoeUsers, 1_000_000)
  const uptimeSeconds = nonNegativeInteger(telemetry.uptimeSeconds)
  const routerOsVersion = optionalLabel(telemetry.routerOsVersion)
  const boardName = optionalLabel(telemetry.boardName)
  const diskValuesInvalid = (freeDiskBytes === null) !== (totalDiskBytes === null) ||
    (freeDiskBytes !== null && totalDiskBytes !== null && freeDiskBytes > totalDiskBytes)

  if (typeof sampleId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sampleId) ||
      cpuLoad === null || freeMemoryBytes === null || totalMemoryBytes === null ||
      totalMemoryBytes === 0 || freeMemoryBytes > totalMemoryBytes || diskValuesInvalid ||
      totalRxBytes === null || totalTxBytes === null ||
      activeHotspotUsers === null || activePppoeUsers === null || uptimeSeconds === null ||
      (telemetry.routerOsVersion !== null && telemetry.routerOsVersion !== undefined && !routerOsVersion) ||
      (telemetry.boardName !== null && telemetry.boardName !== undefined && !boardName)) return null

  return {
    sampleId,
    cpuLoad,
    freeMemoryBytes,
    totalMemoryBytes,
    freeDiskBytes,
    totalDiskBytes,
    totalRxBytes,
    totalTxBytes,
    activeHotspotUsers,
    activePppoeUsers,
    uptimeSeconds,
    routerOsVersion,
    boardName,
  }
}

export function isRouterSessionType(value: unknown): value is RouterSessionType {
  return value === 'hotspot' || value === 'pppoe'
}

export function isRouterSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^\*[0-9a-f]{1,16}$/i.test(value)
}

export function parseRouterConnectorSessions(value: unknown): RouterConnectorSession[] | null {
  if (!Array.isArray(value) || value.length > 1000) return null
  const sessions: RouterConnectorSession[] = []
  const identities = new Set<string>()

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const session = item as Record<string, unknown>
    const { sessionType, routerSessionId } = session
    const username = optionalText(session.username, 128)
    if (!isRouterSessionType(sessionType) || !isRouterSessionId(routerSessionId) || !username) return null
    const identity = `${sessionType}:${routerSessionId}`
    if (identities.has(identity)) return null
    identities.add(identity)

    const macAddress = optionalText(session.macAddress, 64)
    const rawIpAddress = optionalText(session.ipAddress, 64)
    const callerId = optionalText(session.callerId, 128)
    const uptimeSeconds = session.uptimeSeconds === null || session.uptimeSeconds === undefined
      ? null
      : typeof session.uptimeSeconds === 'number' &&
          Number.isSafeInteger(session.uptimeSeconds) &&
          session.uptimeSeconds >= 0
        ? session.uptimeSeconds
        : Number.NaN
    if ((session.macAddress !== null && session.macAddress !== undefined && !macAddress) ||
        (session.ipAddress !== null && session.ipAddress !== undefined && (!rawIpAddress || !isIP(rawIpAddress))) ||
        (session.callerId !== null && session.callerId !== undefined && !callerId) ||
        Number.isNaN(uptimeSeconds)) return null

    sessions.push({
      sessionType,
      routerSessionId,
      username,
      macAddress,
      ipAddress: rawIpAddress,
      callerId,
      uptimeSeconds,
    })
  }

  return sessions
}

export function parseRouterConnectorCommandResults(value: unknown): RouterConnectorCommandResult[] | null {
  if (!Array.isArray(value) || value.length > 50) return null
  const results: RouterConnectorCommandResult[] = []
  const seenIds = new Set<string>()

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const result = item as Record<string, unknown>
    if (typeof result.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.id) ||
        typeof result.claimToken !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.claimToken) ||
        typeof result.succeeded !== 'boolean' ||
        seenIds.has(result.id)) return null
    const errorMessage = result.errorMessage === null || result.errorMessage === undefined
      ? null
      : optionalText(result.errorMessage, 240)
    if (result.errorMessage !== null && result.errorMessage !== undefined && !errorMessage) return null
    seenIds.add(result.id)
    results.push({ id: result.id, claimToken: result.claimToken, succeeded: result.succeeded, errorMessage })
  }
  return results
}

export function matchesRouterConnectorToken(token: string, expectedHash: string | null) {
  if (!expectedHash || !/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[0-9a-f]{64}$/.test(expectedHash)) return false
  const actual = Buffer.from(hashRouterMonitorToken(token), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return timingSafeEqual(actual, expected)
}
