'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertCircle, ArrowLeft, CalendarClock, CheckCircle2, Clock3, Code2, Copy, Cpu, CreditCard, FileArchive, FileText, HardDrive, MemoryStick, RefreshCw, Router as RouterIcon, ScrollText, Thermometer, Wifi, X } from 'lucide-react'
import { calculateRouterHealth, getLiveRouterUptimeSeconds } from '@/lib/router-monitoring'

export type RouterMonitorRecord = {
  id: string
  siteId: string
  siteName: string
  monitored: boolean
  routerName: string
  location: string
  status: 'online' | 'offline' | 'not_configured'
  lastSeenAt: string | null
  connectorEnabled: boolean
  connectorLastSeenAt: string | null
  lastSourceIp: string | null
  metricsUpdatedAt: string | null
  cpuLoad: number | null
  freeMemoryBytes: number | null
  totalMemoryBytes: number | null
  freeDiskBytes: number | null
  totalDiskBytes: number | null
  memoryUsedPercent: number | null
  diskUsedPercent: number | null
  activeHotspotUsers: number | null
  activePppoeUsers: number | null
  uptimeSeconds: number | null
  routerOsVersion: string | null
  boardName: string | null
  winboxEnabled: boolean | null
  winboxPort: number | null
  webEnabled: boolean | null
  webScheme: 'http' | 'https' | null
  webPort: number | null
  wireguardIp: string | null
  health: number | null
}

type RouterRemoteSession = {
  sessionType: 'hotspot' | 'pppoe'
  routerSessionId: string
  username: string
  macAddress: string | null
  ipAddress: string | null
  callerId: string | null
  uptimeSeconds: number | null
  observedAt: string
}

type RouterSessionsResponse = {
  connected: boolean
  connectorEnabled: boolean
  connectorLastSeenAt: string | null
  sessions: RouterRemoteSession[]
  error?: string
}

export type RouterConnectorEnrollment = {
  routerId: string
  routerName: string
  appUrl: string
  token: string
}

type MetricSample = {
  sampledAt: string
  cpuLoad: number
  freeMemoryBytes: number
  totalMemoryBytes: number
  freeDiskBytes: number | null
  totalDiskBytes: number | null
  memoryUsedPercent: number | null
  diskUsedPercent: number | null
  totalRxBytes: number | null
  totalTxBytes: number | null
  activeHotspotUsers: number
  activePppoeUsers: number
  uptimeSeconds: number
  routerOsVersion: string | null
  boardName: string | null
  temperatureCelsius: number | null
}

type MetricsResponse = { samples: MetricSample[]; error?: string }
export type RouterMonitorTab = 'System' | 'Reports' | 'Users' | 'Payments' | 'Events' | 'Logs' | 'Diagnosis' | 'Backups' | 'Scheduler' | 'Script'

type RouterResourceName = 'logs' | 'backups' | 'scheduler' | 'scripts'
type RouterResourceRecord = Record<string, string | number | boolean | null>
type RouterSummary = {
  registeredUsers: number
  dataBytesThisMonth: number | null
  uptimePercent30d: number | null
  revenueMtd: number
  paidTransactionsMtd: number
  payments: Array<{
    id: string
    paidAt: string
    amount: number
    method: string
    reference: string | null
    subscriber: string
    source: string
  }>
}

type RouterResourceQuery = {
  queryId: string
  status: 'queued' | 'processing' | 'succeeded' | 'failed'
  result: RouterResourceRecord[] | null
  errorMessage: string | null
  completedAt: string | null
}

type DiagnosisStatus = 'passed' | 'issue' | 'unknown'
type DiagnosisFilter = 'issues' | 'all' | 'passed'

const routerResourceByTab: Partial<Record<RouterMonitorTab, RouterResourceName>> = {
  Logs: 'logs',
  Backups: 'backups',
  Scheduler: 'scheduler',
  Script: 'scripts',
}

const ranges = [
  { id: '1h', label: '1h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '1m' },
] as const

function formatBytes(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let amount = value
  let unit = 0
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024
    unit += 1
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: unit < 2 ? 0 : 1 }).format(amount)} ${units[unit]}`
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor(seconds % 86400 / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return [days ? `${days}d` : '', `${hours}h`, `${minutes}m`, `${remainingSeconds}s`].filter(Boolean).join(' ')
}

function formatSampleTime(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '—'
}

function LineChart({ title, subtitle, icon: Icon, values, color = '#ff8a18', secondaryValues, secondaryColor = '#737b80', primaryLabel, secondaryLabel, unit = '%', startTime, endTime }: {
  title: string
  subtitle: string
  icon: typeof Cpu
  values: number[]
  color?: string
  secondaryValues?: number[]
  secondaryColor?: string
  primaryLabel?: string
  secondaryLabel?: string
  unit?: string
  startTime?: string
  endTime?: string
}) {
  const maximum = unit === '%' ? 100 : Math.max(...values, ...(secondaryValues || []), 1)
  const minimum = 0
  const scaleSpan = Math.max(maximum - minimum, 1)
  const yTicks = [4, 3, 2, 1, 0].map((step) => {
    const value = minimum + (scaleSpan * step) / 4
    const formatted = unit === 'Mbps' || unit === 'Mb/s'
      ? `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`
      : `${Math.round(value)}${unit === '%' ? '%' : ''}`
    return { value, y: 152 - (step / 4) * 128, formatted }
  })
  const xTicks = [0, 1, 2, 3, 4].map((step) => ({
    x: 30 + (step / 4) * 580,
    index: values.length < 2 ? 0 : Math.round((values.length - 1) * step / 4),
  }))

  const points = useMemo(() => {
    if (!values.length) return ''
    const minimum = 0
    const maximum = unit === '%' ? 100 : Math.max(...values, ...(secondaryValues || []), 1)
    const span = Math.max(maximum - minimum, 1)
    return values.map((value, index) => `${values.length < 2 ? 320 : 30 + index / (values.length - 1) * 580},${152 - ((value - minimum) / span) * 128}`).join(' ')
  }, [secondaryValues, unit, values])
  const secondaryPoints = useMemo(() => {
    if (!secondaryValues?.length) return ''
    const maximum = unit === '%' ? 100 : Math.max(...values, ...secondaryValues, 1)
    const minimum = 0
    const span = Math.max(maximum - minimum, 1)
    return secondaryValues.map((value, index) => `${secondaryValues.length < 2 ? 320 : 30 + index / (secondaryValues.length - 1) * 580},${152 - ((value - minimum) / span) * 128}`).join(' ')
  }, [secondaryValues, unit, values])

  const formatTimeTick = (step: number) => {
    if (!startTime || !endTime) return ''
    const start = new Date(startTime).getTime()
    const end = new Date(endTime).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end)) return ''
    return new Date(start + ((end - start) * step) / 4).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const latestPrimary = values.at(-1)
  const latestSecondary = secondaryValues?.at(-1)
  const latestPrimaryY = latestPrimary == null ? 152 : 152 - (latestPrimary / scaleSpan) * 128
  const latestSecondaryY = latestSecondary == null ? 152 : 152 - (latestSecondary / scaleSpan) * 128
  const latestLabelsOverlap = latestSecondary != null && Math.abs(latestPrimaryY - latestSecondaryY) < 18

  return (
    <section className="router-monitor-chart panel">
      <div className="router-monitor-chart-heading"><div><Icon size={15} /><strong>{title}</strong></div><span>{subtitle}</span></div>
      {values.length < 2
        ? <div className="router-chart-empty">{values.length ? 'Collecting samples…' : 'No monitoring history in this time range yet.'}</div>
        : <div className="router-chart-plot">
          <svg viewBox="0 0 640 180" role="img" aria-label={`${title} over ${subtitle}`}>
            {yTicks.map((tick) => (
              <g key={tick.formatted}>
                <line x1="30" x2="610" y1={tick.y} y2={tick.y} className="router-chart-horizontal-grid" />
                <text x="24" y={tick.y + 3} textAnchor="end" className="router-chart-y-label">{tick.formatted}</text>
              </g>
            ))}
            {xTicks.map((tick, index) => (
              <g key={index}>
                <line x1={tick.x} x2={tick.x} y1="24" y2="152" className="router-chart-vertical-grid" />
                {formatTimeTick(index) && <text x={tick.x} y="164" textAnchor={index === 0 ? 'start' : 'middle'} transform={index === 0 ? undefined : `rotate(-35 ${tick.x} 164)`} className="router-chart-x-label">{formatTimeTick(index)}</text>}
              </g>
            ))}
            <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {secondaryPoints && <polyline points={secondaryPoints} fill="none" stroke={secondaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
            {latestPrimary != null && <><circle cx="610" cy={latestPrimaryY} r="4" fill={color} stroke="#fff" strokeWidth="2" /><text x="604" y={Math.max(16, latestPrimaryY - (latestLabelsOverlap ? 14 : 8))} textAnchor="end" className="router-chart-value-label" fill={color}>{primaryLabel ? `${primaryLabel}: ` : ''}{latestPrimary.toFixed(unit === '%' ? 0 : 1)} {unit}</text></>}
            {latestSecondary != null && <><circle cx="610" cy={latestSecondaryY} r="3.5" fill={secondaryColor} stroke="#fff" strokeWidth="2" /><text x="604" y={Math.min(148, latestSecondaryY + (latestLabelsOverlap ? 16 : 16))} textAnchor="end" className="router-chart-value-label" fill={secondaryColor}>{secondaryLabel ? `${secondaryLabel}: ` : ''}{latestSecondary.toFixed(1)} {unit}</text></>}
          </svg>
        </div>}
    </section>
  )
}

export function RouterMonitorDetail({
  router,
  onBack,
  onReprovision,
  onEnableConnector,
  onRemove,
  initialTab = 'System',
}: {
  router: RouterMonitorRecord
  onBack: () => void
  onReprovision: () => void
  onEnableConnector: () => Promise<RouterConnectorEnrollment>
  onRemove: () => Promise<void>
  initialTab?: RouterMonitorTab
}) {
  const [range, setRange] = useState<(typeof ranges)[number]['id']>('1h')
  const [tab, setTab] = useState<RouterMonitorTab>(initialTab)
  const [samples, setSamples] = useState<MetricSample[]>([])
  const [summary, setSummary] = useState<RouterSummary | null>(null)
  const [summaryError, setSummaryError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null)
  const [liveClock, setLiveClock] = useState(() => Date.now())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [remoteSessions, setRemoteSessions] = useState<RouterRemoteSession[]>([])
  const [connectorConnected, setConnectorConnected] = useState(false)
  const [connectorLastSeenAt, setConnectorLastSeenAt] = useState<string | null>(router.connectorLastSeenAt)
  const [loadingRemoteSessions, setLoadingRemoteSessions] = useState(false)
  const [remoteSessionError, setRemoteSessionError] = useState('')
  const [remoteSessionMessage, setRemoteSessionMessage] = useState('')
  const [disconnectingSession, setDisconnectingSession] = useState('')
  const [enablingConnector, setEnablingConnector] = useState(false)
  const [connectorEnrollment, setConnectorEnrollment] = useState<RouterConnectorEnrollment | null>(null)
  const [connectorEnrollmentError, setConnectorEnrollmentError] = useState('')
  const [copiedConnectorToken, setCopiedConnectorToken] = useState(false)
  const [hotspotRefreshScript, setHotspotRefreshScript] = useState('')
  const [hotspotRefreshLoading, setHotspotRefreshLoading] = useState(false)
  const [hotspotRefreshError, setHotspotRefreshError] = useState('')
  const [hotspotRefreshCopied, setHotspotRefreshCopied] = useState(false)
  const [diagnosisFilter, setDiagnosisFilter] = useState<DiagnosisFilter>('issues')
  const [resourceData, setResourceData] = useState<Partial<Record<RouterResourceName, RouterResourceQuery>>>({})
  const [resourceLoading, setResourceLoading] = useState<RouterResourceName | null>(null)
  const [resourceError, setResourceError] = useState('')
  const loadInFlight = useRef(false)

  useEffect(() => {
    const tick = () => setLiveClock(Date.now())
    const interval = window.setInterval(tick, 1_000)
    return () => window.clearInterval(interval)
  }, [])

  const loadMetrics = useCallback(async () => {
    if (!router.monitored) {
      setSamples([])
      setLoading(false)
      return
    }
    if (loadInFlight.current) return
    loadInFlight.current = true
    setRefreshing(true)
    setError('')
    try {
      const response = await fetch(`/api/routers/${encodeURIComponent(router.id)}/metrics?range=${range}`, { cache: 'no-store' })
      const result = await response.json() as MetricsResponse
      if (!response.ok) throw new Error(result.error || 'Unable to load router monitoring history.')
      setSamples(result.samples)
      setLastRefreshedAt(Date.now())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load router monitoring history.')
    } finally {
      setLoading(false)
      setRefreshing(false)
      loadInFlight.current = false
    }
  }, [range, router.id, router.monitored])

  const loadSummary = useCallback(async () => {
    if (!router.monitored) return
    setSummaryError('')
    try {
      const response = await fetch(`/api/routers/${encodeURIComponent(router.id)}/summary`, { cache: 'no-store' })
      const result = await response.json() as RouterSummary & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to load router business data.')
      setSummary(result)
    } catch (reason) {
      setSummaryError(reason instanceof Error ? reason.message : 'Unable to load router business data.')
    }
  }, [router.id, router.monitored])

  const loadRouterResource = useCallback(async (resource: RouterResourceName) => {
    setResourceLoading(resource)
    setResourceError('')
    try {
      const baseUrl = `/api/routers/${encodeURIComponent(router.id)}/resources`
      const createResponse = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resource }),
      })
      const created = await createResponse.json() as { queryId?: string; error?: string }
      if (!createResponse.ok || !created.queryId) {
        throw new Error(created.error || 'Unable to request live RouterOS data.')
      }

      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500))
        const response = await fetch(`${baseUrl}?queryId=${encodeURIComponent(created.queryId)}`, { cache: 'no-store' })
        const query = await response.json() as RouterResourceQuery & { error?: string }
        if (!response.ok) throw new Error(query.error || 'Unable to read the RouterOS query status.')
        if (query.status === 'succeeded') {
          setResourceData((current) => ({ ...current, [resource]: query }))
          return
        }
        if (query.status === 'failed') throw new Error(query.errorMessage || 'RouterOS could not return this resource.')
      }
      throw new Error('RouterOS has not returned this data yet. Check that the connector is online and refresh to try again.')
    } catch (reason) {
      setResourceError(reason instanceof Error ? reason.message : 'Unable to load the RouterOS resource.')
    } finally {
      setResourceLoading(null)
    }
  }, [router.id])

  const loadRouterSessions = useCallback(async () => {
    if (!router.monitored) return
    setLoadingRemoteSessions(true)
    setRemoteSessionError('')
    try {
      const response = await fetch(`/api/routers/${encodeURIComponent(router.id)}/sessions`, { cache: 'no-store' })
      const result = await response.json() as RouterSessionsResponse
      if (!response.ok) throw new Error(result.error || 'Unable to load active router sessions.')
      setRemoteSessions(result.sessions)
      setConnectorConnected(result.connected)
      setConnectorLastSeenAt(result.connectorLastSeenAt)
    } catch (reason) {
      setRemoteSessionError(reason instanceof Error ? reason.message : 'Unable to load active router sessions.')
    } finally {
      setLoadingRemoteSessions(false)
    }
  }, [router.id, router.monitored])

  useEffect(() => {
    void loadMetrics()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadMetrics()
    }, 1_000)
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void loadMetrics()
    }
    document.addEventListener('visibilitychange', refreshOnFocus)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [loadMetrics])

  useEffect(() => {
    void loadSummary()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadSummary()
    }, 1_000)
    return () => window.clearInterval(interval)
  }, [loadSummary])

  useEffect(() => {
    const resource = routerResourceByTab[tab]
    if (resource) void loadRouterResource(resource)
  }, [loadRouterResource, tab])

  useEffect(() => {
    if (tab !== 'Users') return
    void loadRouterSessions()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadRouterSessions()
    }, 10_000)
    return () => window.clearInterval(interval)
  }, [loadRouterSessions, tab])

  const latest = samples.at(-1)
  const liveUptimeSeconds = getLiveRouterUptimeSeconds(
    router.uptimeSeconds,
    router.lastSeenAt,
    liveClock,
    router.status === 'online',
  )
  const deleteRouter = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      await onRemove()
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Unable to delete router monitoring.')
      setDeleting(false)
    }
  }
  const enableConnector = async () => {
    setEnablingConnector(true)
    setConnectorEnrollmentError('')
    setCopiedConnectorToken(false)
    try {
      setConnectorEnrollment(await onEnableConnector())
      setTab('Users')
    } catch (reason) {
      setConnectorEnrollmentError(reason instanceof Error ? reason.message : 'Unable to enable the router API connector.')
    } finally {
      setEnablingConnector(false)
    }
  }
  const disconnectSession = async (remoteSession: RouterRemoteSession) => {
    if (!window.confirm(`Disconnect ${remoteSession.username} from ${remoteSession.sessionType === 'hotspot' ? 'Hotspot' : 'PPPoE'}?`)) return
    setDisconnectingSession(`${remoteSession.sessionType}:${remoteSession.routerSessionId}`)
    setRemoteSessionError('')
    setRemoteSessionMessage('')
    try {
      const response = await fetch(`/api/routers/${encodeURIComponent(router.id)}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionType: remoteSession.sessionType,
          routerSessionId: remoteSession.routerSessionId,
        }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to queue the session disconnect.')
      setRemoteSessionMessage(`Disconnect queued for ${remoteSession.username}.`)
    } catch (reason) {
      setRemoteSessionError(reason instanceof Error ? reason.message : 'Unable to queue the session disconnect.')
    } finally {
      setDisconnectingSession('')
    }
  }
  const prepareHotspotRefresh = async () => {
    setHotspotRefreshLoading(true)
    setHotspotRefreshError('')
    setHotspotRefreshCopied(false)
    try {
      const response = await fetch(`/api/routers/${encodeURIComponent(router.id)}/hotspot-files`, { cache: 'no-store' })
      const result = await response.json() as { script?: string; error?: string }
      if (!response.ok || !result.script) throw new Error(result.error || 'Unable to prepare the Hotspot file refresh script.')
      setHotspotRefreshScript(result.script)
    } catch (reason) {
      setHotspotRefreshError(reason instanceof Error ? reason.message : 'Unable to prepare the Hotspot file refresh script.')
    } finally {
      setHotspotRefreshLoading(false)
    }
  }
  const copyHotspotRefreshScript = async () => {
    try {
      await navigator.clipboard.writeText(hotspotRefreshScript)
      setHotspotRefreshCopied(true)
    } catch {
      setHotspotRefreshError('Could not copy the script. Select it and copy it manually.')
    }
  }
  const copyConnectorSetup = async () => {
    if (!connectorEnrollment) return
    const config = [
      `APP_URL=${connectorEnrollment.appUrl}`,
      `ROUTER_ID=${connectorEnrollment.routerId}`,
      `ROUTER_CONNECTOR_TOKEN=${connectorEnrollment.token}`,
      'ROUTER_REST_URL=https://<router-private-host-or-vpn-name>/rest',
      'ROUTER_USERNAME=',
      'ROUTER_PASSWORD=',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(config)
      setCopiedConnectorToken(true)
    } catch {
      setConnectorEnrollmentError('Could not copy setup values. Select the values and copy them manually.')
    }
  }
  const bandwidthRates = useMemo(() => samples.slice(1).flatMap((sample, index) => {
    const previous = samples[index]
    const elapsedSeconds = (new Date(sample.sampledAt).getTime() - new Date(previous.sampledAt).getTime()) / 1000
    if (elapsedSeconds <= 0 || sample.totalRxBytes === null || sample.totalTxBytes === null ||
        previous.totalRxBytes === null || previous.totalTxBytes === null) return []
    const rate = (current: number, before: number) => Math.max(0, current - before) * 8 / elapsedSeconds / 1_000_000
    return [{ rx: rate(sample.totalRxBytes, previous.totalRxBytes), tx: rate(sample.totalTxBytes, previous.totalTxBytes) }]
  }), [samples])
  const cpuValues = samples.map((sample) => sample.cpuLoad)
  const memoryValues = samples.flatMap((sample) => sample.memoryUsedPercent === null ? [] : [sample.memoryUsedPercent])
  const diskValues = samples.flatMap((sample) => sample.diskUsedPercent === null ? [] : [sample.diskUsedPercent])
  const latestHeartbeatAt = latest?.sampledAt || router.lastSeenAt
  const heartbeatIsRecent = Boolean(latestHeartbeatAt && liveClock - new Date(latestHeartbeatAt).getTime() <= 90_000)
  const liveCpuLoad = latest?.cpuLoad ?? router.cpuLoad
  const liveMemoryUsedPercent = latest?.memoryUsedPercent ?? router.memoryUsedPercent
  const liveDiskUsedPercent = latest?.diskUsedPercent ?? router.diskUsedPercent
  const liveHealth = calculateRouterHealth({
    online: heartbeatIsRecent,
    cpuLoad: liveCpuLoad,
    freeMemoryBytes: latest?.freeMemoryBytes ?? router.freeMemoryBytes,
    totalMemoryBytes: latest?.totalMemoryBytes ?? router.totalMemoryBytes,
    freeDiskBytes: latest?.freeDiskBytes ?? router.freeDiskBytes,
    totalDiskBytes: latest?.totalDiskBytes ?? router.totalDiskBytes,
  })
  const diagnosticChecks: Array<{ name: string; detail: string; status: DiagnosisStatus }> = [
    { name: 'Router connectivity', detail: heartbeatIsRecent ? 'Receiving current heartbeat' : 'No heartbeat received in the last 90 seconds', status: heartbeatIsRecent ? 'passed' : 'issue' },
    { name: 'CPU load', detail: liveCpuLoad === null ? 'No telemetry available' : `${liveCpuLoad}%`, status: liveCpuLoad === null ? 'unknown' : liveCpuLoad < 85 ? 'passed' : 'issue' },
    { name: 'Memory capacity', detail: liveMemoryUsedPercent === null ? 'No telemetry available' : `${Math.round(liveMemoryUsedPercent)}% used`, status: liveMemoryUsedPercent === null ? 'unknown' : liveMemoryUsedPercent < 90 ? 'passed' : 'issue' },
    { name: 'Disk capacity', detail: liveDiskUsedPercent === null ? 'No telemetry available' : `${Math.round(liveDiskUsedPercent)}% used`, status: liveDiskUsedPercent === null ? 'unknown' : liveDiskUsedPercent < 90 ? 'passed' : 'issue' },
    { name: 'RouterOS version', detail: router.routerOsVersion || 'Not reported', status: router.routerOsVersion ? 'passed' : 'unknown' },
  ]
  const issueCount = diagnosticChecks.filter((item) => item.status === 'issue').length
  const passedCount = diagnosticChecks.filter((item) => item.status === 'passed').length
  const filteredDiagnosis = diagnosticChecks.filter((item) =>
    diagnosisFilter === 'all' || (diagnosisFilter === 'issues' && item.status === 'issue') ||
    (diagnosisFilter === 'passed' && item.status === 'passed'))

  return (
    <section className="router-detail-workspace">
      <button type="button" className="router-detail-back" onClick={onBack}><ArrowLeft size={14} /> Routers <span>—</span> {router.routerName}</button>
      <div className="router-detail-heading">
        <div className="router-detail-title">
          <span className={`router-detail-icon ${router.status === 'online' ? 'is-online' : 'is-offline'}`}><RouterIcon size={20} /></span>
          <h1>{router.routerName}</h1>
          <span className={`router-detail-state ${heartbeatIsRecent ? 'online' : 'offline'}`}>{!router.monitored ? 'Not monitored' : heartbeatIsRecent ? 'Online' : 'Offline'}</span>
        </div>
        <div className="router-detail-facts">
          {router.lastSourceIp && <span>IP {router.lastSourceIp}</span>}
          <span>{router.boardName || 'RouterOS device'}</span>
          <span>RouterOS {router.routerOsVersion || 'version unavailable'}</span>
          <span>Up {formatDuration(liveUptimeSeconds)}</span>
          {router.lastSeenAt && <span>Last report {formatSampleTime(router.lastSeenAt)}</span>}
        </div>
        <div className="router-detail-actions">
          <button type="button" className="outline-button" onClick={() => { setDiagnosisFilter('issues'); setTab('Diagnosis'); void loadMetrics(); void loadSummary() }} disabled={refreshing}><Activity size={14} className={refreshing ? 'is-spinning' : undefined} /> Diagnose</button>
          <button type="button" className="outline-button" onClick={() => void prepareHotspotRefresh()} disabled={hotspotRefreshLoading}><RefreshCw size={14} className={hotspotRefreshLoading ? 'is-spinning' : undefined} /> {hotspotRefreshLoading ? 'Preparing…' : 'Refresh Hotspot files'}</button>
          <button type="button" className="outline-button" onClick={onReprovision}><RefreshCw size={14} /> Reinstall monitor</button>
          <button type="button" className="outline-button router-remove-button" onClick={() => { setConfirmDelete(true); setDeleteError('') }}>Actions · Delete</button>
        </div>
      </div>

      {hotspotRefreshError && !hotspotRefreshScript && <p className="dashboard-notice" role="alert">{hotspotRefreshError}</p>}
      {hotspotRefreshScript && <div className="router-script-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHotspotRefreshScript('') }}>
        <section className="router-script-modal panel" role="dialog" aria-modal="true" aria-labelledby="hotspot-refresh-title">
          <div className="router-script-modal-heading"><div><span>CAPTIVE PORTAL</span><h2 id="hotspot-refresh-title">Refresh Hotspot files</h2><p>Copy this script into the router’s MikroTik terminal and run it to fetch the latest login page and portal files. This does not restart the router.</p></div><button type="button" aria-label="Close" onClick={() => { setHotspotRefreshScript(''); setHotspotRefreshError(''); setHotspotRefreshCopied(false) }}><X size={17} /></button></div>
          <label className="router-script-label">RouterOS refresh script<textarea readOnly value={hotspotRefreshScript} rows={10} onFocus={(event) => event.currentTarget.select()} /></label>
          {hotspotRefreshError && <p className="router-discovery-status error" role="alert">{hotspotRefreshError}</p>}
          <div className="router-script-modal-actions"><button type="button" className="outline-button" onClick={() => { setHotspotRefreshScript(''); setHotspotRefreshError(''); setHotspotRefreshCopied(false) }}>Close</button><button type="button" className="router-link-button" onClick={() => void copyHotspotRefreshScript()}><Copy size={14} /> {hotspotRefreshCopied ? 'Copied' : 'Copy script'}</button></div>
        </section>
      </div>}

      {confirmDelete && <section className="router-delete-confirmation" role="alertdialog" aria-labelledby="router-delete-title" aria-describedby="router-delete-description">
        <div><strong id="router-delete-title">Delete {router.routerName}?</strong><p id="router-delete-description">This router and its monitoring history will be deleted. The network site, customers, and equipment records will be kept.</p></div>
        {deleteError && <p className="router-discovery-status error" role="alert">{deleteError}</p>}
        <div className="router-delete-actions"><button type="button" className="outline-button" disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</button><button type="button" className="router-delete-confirm-button" disabled={deleting} onClick={() => void deleteRouter()}>{deleting ? 'Deleting…' : 'Confirm delete'}</button></div>
      </section>}

      {error && <p className="dashboard-notice" role="alert">{error}</p>}
      {!router.monitored && <div className="router-unmonitored-notice"><strong>Router monitoring is not enabled yet.</strong><span>Install the monitor once from the MikroTik terminal. It starts automatically after a reboot and retries reports every 30 seconds; no VPS or extra computer is needed.</span><button className="router-link-button" type="button" onClick={onReprovision}>Set up automatic monitoring</button></div>}

      {summaryError && <p className="router-summary-error" role="alert">{summaryError}</p>}
      <div className="router-detail-stats router-business-stats">
        <article><span>REGISTERED USERS</span><strong>{summary ? summary.registeredUsers.toLocaleString() : '—'}</strong><small>Customers assigned to {router.siteName}</small></article>
        <article><span>ACTIVE USERS</span><strong>{router.activeHotspotUsers === null || router.activePppoeUsers === null ? '—' : (router.activeHotspotUsers + router.activePppoeUsers).toLocaleString()}</strong><small>{router.activeHotspotUsers ?? '—'} Hotspot · {router.activePppoeUsers ?? '—'} PPPoE</small><MiniTrend samples={samples} /></article>
        <article><span>DATA THIS MONTH</span><strong>{formatBytes(summary?.dataBytesThisMonth)}</strong><small>Upload + download from router counters</small></article>
        <article><span>REVENUE MTD</span><strong>{summary ? formatCurrency(summary.revenueMtd) : '—'}</strong><small>{summary?.paidTransactionsMtd.toLocaleString() ?? '—'} paid transactions · site customers</small></article>
        <article><span>UPTIME · 30D</span><strong>{summary?.uptimePercent30d === null || summary?.uptimePercent30d === undefined ? '—' : `${summary.uptimePercent30d.toFixed(2)}%`}</strong><small>Heartbeat availability estimate</small></article>
        <article><span>HEALTH</span><strong>{liveHealth === null ? '—' : liveHealth}</strong><small>{liveHealth === null ? 'Waiting for live metrics' : liveHealth >= 85 ? 'good' : liveHealth >= 65 ? 'attention' : 'critical'}</small></article>
      </div>

      <div className="router-monitor-toolbar">
        <div className="router-monitor-tabs" role="tablist" aria-label="Router monitor pages">
          {(['System', 'Reports', 'Users', 'Payments', 'Events', 'Logs', 'Diagnosis', 'Backups', 'Scheduler', 'Script'] as const).map((item) => <button type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)}>{item}{item === 'Users' && router.activeHotspotUsers !== null && <span>{router.activeHotspotUsers + (router.activePppoeUsers || 0)}</span>}{item === 'Payments' && summary && <span>{summary.paidTransactionsMtd}</span>}{item === 'Logs' && resourceData.logs?.result && <span>{resourceData.logs.result.length}</span>}{item === 'Backups' && resourceData.backups?.result && <span>{resourceData.backups.result.length}</span>}</button>)}
        </div>
        {(['System', 'Reports', 'Events'].includes(tab)) && <div className="router-monitor-ranges" aria-label="Monitoring time range">{ranges.map((item) => <button type="button" key={item.id} className={range === item.id ? 'active' : ''} onClick={() => setRange(item.id)}>{item.label}</button>)}</div>}
      </div>

      {loading && <p className="router-monitor-loading" role="status">Loading router telemetry…</p>}
      {tab === 'System' && <>
        <div className="router-monitor-layout">
          <div className="router-monitor-main">
            <LineChart
              title="Bandwidth"
              subtitle={`${bandwidthRates.at(-1) ? `Download ${bandwidthRates.at(-1)!.rx.toFixed(2)} Mbps · Upload ${bandwidthRates.at(-1)!.tx.toFixed(2)} Mbps` : 'Waiting for counter samples'} · ${ranges.find((item) => item.id === range)?.label}`}
              icon={Wifi}
              values={bandwidthRates.map((point) => point.rx)}
              secondaryValues={bandwidthRates.map((point) => point.tx)}
              color="#ff8a18"
              secondaryColor="#737b80"
              primaryLabel="Download"
              secondaryLabel="Upload"
              unit="Mbps"
              startTime={samples[0]?.sampledAt}
              endTime={samples.at(-1)?.sampledAt}
            />
            <LineChart title="CPU load" subtitle={`Utilisation · ${ranges.find((item) => item.id === range)?.label}`} icon={Cpu} values={cpuValues} startTime={samples[0]?.sampledAt} endTime={samples.at(-1)?.sampledAt} />
            <LineChart title="Memory used" subtitle={`Router resource · ${ranges.find((item) => item.id === range)?.label}`} icon={MemoryStick} values={memoryValues} color="#16a675" startTime={samples[0]?.sampledAt} endTime={samples.at(-1)?.sampledAt} />
            <LineChart title="Disk used" subtitle={`Router storage · ${ranges.find((item) => item.id === range)?.label}`} icon={HardDrive} values={diskValues} color="#688bb8" startTime={samples[0]?.sampledAt} endTime={samples.at(-1)?.sampledAt} />
          </div>
          <aside className="router-monitor-side">
            <section className="router-monitor-health panel">
              <div className="router-monitor-side-heading"><strong>Health</strong><span>{liveHealth === null ? '—' : `${liveHealth} / 100`}</span></div>
              <div className="router-health-ring" style={{ '--health-percent': `${liveHealth ?? 0}%` } as React.CSSProperties}><div><strong>{liveHealth ?? '—'}</strong><span>/ 100</span></div></div>
              <ResourceBar icon={Cpu} label="CPU load" value={liveCpuLoad} />
              <ResourceBar icon={MemoryStick} label="Memory" value={liveMemoryUsedPercent} />
              <ResourceBar icon={HardDrive} label="Disk" value={liveDiskUsedPercent} />
              <ResourceValue icon={Thermometer} label="Temperature" value={latest?.temperatureCelsius === null || latest?.temperatureCelsius === undefined ? '—' : `${latest.temperatureCelsius} °C`} />
              <ResourceValue icon={Clock3} label="Uptime" value={formatDuration(liveUptimeSeconds)} />
              <ResourceValue icon={RouterIcon} label="RouterOS" value={router.routerOsVersion || '—'} />
              <ResourceValue icon={Wifi} label="Heartbeat" value={router.status === 'online' ? 'Online' : 'No recent report'} />
              <ResourceValue icon={HardDrive} label="Samples" value={loading ? 'Loading…' : `${samples.length} in range`} />
            </section>
            <section className="router-monitor-health panel router-connection-panel">
              <div className="router-monitor-side-heading"><strong>Connection &amp; monitoring</strong></div>
              <ResourceValue icon={Clock3} label="Last heartbeat" value={router.lastSeenAt ? formatSampleTime(router.lastSeenAt) : 'Never received'} />
              <ResourceValue icon={RefreshCw} label="Monitoring cadence" value={router.connectorEnabled ? 'Bandwidth and telemetry sync every 1 sec' : router.monitored ? 'Bandwidth and telemetry sync every 1 sec' : 'Not configured'} />
              <ResourceValue icon={RouterIcon} label="Device model" value={router.boardName || 'Unavailable'} />
              <button className="outline-button" type="button" onClick={onReprovision}>Install / reinstall RouterOS monitor</button>
            </section>
          </aside>
        </div>
      </>}

      {tab === 'Reports' && <div className="router-monitor-reports">
        <LineChart title="CPU load" subtitle={`Reported samples · ${ranges.find((item) => item.id === range)?.label}`} icon={Cpu} values={cpuValues} startTime={samples[0]?.sampledAt} endTime={samples.at(-1)?.sampledAt} />
        <LineChart title="Memory usage" subtitle={`Reported samples · ${ranges.find((item) => item.id === range)?.label}`} icon={MemoryStick} values={memoryValues} color="#16a675" startTime={samples[0]?.sampledAt} endTime={samples.at(-1)?.sampledAt} />
        <LineChart title="Storage usage" subtitle={`Reported samples · ${ranges.find((item) => item.id === range)?.label}`} icon={HardDrive} values={diskValues} color="#688bb8" startTime={samples[0]?.sampledAt} endTime={samples.at(-1)?.sampledAt} />
      </div>}
      {tab === 'Users' && <section className="panel router-monitor-tab-panel">
        <h2>Connected users</h2>
        <p>Basic router metrics are reported directly by the RouterOS monitor. An optional API connector is required only for live user sessions and remote disconnects.</p>
        <div className="router-user-counts">
          <article><span>Hotspot</span><strong>{connectorConnected ? remoteSessions.filter((item) => item.sessionType === 'hotspot').length : router.activeHotspotUsers ?? '—'}</strong></article>
          <article><span>PPPoE</span><strong>{connectorConnected ? remoteSessions.filter((item) => item.sessionType === 'pppoe').length : router.activePppoeUsers ?? '—'}</strong></article>
        </div>
        <div className="router-connector-controls">
          <p role="status">{connectorConnected
              ? `API connector online · last report ${connectorLastSeenAt ? formatSampleTime(connectorLastSeenAt) : 'just now'}`
              : router.connectorEnabled
                ? `API connector offline · last report ${connectorLastSeenAt ? formatSampleTime(connectorLastSeenAt) : 'never'}`
                : 'Optional: a connector host is only needed for live session details and remote disconnects.'}</p>
            {!connectorEnrollment && <button type="button" className="outline-button" onClick={() => void enableConnector()} disabled={enablingConnector}>
              {enablingConnector ? 'Preparing connector…' : router.connectorEnabled ? 'Rotate connector token' : 'Set up optional session connector'}
            </button>}
            {connectorEnrollment && <div className="router-connector-setup">
              <strong>Install the network connector</strong>
              <p><strong>Do not paste these lines into the MikroTik terminal.</strong> They are environment settings for the always-on Windows/Linux computer running the connector. Nothing needs to be pasted into RouterOS. Monitoring starts when the connector is running and can reach the router over LAN or VPN.</p>
              <pre>{`APP_URL=${connectorEnrollment.appUrl}\nROUTER_ID=${connectorEnrollment.routerId}\nROUTER_CONNECTOR_TOKEN=${connectorEnrollment.token}\nROUTER_REST_URL=https://<router-private-host-or-vpn-name>/rest\nROUTER_USERNAME=\nROUTER_PASSWORD=`}</pre>
              <button type="button" className="outline-button" onClick={() => void copyConnectorSetup()}>{copiedConnectorToken ? 'Copied setup values' : 'Copy setup values'}</button>
              <p>On the connector Windows PC, open PowerShell in the connector project folder and run:</p>
              <pre>{`Copy-Item connector\\.env.example connector\\.env\nnotepad connector\\.env\nnode --env-file=connector\\.env connector\\agent.mjs`}</pre>
              <p>Paste the settings into Notepad’s <code>connector\\.env</code>, replace the REST URL placeholder with the real private router hostname/IP and <code>/rest</code>, and enter the dedicated RouterOS REST username and password there. Save the file, close Notepad, then run the Node command. Do not type the settings at a MikroTik prompt.</p>
              <p>Protect this file: it contains reusable credentials. If this setup token or router password was shared, rotate the connector token and change the RouterOS password before running it.</p>
            </div>}
            {connectorEnrollmentError && <p className="dashboard-notice" role="alert">{connectorEnrollmentError}</p>}
            {remoteSessionMessage && <p role="status">{remoteSessionMessage}</p>}
            {remoteSessionError && <p className="dashboard-notice" role="alert">{remoteSessionError}</p>}
            <div className="table-scroll">
              <table>
                <thead><tr><th>TYPE</th><th>USERNAME</th><th>DEVICE / CALLER</th><th>IP ADDRESS</th><th>UPTIME</th><th /></tr></thead>
                <tbody>
                  {!connectorConnected && <tr><td colSpan={6}>Waiting for the network connector to report sessions.</td></tr>}
                  {connectorConnected && loadingRemoteSessions && !remoteSessions.length && <tr><td colSpan={6}>Loading sessions…</td></tr>}
                  {connectorConnected && !loadingRemoteSessions && !remoteSessions.length && <tr><td colSpan={6}>No active Hotspot or PPPoE sessions.</td></tr>}
                  {remoteSessions.map((remoteSession) => {
                    const sessionKey = `${remoteSession.sessionType}:${remoteSession.routerSessionId}`
                    return <tr key={sessionKey}>
                      <td>{remoteSession.sessionType === 'hotspot' ? 'Hotspot' : 'PPPoE'}</td>
                      <td>{remoteSession.username}</td>
                      <td className="mono">{remoteSession.macAddress || remoteSession.callerId || '—'}</td>
                      <td className="mono">{remoteSession.ipAddress || '—'}</td>
                      <td>{remoteSession.uptimeSeconds === null ? '—' : formatDuration(remoteSession.uptimeSeconds)}</td>
                      <td><button type="button" className="router-row-action" disabled={!connectorConnected || disconnectingSession === sessionKey} onClick={() => void disconnectSession(remoteSession)}>{disconnectingSession === sessionKey ? 'Queuing…' : 'Disconnect'}</button></td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
        </div>
      </section>}
      {tab === 'Payments' && <section className="panel router-monitor-tab-panel router-data-panel">
        <div className="router-data-heading"><div><h2>Site payments</h2><p>Recorded payments linked to subscribers assigned to {router.siteName}.</p></div><button type="button" className="outline-button" onClick={() => void loadSummary()}><RefreshCw size={13} /> Refresh</button></div>
        {summaryError && <p className="router-data-error" role="alert">{summaryError}</p>}
        <div className="router-payment-total"><span>Paid revenue this month</span><strong>{summary ? formatCurrency(summary.revenueMtd) : '—'}</strong><small>{summary?.paidTransactionsMtd.toLocaleString() ?? '—'} confirmed transactions</small></div>
        <div className="table-scroll"><table><thead><tr><th>Paid at</th><th>Subscriber</th><th>Source</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>
          {summary?.payments.map((payment) => <tr key={`${payment.source}:${payment.id}`}><td>{formatSampleTime(payment.paidAt)}</td><td>{payment.subscriber}</td><td>{payment.source}</td><td>{payment.method}</td><td className="mono">{payment.reference || '—'}</td><td>{formatCurrency(payment.amount)}</td></tr>)}
          {summary && summary.payments.length === 0 && <tr><td colSpan={6}>No paid subscriber transactions are recorded for this site yet.</td></tr>}
          {!summary && !summaryError && <tr><td colSpan={6}>Loading site payment records…</td></tr>}
        </tbody></table></div>
      </section>}
      {tab === 'Events' && <HeartbeatEvents samples={samples} loading={loading} />}
      {tab === 'Logs' && <RouterResourcePanel title="RouterOS logs" description="Most recent log messages read directly from this router." resource="logs" icon={ScrollText} query={resourceData.logs} loading={resourceLoading === 'logs'} error={resourceError} onRefresh={() => void loadRouterResource('logs')} columns={[['time', 'Time'], ['topics', 'Topics'], ['message', 'Message']]} emptyMessage="The router returned no log entries." />}
      {tab === 'Backups' && <RouterResourcePanel title="Router backup files" description="Once the connector is online, LKTech creates a binary router backup immediately if none exists, then every 24 hours. The 30 newest automatic copies stay on the router and appear first. Existing .backup and .rsc files are also listed." resource="backups" icon={FileArchive} query={resourceData.backups} loading={resourceLoading === 'backups'} error={resourceError} onRefresh={() => void loadRouterResource('backups')} columns={ [['name', 'File name'], ['size', 'Size'], ['creation-time', 'Created'], ['last-modified', 'Last modified']]} emptyMessage="No .backup or .rsc files are present on the router." />}
      {tab === 'Scheduler' && <RouterResourcePanel title="Router scheduler" description="Scheduled RouterOS tasks read live from the router. This view is read-only." resource="scheduler" icon={CalendarClock} query={resourceData.scheduler} loading={resourceLoading === 'scheduler'} error={resourceError} onRefresh={() => void loadRouterResource('scheduler')} columns={[['name', 'Name'], ['disabled', 'Disabled'], ['interval', 'Interval'], ['next-run', 'Next run'], ['run-count', 'Run count'], ['owner', 'Owner']]} emptyMessage="No scheduler entries are configured on this router." />}
      {tab === 'Script' && <RouterResourcePanel title="Router scripts" description="Shows RouterOS script metadata and the source of LKTech’s installed monitoring/provisioning script. Its router authentication token is redacted; other script source is not exposed." resource="scripts" icon={Code2} query={resourceData.scripts} loading={resourceLoading === 'scripts'} error={resourceError} onRefresh={() => void loadRouterResource('scripts')} columns={[['name', 'Name'], ['disabled', 'Disabled'], ['owner', 'Owner'], ['policy', 'Policy'], ['run-count', 'Run count'], ['last-started', 'Last run'], ['source', 'LKTech script source']]} emptyMessage="No scripts are configured on this router." />}
      {tab === 'Diagnosis' && <section className="panel router-monitor-tab-panel router-diagnosis-panel">
        <div className="router-data-heading"><div><h2>Router diagnosis</h2><p>Checks are based on the latest signed telemetry received for this router.</p></div><button className="router-diagnosis-run" type="button" onClick={() => { void loadMetrics(); void loadSummary() }} disabled={refreshing}><Activity size={14} /> Run diagnosis</button></div>
        <div className="router-diagnosis-content">
          <div className="router-diagnosis-filters" role="group" aria-label="Filter diagnosis checks">
            {([
              ['issues', 'Issues', issueCount],
              ['all', 'All', diagnosticChecks.length],
              ['passed', 'Passed', passedCount],
            ] as const).map(([filter, label, count]) => <button type="button" key={filter} className={diagnosisFilter === filter ? 'active' : ''} aria-pressed={diagnosisFilter === filter} onClick={() => setDiagnosisFilter(filter)}>{label}<span>{count}</span></button>)}
          </div>
          {diagnosisFilter === 'issues' && issueCount === 0 && <div className={`router-diagnosis-summary ${diagnosticChecks.some((item) => item.status === 'unknown') ? 'has-unknown' : ''}`}>
            {diagnosticChecks.some((item) => item.status === 'unknown') ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{diagnosticChecks.some((item) => item.status === 'unknown') ? 'No active issues; some checks need telemetry.' : 'No open issues — all checks passed.'}</span>
          </div>}
          {diagnosisFilter !== 'issues' || issueCount > 0 ? <ul className="router-diagnosis-results">
            {filteredDiagnosis.map((check) => <li key={check.name} className={`diagnosis-${check.status}`}>
              {check.status === 'passed' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              <span><strong>{check.name}</strong><small>{check.detail}</small></span>
              <b>{check.status === 'passed' ? 'Passed' : check.status === 'issue' ? 'Issue' : 'No data'}</b>
            </li>)}
          </ul> : null}
          <p className="router-diagnosis-updated">{router.metricsUpdatedAt ? `Telemetry sample ${formatSampleTime(router.metricsUpdatedAt)}` : 'No telemetry sample has been received yet.'}</p>
        </div>
      </section>}
      <div className="router-monitor-last-updated">{loading ? 'Loading telemetry…' : lastRefreshedAt ? `Dashboard refreshed ${new Date(lastRefreshedAt).toLocaleTimeString()} · live auto-refresh every 1 second` : 'Waiting for telemetry'}<button type="button" onClick={() => void loadMetrics()} disabled={refreshing}><RefreshCw size={12} className={refreshing ? 'is-spinning' : undefined} /> Refresh</button></div>
    </section>
  )
}

function formatCurrency(amount: number) {
  return `Ksh ${new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(amount)}`
}

function MiniTrend({ samples }: { samples: MetricSample[] }) {
  const values = samples.map((sample) => sample.activeHotspotUsers + sample.activePppoeUsers)
  if (values.length < 2) return <span className="router-mini-trend-empty">Collecting usage</span>
  const maximum = Math.max(...values, 1)
  const points = values.map((value, index) =>
    `${index / (values.length - 1) * 150},${26 - value / maximum * 22}`).join(' ')
  return <svg className="router-mini-trend" viewBox="0 0 150 28" role="img" aria-label="Active user counts in recent router reports">
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

function RouterResourcePanel({
  title,
  description,
  resource,
  icon: Icon,
  query,
  loading,
  error,
  onRefresh,
  columns,
  emptyMessage,
}: {
  title: string
  description: string
  resource: RouterResourceName
  icon: typeof Cpu
  query?: RouterResourceQuery
  loading: boolean
  error: string
  onRefresh: () => void
  columns: Array<[string, string]>
  emptyMessage: string
}) {
  const records = (query?.result || []).slice()
  if (resource === 'backups') {
    records.sort((left, right) => routerResourceTimestamp(right) - routerResourceTimestamp(left))
  }
  return <section className="panel router-monitor-tab-panel router-data-panel">
    <div className="router-data-heading"><div className="router-data-title"><Icon size={17} /><span><h2>{title}</h2><p>{description}</p></span></div><button type="button" className="outline-button" onClick={onRefresh} disabled={loading}><RefreshCw size={13} className={loading ? 'is-spinning' : undefined} /> {loading ? 'Loading…' : 'Refresh from router'}</button></div>
    {error && <p className="router-data-error" role="alert">{error}</p>}
    {!error && loading && <p className="router-data-loading" role="status">Reading live {resource} data from RouterOS…</p>}
    {!error && !loading && !query && <p className="router-data-loading">Waiting for the RouterOS API connector.</p>}
    {!error && !loading && query && records.length === 0 && <div className="router-resource-empty"><FileText size={18} /><span>{emptyMessage}</span></div>}
    {!error && !loading && query && records.length > 0 && <div className="table-scroll"><table><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>
      {records.map((record, index) => <tr key={String(record['.id'] || record.name || index)}>{columns.map(([key]) => <td key={key} className={key === 'message' || key === 'name' ? 'router-resource-primary' : ''}>{key === 'source' && typeof record[key] === 'string' ? <details className="router-script-source"><summary>View LKTech source</summary><pre>{record[key]}</pre></details> : formatResourceValue(record[key])}</td>)}</tr>)}
    </tbody></table></div>}
    <p className="router-resource-footnote">{resource === 'backups' ? 'Automatic backups are saved on the router every 24 hours; LKTech keeps the latest 30.' : 'Read-only RouterOS REST data'}{query?.completedAt ? ` · last queried ${formatSampleTime(query.completedAt)}` : ''}</p>
  </section>
}

function routerResourceTimestamp(record: RouterResourceRecord) {
  const name = record.name
  if (typeof name === 'string') {
    const automaticName = /^lktech-auto-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.backup$/i.exec(name)
    if (automaticName) {
      const [, year, month, day, hour, minute, second] = automaticName
      return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    }
  }

  for (const field of ['last-modified', 'creation-time']) {
    const value = record[field]
    if (typeof value !== 'string') continue
    const routerOsDate = /^([a-z]{3})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/i.exec(value)
    if (routerOsDate) {
      const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(routerOsDate[1].toLowerCase())
      if (month >= 0) return Date.UTC(Number(routerOsDate[3]), month, Number(routerOsDate[2]), Number(routerOsDate[4]), Number(routerOsDate[5]), Number(routerOsDate[6]))
    }
    const timestamp = Date.parse(value)
    if (Number.isFinite(timestamp)) return timestamp
  }
  return 0
}

function formatResourceValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function ResourceBar({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: number | null }) {
  return <div className="router-resource"><div><span><Icon size={13} />{label}</span><strong>{value === null ? '—' : `${Math.round(value)}%`}</strong></div><div className="router-resource-track"><i style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} /></div></div>
}

function ResourceValue({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return <div className="router-resource-value"><span><Icon size={13} />{label}</span><strong>{value}</strong></div>
}

function HeartbeatEvents({ samples, loading }: { samples: MetricSample[]; loading: boolean }) {
  return <section className="panel router-monitor-tab-panel"><h2>Monitoring events</h2><p>Router telemetry samples received in the selected time range.</p><div className="router-event-list">
    {loading && <span>Loading events…</span>}
    {!loading && !samples.length && <span>No heartbeat events in this time range.</span>}
    {[...samples].reverse().slice(0, 100).map((sample) => <div key={sample.sampledAt}><span className="router-event-dot" /><span><strong>Router heartbeat received</strong><small>{sample.routerOsVersion || 'RouterOS'} · CPU {sample.cpuLoad}% · {sample.activeHotspotUsers + sample.activePppoeUsers} active users</small></span><time>{formatSampleTime(sample.sampledAt)}</time></div>)}
  </div></section>
}
