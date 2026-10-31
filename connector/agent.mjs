import { randomUUID } from 'node:crypto'
import {
  automaticBackupName,
  automaticBackupTimestamp,
  automaticBackupsToDelete,
  routerFileTimestamp,
} from './backup-policy.mjs'
import { exposeRouterScriptSource } from './router-script-source.mjs'
import { addPppoeInterfaceCounters, byteCounter } from './session-counters.mjs'

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
let completedResourceResults = []
let pendingTelemetry = null
let lastTelemetryAt = 0
const pollIntervalMs = 1_000
const telemetryIntervalMs = 1_000
const automaticBackupIntervalMs = 24 * 60 * 60 * 1000
const automaticBackupRetryMs = 15 * 60 * 1000
const automaticBackupRetention = 30
const maxRetryDelayMs = 30_000
let retryDelayMs = pollIntervalMs
let nextAutomaticBackupCheckAt = 0

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

async function routerRequest(path, method = 'GET', body, parseResponse = true) {
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
  if (method !== 'DELETE' && parseResponse) return response.json()
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
      downloadBytes: byteCounter(item['bytes-out'] ?? item['tx-byte']),
      uploadBytes: byteCounter(item['bytes-in'] ?? item['rx-byte']),
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

const resourceFields = {
  logs: {
    path: '/log',
    fields: ['.id', 'time', 'topics', 'message'],
  },
  backups: {
    path: '/file',
    fields: ['.id', 'name', 'size', 'creation-time', 'last-modified'],
  },
  scheduler: {
    path: '/system/scheduler',
    fields: ['.id', 'name', 'disabled', 'interval', 'start-date', 'start-time', 'next-run', 'run-count', 'last-started', 'owner'],
  },
  scripts: {
    path: '/system/script',
    fields: ['.id', 'name', 'disabled', 'owner', 'policy', 'run-count', 'last-started', 'dont-require-permissions', 'source'],
  },
}

async function listRouterFiles() {
  const files = await routerRequest('/file')
  if (!Array.isArray(files)) throw new Error('RouterOS returned an invalid file list.')
  return files
}

async function maybeCreateAutomaticBackup() {
  const now = Date.now()
  if (now < nextAutomaticBackupCheckAt) return

  try {
    const files = await listRouterFiles()
    const managedBackups = files
      .filter((file) => typeof file.name === 'string' && automaticBackupTimestamp(file.name) !== null)
      .sort((left, right) => automaticBackupTimestamp(right.name) - automaticBackupTimestamp(left.name))
    const lastBackupAt = managedBackups.length ? automaticBackupTimestamp(managedBackups[0].name) : null
    if (lastBackupAt !== null && now - lastBackupAt < automaticBackupIntervalMs) {
      nextAutomaticBackupCheckAt = lastBackupAt + automaticBackupIntervalMs
      return
    }

    const baseName = automaticBackupName(new Date(now))
    const backupFileName = `${baseName}.backup`
    const backupPassword = process.env.ROUTER_BACKUP_PASSWORD
    await routerRequest('/system/backup/save', 'POST', {
      name: baseName,
      ...(backupPassword ? { password: backupPassword } : {}),
    }, false)
    const updatedFiles = await listRouterFiles()
    if (!updatedFiles.some((file) => file.name === backupFileName)) {
      throw new Error('RouterOS acknowledged the backup command but the dated backup file was not found.')
    }

    nextAutomaticBackupCheckAt = now + automaticBackupIntervalMs
    console.info(`Created automatic router backup ${backupFileName}.`)
    for (const oldBackup of automaticBackupsToDelete(updatedFiles, automaticBackupRetention)) {
      if (typeof oldBackup['.id'] !== 'string' || !oldBackup['.id']) {
        console.error(`Unable to prune old automatic backup ${oldBackup.name}: RouterOS did not return a file ID.`)
        continue
      }
      try {
        await routerRequest(`/file/${encodeURIComponent(oldBackup['.id'])}`, 'DELETE')
        console.info(`Removed automatic router backup outside the ${automaticBackupRetention}-backup retention window.`)
      } catch (error) {
        console.error(`Unable to prune old automatic backup ${oldBackup.name}: ${error instanceof Error ? error.message : 'RouterOS file removal failed.'}`)
      }
    }
  } catch (error) {
    nextAutomaticBackupCheckAt = now + automaticBackupRetryMs
    console.error(`Automatic router backup failed and will be retried: ${error instanceof Error ? error.message : 'RouterOS backup failed.'}`)
  }
}

async function readRouterResource(query) {
  const definition = resourceFields[query.resource]
  if (!definition) throw new Error('The requested RouterOS resource is not supported.')
  const response = query.resource === 'backups'
    ? await listRouterFiles()
    : await routerRequest(definition.path)
  if (!Array.isArray(response)) throw new Error('RouterOS returned an invalid resource list.')
  const sourceByScriptId = new Map()
  if (query.resource === 'scripts') {
    for (const script of response) {
      const source = exposeRouterScriptSource(script)
      if (typeof script['.id'] === 'string' && source !== null) sourceByScriptId.set(script['.id'], source)
    }
  }
  const rows = query.resource === 'backups'
    ? response.filter((row) => typeof row.name === 'string' && /\.(backup|rsc)$/i.test(row.name))
    : response
  const recentRows = query.resource === 'logs'
    ? rows.slice(-50)
    : query.resource === 'backups'
      ? rows.sort((left, right) => routerFileTimestamp(right) - routerFileTimestamp(left)).slice(0, 100)
      : rows.slice(0, 100)
  return recentRows.map((row) => Object.fromEntries(definition.fields.flatMap((field) => {
    if (field === 'source') {
      const source = sourceByScriptId.get(row['.id'])
      return typeof source === 'string' ? [[field, source.slice(0, 4000)]] : []
    }
    const value = row[field]
    if (typeof value === 'string') return [[field, value.slice(0, field === 'message' ? 1800 : 300)]]
    if (typeof value === 'boolean') return [[field, value]]
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return [[field, value]]
    return []
  })))
}

async function pollOnce() {
  const interfaceRequest = routerRequest('/interface/print', 'POST', { stats: '' }).then(
    (interfaces) => ({ interfaces, error: null }),
    (error) => ({ interfaces: null, error }),
  )
  const [hotspot, pppoe, interfaceResult] = await Promise.all([
    routerRequest('/ip/hotspot/active'),
    routerRequest('/ppp/active'),
    interfaceRequest,
  ])
  let sessions = [
    ...mapSessions(hotspot, 'hotspot'),
    ...mapSessions(pppoe, 'pppoe'),
  ]
  if (sessions.some((session) =>
    session.sessionType === 'pppoe' &&
    (session.downloadBytes === null || session.uploadBytes === null))) {
    if (interfaceResult.error) {
      console.error(`Unable to collect PPPoE interface counters: ${interfaceResult.error instanceof Error ? interfaceResult.error.message : 'RouterOS interface statistics failed.'}`)
    } else {
      try {
        sessions = addPppoeInterfaceCounters(sessions, interfaceResult.interfaces)
      } catch (error) {
        console.error(`Unable to collect PPPoE interface counters: ${error instanceof Error ? error.message : 'RouterOS interface statistics failed.'}`)
      }
    }
  }
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
      resourceResults: completedResourceResults,
      ...(pendingTelemetry ? { telemetry: pendingTelemetry } : {}),
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Billing connector request failed (HTTP ${response.status}).`)
  const result = await response.json()
  if (!result || !Array.isArray(result.commands) || !Array.isArray(result.queries)) {
    throw new Error('Billing connector returned an invalid command list.')
  }
  completedCommands = []
  completedResourceResults = []
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

  for (const query of result.queries) {
    try {
      const data = await readRouterResource(query)
      completedResourceResults.push({
        id: query.id,
        claimToken: query.claimToken,
        succeeded: true,
        data,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'RouterOS resource query failed.'
      const status = error instanceof RouterRestError ? error.status : null
      const permanentClientError = status !== null &&
        status >= 400 && status < 500 && ![408, 425, 429].includes(status)
      if (permanentClientError) {
        completedResourceResults.push({
          id: query.id,
          claimToken: query.claimToken,
          succeeded: false,
          errorMessage: message.slice(0, 240),
        })
      } else {
        console.error(`RouterOS resource query ${query.id} will be retried: ${message}`)
      }
    }

    await maybeCreateAutomaticBackup()
  }
}

console.log(`Router connector started for ${process.env.ROUTER_ID}.`)
while (true) {
  const cycleStartedAt = Date.now()
  let delayMs = pollIntervalMs
  try {
    await pollOnce()
    retryDelayMs = pollIntervalMs
    delayMs = Math.max(0, pollIntervalMs - (Date.now() - cycleStartedAt))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Router connector cycle failed.')
    delayMs = retryDelayMs
    retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs)
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}
