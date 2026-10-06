'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Clock3, Cpu, HardDrive, MemoryStick, RefreshCw, Router as RouterIcon, Thermometer, Wifi } from 'lucide-react'

export type RouterMonitorRecord = {
  id: string
  siteId: string
  monitored: boolean
  routerName: string
  location: string
  status: 'online' | 'offline' | 'not_configured'
  lastSeenAt: string | null
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
  health: number | null
}

type MetricSample = {
  sampledAt: string
  cpuLoad: number
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
type MonitorTab = 'System' | 'Reports' | 'Users' | 'Events' | 'Diagnosis'

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

function LineChart({ title, subtitle, icon: Icon, values, color = '#ff8a18', secondaryValues, secondaryColor = '#737b80', unit = '%', startTime, endTime }: {
  title: string
  subtitle: string
  icon: typeof Cpu
  values: number[]
  color?: string
  secondaryValues?: number[]
  secondaryColor?: string
  unit?: string
  startTime?: string
  endTime?: string
}) {
  const points = useMemo(() => {
    if (!values.length) return ''
    const minimum = unit === '%' ? 0 : Math.min(...values)
    const maximum = unit === '%' ? 100 : Math.max(...values, ...(secondaryValues || []), 1)
    const span = Math.max(maximum - minimum, 1)
    return values.map((value, index) => `${values.length < 2 ? 320 : 30 + index / (values.length - 1) * 580},${152 - ((value - minimum) / span) * 128}`).join(' ')
  }, [secondaryValues, unit, values])
  const secondaryPoints = useMemo(() => {
    if (!secondaryValues?.length) return ''
    const maximum = unit === '%' ? 100 : Math.max(...values, ...secondaryValues, 1)
    const minimum = unit === '%' ? 0 : Math.min(...values, ...secondaryValues)
    const span = Math.max(maximum - minimum, 1)
    return secondaryValues.map((value, index) => `${secondaryValues.length < 2 ? 320 : 30 + index / (secondaryValues.length - 1) * 580},${152 - ((value - minimum) / span) * 128}`).join(' ')
  }, [secondaryValues, unit, values])

  return (
    <section className="router-monitor-chart panel">
      <div className="router-monitor-chart-heading"><div><Icon size={15} /><strong>{title}</strong></div><span>{subtitle}</span></div>
      {values.length < 2
        ? <div className="router-chart-empty">{values.length ? 'Collecting samples…' : 'No monitoring history in this time range yet.'}</div>
        : <div className="router-chart-plot">
          <div className="router-chart-grid"><i /><i /><i /><i /></div>
          <svg viewBox="0 0 640 180" role="img" aria-label={`${title} over ${subtitle}`}>
            <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {secondaryPoints && <polyline points={secondaryPoints} fill="none" stroke={secondaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
          <div className="router-chart-endpoints"><span>{startTime ? new Date(startTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span><span>{endTime ? new Date(endTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
        </div>}
    </section>
  )
}

export function RouterMonitorDetail({
  router,
  onBack,
  onReprovision,
  onRemove,
}: {
  router: RouterMonitorRecord
  onBack: () => void
  onReprovision: () => void
  onRemove: () => void
}) {
  const [range, setRange] = useState<(typeof ranges)[number]['id']>('24h')
  const [tab, setTab] = useState<MonitorTab>('System')
  const [samples, setSamples] = useState<MetricSample[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null)
  const loadInFlight = useRef(false)

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

  useEffect(() => {
    void loadMetrics()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadMetrics()
    }, 15_000)
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void loadMetrics()
    }
    document.addEventListener('visibilitychange', refreshOnFocus)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [loadMetrics])

  const latest = samples.at(-1)
  const bandwidthRates = useMemo(() => samples.slice(1).flatMap((sample, index) => {
    const previous = samples[index]
    const elapsedSeconds = (new Date(sample.sampledAt).getTime() - new Date(previous.sampledAt).getTime()) / 1000
    if (elapsedSeconds <= 0 || sample.totalRxBytes === null || sample.totalTxBytes === null ||
        previous.totalRxBytes === null || previous.totalTxBytes === null) return []
    const rate = (current: number, before: number) => Math.max(0, current - before) * 8 / elapsedSeconds / 1_000_000
    return [{ rx: rate(sample.totalRxBytes, previous.totalRxBytes), tx: rate(sample.totalTxBytes, previous.totalTxBytes) }]
  }), [samples])
  const transferredBytes = useMemo(() => {
    if (samples.length < 2) return null
    const first = samples[0]
    const last = samples.at(-1)!
    if (first.totalRxBytes === null || first.totalTxBytes === null || last.totalRxBytes === null || last.totalTxBytes === null) return null
    const received = Math.max(0, last.totalRxBytes - first.totalRxBytes)
    const sent = Math.max(0, last.totalTxBytes - first.totalTxBytes)
    return received + sent
  }, [samples])
  const sampleCoverage = useMemo(() => {
    if (samples.length < 2) return null
    const rangeDuration = { '1h': 3600, '24h': 86400, '7d': 604800, '30d': 2592000 }[range]
    const cutoff = Date.now() - rangeDuration * 1000
    const observed = samples.filter((sample) => new Date(sample.sampledAt).getTime() >= cutoff)
    if (observed.length < 2) return null
    const durations = observed.slice(1).map((sample, index) => {
      const current = new Date(sample.sampledAt).getTime()
      const previous = new Date(observed[index].sampledAt).getTime()
      return Math.max(0, Math.min(current - previous, 3 * 60 * 1000))
    })
    const covered = durations.reduce((total, value) => total + value, 0)
    const observedSpan = Math.max(1, new Date(observed.at(-1)!.sampledAt).getTime() - new Date(observed[0].sampledAt).getTime())
    return Math.round(Math.min(100, covered / Math.min(observedSpan, rangeDuration * 1000) * 100))
  }, [range, samples])
  const cpuValues = samples.map((sample) => sample.cpuLoad)
  const memoryValues = samples.flatMap((sample) => sample.memoryUsedPercent === null ? [] : [sample.memoryUsedPercent])
  const diskValues = samples.flatMap((sample) => sample.diskUsedPercent === null ? [] : [sample.diskUsedPercent])

  return (
    <section className="router-detail-workspace">
      <button type="button" className="router-detail-back" onClick={onBack}><ArrowLeft size={14} /> Routers <span>—</span> {router.routerName}</button>
      <div className="router-detail-heading">
        <div className="router-detail-title">
          <span className={`router-detail-icon ${router.status === 'online' ? 'is-online' : 'is-offline'}`}><RouterIcon size={20} /></span>
          <h1>{router.routerName}</h1>
          <span className={`router-detail-state ${router.status}`}>{router.status === 'not_configured' ? 'Not monitored' : router.status}</span>
        </div>
        <div className="router-detail-facts">
          <span>{router.boardName || 'RouterOS device'}</span>
          <span>{router.routerOsVersion || 'RouterOS version unavailable'}</span>
          <span>Up {formatDuration(router.uptimeSeconds)}</span>
          {router.lastSeenAt && <span>Heartbeat {formatSampleTime(router.lastSeenAt)}</span>}
        </div>
        <div className="router-detail-actions">
          <button type="button" className="outline-button" onClick={() => void loadMetrics()} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'is-spinning' : undefined} /> Diagnose</button>
          <button type="button" className="outline-button" onClick={onReprovision}><RefreshCw size={14} /> Reprovision</button>
          <button type="button" className="outline-button router-remove-button" onClick={onRemove}>Remove monitor</button>
        </div>
      </div>

      {error && <p className="dashboard-notice" role="alert">{error}</p>}
      {!router.monitored && <div className="router-unmonitored-notice"><strong>Monitoring has not been installed on this site yet.</strong><span>Generate the RouterOS monitor script, paste it into the router terminal, and live metrics will appear here.</span><button className="router-link-button" type="button" onClick={onReprovision}>Enable monitoring</button></div>}

      <div className="router-detail-stats">
        <article><span>ACTIVE USERS</span><strong>{router.activeHotspotUsers === null || router.activePppoeUsers === null ? '—' : (router.activeHotspotUsers + router.activePppoeUsers).toLocaleString()}</strong><small>{router.activeHotspotUsers ?? '—'} Hotspot · {router.activePppoeUsers ?? '—'} PPPoE</small></article>
        <article><span>DATA · {ranges.find((item) => item.id === range)?.label}</span><strong>{formatBytes(transferredBytes)}</strong><small>Received + sent from Ethernet counters</small></article>
        <article><span>MONITOR COVERAGE · {ranges.find((item) => item.id === range)?.label}</span><strong>{sampleCoverage === null ? '—' : `${sampleCoverage}%`}</strong><small>Based on received heartbeats</small></article>
        <article><span>HEALTH</span><strong>{router.health === null ? '—' : router.health}</strong><small>{router.health === null ? 'Waiting for live metrics' : router.health >= 85 ? 'good' : router.health >= 65 ? 'attention' : 'critical'}</small></article>
      </div>

      <div className="router-monitor-toolbar">
        <div className="router-monitor-tabs" role="tablist" aria-label="Router monitor pages">
          {(['System', 'Reports', 'Users', 'Events', 'Diagnosis'] as const).map((item) => <button type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)}>{item}{item === 'Users' && router.activeHotspotUsers !== null && <span>{router.activeHotspotUsers + (router.activePppoeUsers || 0)}</span>}</button>)}
        </div>
        <div className="router-monitor-ranges" aria-label="Monitoring time range">{ranges.map((item) => <button type="button" key={item.id} className={range === item.id ? 'active' : ''} onClick={() => setRange(item.id)}>{item.label}</button>)}</div>
      </div>

      {loading && <p className="router-monitor-loading" role="status">Loading router telemetry…</p>}
      {tab === 'System' && <>
        <div className="router-monitor-layout">
          <div className="router-monitor-main">
            <section className="router-monitor-chart panel">
              <LineChart title="Bandwidth" subtitle={`${bandwidthRates.at(-1) ? `↓ ${bandwidthRates.at(-1)!.rx.toFixed(2)} Mbps · ↑ ${bandwidthRates.at(-1)!.tx.toFixed(2)} Mbps` : 'Waiting for counter samples'} · ${ranges.find((item) => item.id === range)?.label}`} icon={Wifi} values={bandwidthRates.map((point) => point.rx)} secondaryValues={bandwidthRates.map((point) => point.tx)} color="#ff8a18" secondaryColor="#737b80" unit="Mbps" startTime={samples[0]?.sampledAt} endTime={samples.at(-1)?.sampledAt} />
            </section>
            <LineChart title="CPU load" subtitle={`Utilisation · ${ranges.find((item) => item.id === range)?.label}`} icon={Cpu} values={cpuValues} startTime={samples[0]?.sampledAt} endTime={samples.at(-1)?.sampledAt} />
            <LineChart title="Memory used" subtitle={`Router resource · ${ranges.find((item) => item.id === range)?.label}`} icon={MemoryStick} values={memoryValues} color="#16a675" startTime={samples[0]?.sampledAt} endTime={samples.at(-1)?.sampledAt} />
            <LineChart title="Disk used" subtitle={`Router storage · ${ranges.find((item) => item.id === range)?.label}`} icon={HardDrive} values={diskValues} color="#688bb8" startTime={samples[0]?.sampledAt} endTime={samples.at(-1)?.sampledAt} />
          </div>
          <aside className="router-monitor-side">
            <section className="router-monitor-health panel">
              <div className="router-monitor-side-heading"><strong>Health</strong><span>{router.health === null ? '—' : `${router.health} / 100`}</span></div>
              <div className="router-health-ring" style={{ '--health-percent': `${router.health ?? 0}%` } as React.CSSProperties}><div><strong>{router.health ?? '—'}</strong><span>/ 100</span></div></div>
              <ResourceBar icon={Cpu} label="CPU load" value={router.cpuLoad} />
              <ResourceBar icon={MemoryStick} label="Memory" value={router.memoryUsedPercent} />
              <ResourceBar icon={HardDrive} label="Disk" value={router.diskUsedPercent} />
              <ResourceValue icon={Thermometer} label="Temperature" value={latest?.temperatureCelsius === null || latest?.temperatureCelsius === undefined ? '—' : `${latest.temperatureCelsius} °C`} />
              <ResourceValue icon={Clock3} label="Uptime" value={formatDuration(router.uptimeSeconds)} />
              <ResourceValue icon={RouterIcon} label="RouterOS" value={router.routerOsVersion || '—'} />
              <ResourceValue icon={Wifi} label="Heartbeat" value={router.status === 'online' ? 'Online' : 'No recent report'} />
              <ResourceValue icon={HardDrive} label="Samples" value={loading ? 'Loading…' : `${samples.length} in range`} />
            </section>
            <section className="router-monitor-health panel router-connection-panel">
              <div className="router-monitor-side-heading"><strong>Connection &amp; monitoring</strong></div>
              <ResourceValue icon={Clock3} label="Last heartbeat" value={router.lastSeenAt ? formatSampleTime(router.lastSeenAt) : 'Never received'} />
              <ResourceValue icon={RefreshCw} label="Reporting interval" value="30 seconds" />
              <ResourceValue icon={RouterIcon} label="Device model" value={router.boardName || 'Unavailable'} />
              <button className="router-script-link" type="button" onClick={onReprovision}>Copy monitoring install script</button>
            </section>
          </aside>
        </div>
      </>}

      {tab === 'Reports' && <div className="router-monitor-reports">
        <LineChart title="CPU load" subtitle={`Reported samples · ${ranges.find((item) => item.id === range)?.label}`} icon={Cpu} values={cpuValues} startTime={samples[0]?.sampledAt} endTime={samples.at(-1)?.sampledAt} />
        <LineChart title="Memory usage" subtitle={`Reported samples · ${ranges.find((item) => item.id === range)?.label}`} icon={MemoryStick} values={memoryValues} color="#16a675" startTime={samples[0]?.sampledAt} endTime={samples.at(-1)?.sampledAt} />
        <LineChart title="Storage usage" subtitle={`Reported samples · ${ranges.find((item) => item.id === range)?.label}`} icon={HardDrive} values={diskValues} color="#688bb8" startTime={samples[0]?.sampledAt} endTime={samples.at(-1)?.sampledAt} />
      </div>}
      {tab === 'Users' && <section className="panel router-monitor-tab-panel"><h2>Connected users</h2><p>These active-user counts are reported directly by this MikroTik router.</p><div className="router-user-counts"><article><span>Hotspot</span><strong>{router.activeHotspotUsers ?? '—'}</strong></article><article><span>PPPoE</span><strong>{router.activePppoeUsers ?? '—'}</strong></article></div></section>}
      {tab === 'Events' && <HeartbeatEvents samples={samples} loading={loading} />}
      {tab === 'Diagnosis' && <section className="panel router-monitor-tab-panel"><h2>Router diagnosis</h2><p>Checks are based on the latest signed router heartbeat.</p><ul className="router-diagnosis-list">
        <li><span>Monitoring agent</span><strong className={router.status === 'online' ? 'is-good' : 'is-warning'}>{router.status === 'online' ? 'Receiving heartbeats' : 'No heartbeat in the last 3 minutes'}</strong></li>
        <li><span>CPU load</span><strong className={router.cpuLoad !== null && router.cpuLoad < 85 ? 'is-good' : 'is-warning'}>{router.cpuLoad === null ? 'No data' : `${router.cpuLoad}%`}</strong></li>
        <li><span>Memory capacity</span><strong className={router.memoryUsedPercent !== null && router.memoryUsedPercent < 90 ? 'is-good' : 'is-warning'}>{router.memoryUsedPercent === null ? 'No data' : `${Math.round(router.memoryUsedPercent)}% used`}</strong></li>
        <li><span>Disk capacity</span><strong className={router.diskUsedPercent !== null && router.diskUsedPercent < 90 ? 'is-good' : 'is-warning'}>{router.diskUsedPercent === null ? 'No data' : `${Math.round(router.diskUsedPercent)}% used`}</strong></li>
        <li><span>Latest report</span><strong>{router.lastSeenAt ? formatSampleTime(router.lastSeenAt) : 'Never received'}</strong></li>
      </ul><button className="outline-button" type="button" onClick={() => void loadMetrics()} disabled={refreshing}><RefreshCw size={14} /> Run checks again</button></section>}
      <div className="router-monitor-last-updated">{loading ? 'Loading telemetry…' : lastRefreshedAt ? `Dashboard refreshed ${new Date(lastRefreshedAt).toLocaleTimeString()} · router reports every 30 sec` : 'Waiting for telemetry'}<button type="button" onClick={() => void loadMetrics()} disabled={refreshing}><RefreshCw size={12} className={refreshing ? 'is-spinning' : undefined} /> Refresh</button></div>
    </section>
  )
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
