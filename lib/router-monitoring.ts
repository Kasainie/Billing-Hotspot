import { createHash } from 'node:crypto'

export const ROUTER_ONLINE_TIMEOUT_MS = 90_000

export function hashRouterMonitorToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function getRouterWebConsoleUrl({
  webEnabled,
  webScheme,
  webPort,
  wireguardIp,
}: {
  webEnabled: boolean | null
  webScheme: 'http' | 'https' | null
  webPort: number | null
  wireguardIp: string | null
}) {
  if (webEnabled !== true || !webScheme || !webPort || !wireguardIp) return null
  const octets = wireguardIp.split('.')
  if (octets.length !== 4 ||
      octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255 || String(Number(octet)) !== octet)) return null
  const [firstOctet, secondOctet] = octets.map(Number)
  const isPrivateAddress = firstOctet === 10 ||
    (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
    (firstOctet === 192 && secondOctet === 168)
  if (!isPrivateAddress) return null
  if (!Number.isSafeInteger(webPort) || webPort < 1 || webPort > 65535) return null
  return `${webScheme}://${wireguardIp}:${webPort}`
}

export function parseRouterTimestamp(value: Date | string | null) {
  if (value === null) return null
  const timestamp = value instanceof Date ? value : new Date(value)
  return Number.isFinite(timestamp.getTime()) ? timestamp : null
}

export function isRouterOnline(lastSeenAt: Date | string | null, now: number) {
  const heartbeatTime = parseRouterTimestamp(lastSeenAt)?.getTime()
  return heartbeatTime !== undefined &&
    heartbeatTime <= now &&
    now - heartbeatTime <= ROUTER_ONLINE_TIMEOUT_MS
}

export function getLiveRouterUptimeSeconds(
  uptimeSeconds: number | null,
  lastSeenAt: Date | string | null,
  now: number,
  online: boolean,
) {
  if (uptimeSeconds === null) return null
  const heartbeatTime = parseRouterTimestamp(lastSeenAt)?.getTime()
  const elapsedSeconds = online && heartbeatTime !== undefined
    ? Math.max(0, Math.floor((now - heartbeatTime) / 1_000))
    : 0
  return uptimeSeconds + elapsedSeconds
}

export function parseRouterUptime(value: string) {
  const compact = value.match(/^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i)
  if (compact && compact.slice(1).some(Boolean)) {
    const [, weeks = '0', days = '0', hours = '0', minutes = '0', seconds = '0'] = compact
    return Number(weeks) * 604800 + Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
  }

  const clock = value.match(/^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+):)?(\d{1,2}):(\d{2})$/i)
  if (!clock) return null
  const [, weeks = '0', days = '0', hours = '0', minutes, seconds] = clock
  return Number(weeks) * 604800 + Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}

export function calculateRouterHealth({
  online,
  cpuLoad,
  freeMemoryBytes,
  totalMemoryBytes,
  freeDiskBytes,
  totalDiskBytes,
}: {
  online: boolean
  cpuLoad: number | null
  freeMemoryBytes: number | null
  totalMemoryBytes: number | null
  freeDiskBytes: number | null
  totalDiskBytes: number | null
}) {
  if (!online || cpuLoad === null) return null

  const memoryUsed = totalMemoryBytes && freeMemoryBytes !== null
    ? Math.max(0, Math.min(100, (1 - freeMemoryBytes / totalMemoryBytes) * 100))
    : null
  const diskUsed = totalDiskBytes && freeDiskBytes !== null
    ? Math.max(0, Math.min(100, (1 - freeDiskBytes / totalDiskBytes) * 100))
    : null
  const score = Math.round(100
    - Math.max(0, cpuLoad - 60) * 0.6
    - Math.max(0, (memoryUsed ?? 0) - 75) * 0.5
    - Math.max(0, (diskUsed ?? 0) - 80) * 0.5)
  return Math.max(0, Math.min(100, score))
}
