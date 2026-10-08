import { randomUUID } from 'node:crypto'

const required = [
  'APP_URL',
  'ROUTER_ID',
  'ROUTER_CONNECTOR_TOKEN',
  'ROUTER_REST_URL',
  'ROUTER_USERNAME',
  'ROUTER_PASSWORD',
]

for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`Missing required connector setting: ${name}`)
}

const appUrl = new URL(process.env.APP_URL)
const routerRestUrl = new URL(process.env.ROUTER_REST_URL)
if (appUrl.protocol !== 'https:' || routerRestUrl.protocol !== 'https:' ||
    !/^\/rest\/?$/.test(routerRestUrl.pathname) || routerRestUrl.search || routerRestUrl.hash) {
  throw new Error('APP_URL and ROUTER_REST_URL must be HTTPS origins; ROUTER_REST_URL must end in /rest.')
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(process.env.ROUTER_ID) ||
    !/^[A-Za-z0-9_-]{43}$/.test(process.env.ROUTER_CONNECTOR_TOKEN)) {
  throw new Error('The router ID or connector token is invalid.')
}

const routerBase = routerRestUrl.toString().replace(/\/$/, '')
const connectorEndpoint = new URL(`/api/routers/${process.env.ROUTER_ID}/connector`, appUrl)
const basicAuthorization = `Basic ${Buffer.from(`${process.env.ROUTER_USERNAME}:${process.env.ROUTER_PASSWORD}`).toString('base64')}`
let completedCommands = []
let pendingTelemetry = null
let lastTelemetryAt = 0
const pollIntervalMs = 5_000
const telemetryIntervalMs = 60_000
const maxRetryDelayMs = 30_000
let retryDelayMs = pollIntervalMs

class RouterRestError extends Error {
  constructor(status) {
    super(`RouterOS REST request failed (HTTP ${status}).`)
    this.status = status
  }
}

function parseUptime(value) {
  if (typeof value !== 'string') return null
  const compact = /^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  if (compact && compact.slice(1).some(Boolean)) {
    const [, weeks = '0', days = '0', hours = '0', minutes = '0', seconds = '0'] = compact
    return Number(weeks) * 604800 + Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
  }
  const clock = /^(?:(\d+)d)?(\d{1,2}):(\d{2}):(\d{2})$/.exec(value)
  if (!clock) return null
  const [, days = '0', hours, minutes, seconds] = clock
  return Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function routerRequest(path, method = 'GET', body) {
  const response = await fetch(`${routerBase}${path}`, {
    method,
    headers: {
      authorization: basicAuthorization,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new RouterRestError(response.status)
  if (method !== 'DELETE') return response.json()
  return null
}

function firstRow(value, label) {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`RouterOS returned invalid ${label} data.`)
  }
  return row
}

function nonNegativeInteger(value, label) {
  const textValue = typeof value === 'number' ? String(value) : value
  if (typeof textValue !== 'string' || !/^\d+$/.test(textValue)) {
    throw new Error(`RouterOS returned invalid ${label}.`)
  }
  const parsed = Number(textValue)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`RouterOS returned invalid ${label}.`)
  return parsed
}

async function collectTelemetry(sessions) {
  const [resourceResponse, interfaceResponse] = await Promise.all([
    routerRequest('/system/resource'),
    routerRequest('/interface/ethernet/print', 'POST', { stats: '' }),
  ])
  const resource = firstRow(resourceResponse, 'system resource')
  if (!Array.isArray(interfaceResponse)) throw new Error('RouterOS returned invalid Ethernet statistics.')

  let totalRxBytes = 0
  let totalTxBytes = 0
  for (const item of interfaceResponse) {
    totalRxBytes += nonNegativeInteger(item['rx-byte'], 'Ethernet receive counter')
    totalTxBytes += nonNegativeInteger(item['tx-byte'], 'Ethernet transmit counter')
    if (!Number.isSafeInteger(totalRxBytes) || !Number.isSafeInteger(totalTxBytes)) {
      throw new Error('RouterOS Ethernet counters exceed the supported range.')
    }
  }

  const freeDisk = resource['free-hdd-space']
  const totalDisk = resource['total-hdd-space']
  const freeDiskBytes = /^\d+$/.test(String(freeDisk)) ? Number(freeDisk) : null
  const totalDiskBytes = /^\d+$/.test(String(totalDisk)) ? Number(totalDisk) : null
  const diskMetricsAvailable = Number.isSafeInteger(freeDiskBytes) &&
    Number.isSafeInteger(totalDiskBytes) &&
    freeDiskBytes >= 0 &&
    totalDiskBytes >= freeDiskBytes
  return {
    sampleId: randomUUID(),
    cpuLoad: nonNegativeInteger(resource['cpu-load'], 'CPU load'),
    freeMemoryBytes: nonNegativeInteger(resource['free-memory'], 'free memory'),
    totalMemoryBytes: nonNegativeInteger(resource['total-memory'], 'total memory'),
    freeDiskBytes: diskMetricsAvailable ? freeDiskBytes : null,
    totalDiskBytes: diskMetricsAvailable ? totalDiskBytes : null,
    totalRxBytes,
    totalTxBytes,
    activeHotspotUsers: sessions.filter((session) => session.sessionType === 'hotspot').length,
    activePppoeUsers: sessions.filter((session) => session.sessionType === 'pppoe').length,
    uptimeSeconds: nonNegativeInteger(parseUptime(resource.uptime), 'uptime'),
    routerOsVersion: text(resource.version),
    boardName: text(resource['board-name']),
  }
}

function mapSessions(value, sessionType) {
  if (!Array.isArray(value)) throw new Error(`RouterOS returned an invalid ${sessionType} session list.`)
  return value.map((item) => {
    const routerSessionId = text(item['.id'])
    const username = text(sessionType === 'hotspot' ? item.user : item.name)
    if (!routerSessionId || !username) throw new Error(`RouterOS returned an incomplete ${sessionType} session.`)
    const rawAddress = text(item.address)
    const uptime = parseUptime(item.uptime)
    return {
      sessionType,
      routerSessionId,
      username,
      macAddress: sessionType === 'hotspot' ? text(item['mac-address']) : null,
      ipAddress: rawAddress,
      callerId: sessionType === 'pppoe' ? text(item['caller-id']) : null,
      uptimeSeconds: uptime,
    }
  })
}

async function disconnect(command, activeSessions) {
  const endpoint = command.sessionType === 'hotspot'
    ? '/ip/hotspot/active'
    : command.sessionType === 'pppoe'
      ? '/ppp/active'
      : null
  if (!endpoint || typeof command.routerSessionId !== 'string' || !/^\*[0-9a-f]{1,16}$/i.test(command.routerSessionId)) {
    throw new Error('The requested RouterOS session is invalid.')
  }
  const stillActive = activeSessions.some((session) =>
    session.sessionType === command.sessionType &&
    session.routerSessionId === command.routerSessionId &&
    session.username === command.username)
  if (!stillActive) return
  try {
    await routerRequest(`${endpoint}/${encodeURIComponent(command.routerSessionId)}`, 'DELETE')
  } catch (error) {
    if (error instanceof RouterRestError && error.status === 404) return
    throw error
  }
}

async function pollOnce() {
  const [hotspot, pppoe] = await Promise.all([
    routerRequest('/ip/hotspot/active'),
    routerRequest('/ppp/active'),
  ])
  const sessions = [
    ...mapSessions(hotspot, 'hotspot'),
    ...mapSessions(pppoe, 'pppoe'),
  ]
  const now = Date.now()
  if (!pendingTelemetry && now - lastTelemetryAt >= telemetryIntervalMs) {
    try {
      pendingTelemetry = await collectTelemetry(sessions)
      lastTelemetryAt = now
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Router telemetry collection failed.')
    }
  }
  const response = await fetch(connectorEndpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.ROUTER_CONNECTOR_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sessions,
      commandResults: completedCommands,
      ...(pendingTelemetry ? { telemetry: pendingTelemetry } : {}),
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Billing connector request failed (HTTP ${response.status}).`)
  const result = await response.json()
  if (!result || !Array.isArray(result.commands)) throw new Error('Billing connector returned an invalid command list.')
  completedCommands = []
  if (pendingTelemetry) pendingTelemetry = null

  for (const command of result.commands) {
    try {
      await disconnect(command, sessions)
      completedCommands.push({ id: command.id, claimToken: command.claimToken, succeeded: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'RouterOS disconnect command failed.'
      const status = error instanceof RouterRestError ? error.status : null
      const permanentClientError = status !== null &&
        status >= 400 && status < 500 && ![408, 425, 429].includes(status)
      if (permanentClientError) {
        completedCommands.push({
          id: command.id,
          claimToken: command.claimToken,
          succeeded: false,
          errorMessage: message.slice(0, 240),
        })
      } else {
        console.error(`Disconnect command ${command.id} will be retried: ${message}`)
      }
    }
  }
}

console.log(`Router connector started for ${process.env.ROUTER_ID}.`)
while (true) {
  let delayMs = pollIntervalMs
  try {
    await pollOnce()
    retryDelayMs = pollIntervalMs
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Router connector cycle failed.')
    delayMs = retryDelayMs
    retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs)
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}
