import { createHash } from 'node:crypto'

export function hashRouterMonitorToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function parseRouterTimestamp(value: Date | string | null) {
  if (value === null) return null
  const timestamp = value instanceof Date ? value : new Date(value)
  return Number.isFinite(timestamp.getTime()) ? timestamp : null
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
