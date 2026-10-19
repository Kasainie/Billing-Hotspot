'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Ban, Clock3, MessageCircle, RefreshCw, RotateCw, Search, Signal, Unplug, Wifi, X } from 'lucide-react'
import { exportTabularReport, type ReportExportFormat } from '@/lib/report-export'

type HotspotSession = {
  id: string
  username: string | null
  customerId: string | null
  voucherId: string | null
  mac: string | null
  ipAddress: string | null
  startedAt: string | null
  lastActivityAt: string | null
  phone: string | null
  customerName: string | null
  plan: string | null
  expiresAt: string | null
  customerStatus: string | null
  serviceType: 'PPPoE' | 'Hotspot'
  router: string | null
  routerId: string | null
  routerSessionId: string | null
  routerSessionType: 'hotspot' | 'pppoe' | null
  downloadBps: string | null
  uploadBps: string | null
  downloadBytes: string
  uploadBytes: string
}

type HotspotSessionsResponse = {
  connectedDevices: number
  activeSessions: number
  downloadBytes: string
  uploadBytes: string
  totalBytes: string
  sessions: HotspotSession[]
  error?: string
}

type ReportStatus = 'online' | 'offline' | 'expired'
type ReportStatusFilter = 'all' | ReportStatus
type SessionReport = {
  id: string
  username: string | null
  customerId: string | null
  customerName: string | null
  phone: string | null
  serviceType: string
  status: ReportStatus
  customerStatus: string | null
  plan: string | null
  mac: string | null
  ipAddress: string | null
  router: string | null
  startedAt: string | null
  endedAt: string | null
  lastActivityAt: string | null
  durationSeconds: number | null
  downloadBytes: string
  uploadBytes: string
  terminateCause: string | null
  expiresAt: string | null
}
type SessionReportsResponse = {
  page: number
  pageSize: number
  total: number
  pages: number
  summary: {
    totalSessions: number
    onlineSessions: number
    offlineSessions: number
    expiredSessions: number
    uniqueDevices: number
    downloadBytes: string
    uploadBytes: string
  }
  sessions: SessionReport[]
  error?: string
}

type SessionFilter = 'All' | 'PPPoE' | 'Hotspot' | 'Bindings'

function formatExpiry(value: string | null) {
  if (!value) return { date: 'No expiry recorded', remaining: '' }
  const expiry = new Date(value)
  if (!Number.isFinite(expiry.getTime())) return { date: 'Expiry unavailable', remaining: '' }
  const remainingMs = expiry.getTime() - Date.now()
  const days = Math.ceil(Math.abs(remainingMs) / 86_400_000)
  const remaining = remainingMs > 0 ? `in ${days}d` : days === 0 ? 'expired today' : `expired ${days}d ago`
  return {
    date: expiry.toLocaleString('en-KE', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    remaining,
  }
}

function formatBytes(value: string | number) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** exponent).toLocaleString('en-KE', { maximumFractionDigits: 1 })} ${units[exponent]}`
}

function formatSpeed(value: string | null) {
  if (value === null) return '—'
  const bitsPerSecond = Number(value)
  if (!Number.isFinite(bitsPerSecond) || bitsPerSecond < 0) return '—'
  if (bitsPerSecond >= 1_000_000) return `${(bitsPerSecond / 1_000_000).toLocaleString('en-KE', { maximumFractionDigits: 1 })} Mbps`
  if (bitsPerSecond >= 1_000) return `${(bitsPerSecond / 1_000).toLocaleString('en-KE', { maximumFractionDigits: 1 })} Kbps`
  return `${Math.round(bitsPerSecond)} bps`
}

function formatStartTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-KE') : '—'
}

function formatLocalDateInput(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatReportDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  const total = Math.max(0, Math.floor(seconds))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const secondsPart = total % 60
  return [days ? `${days}d` : '', `${String(hours).padStart(2, '0')}h`, `${String(minutes).padStart(2, '0')}m`, `${String(secondsPart).padStart(2, '0')}s`].filter(Boolean).join(' ')
}

function formatDuration(value: string | null) {
  if (!value) return '—'
  const startedAt = new Date(value).getTime()
  if (!Number.isFinite(startedAt)) return '—'
  const totalMinutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', `${minutes}m`].filter(Boolean).join(' ')
}

function formatElapsedClock(value: string | null, now: number) {
  if (!value) return 'Start time unavailable'
  const startedAt = new Date(value).getTime()
  if (!Number.isFinite(startedAt)) return 'Start time unavailable'
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const clock = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
  return days ? `${days}d ${clock}` : clock
}

function formatTimeRemaining(value: string | null, now: number) {
  if (!value) return 'No expiry'
  const expiresAt = new Date(value).getTime()
  if (!Number.isFinite(expiresAt)) return 'Unavailable'
  const remainingSeconds = Math.floor((expiresAt - now) / 1_000)
  if (remainingSeconds <= 0) return 'Expired'
  const days = Math.floor(remainingSeconds / 86_400)
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600)
  const minutes = Math.floor((remainingSeconds % 3_600) / 60)
  const seconds = remainingSeconds % 60
  const clock = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
  return days ? `${days}d ${clock}` : clock
}

function formatAddress(value: string | null) {
  return value?.replace(/\/\d+$/, '') || 'Not reported'
}

export function LiveHotspotSessions({ onOpenSubscriber, onOnlineCountChange }: { onOpenSubscriber: (customerId: string) => void; onOnlineCountChange: (count: number) => void }) {
  const [view, setView] = useState<'live' | 'reports'>('live')
  const [data, setData] = useState<HotspotSessionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<SessionFilter>('All')
  const [search, setSearch] = useState('')
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [selectedSession, setSelectedSession] = useState<HotspotSession | null>(null)
  const [smsOpen, setSmsOpen] = useState(false)
  const [smsDraft, setSmsDraft] = useState('')
  const [sendingSms, setSendingSms] = useState(false)
  const [suspending, setSuspending] = useState(false)
  const [sessionAction, setSessionAction] = useState<'disconnect' | 'reconnect' | null>(null)
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState(false)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [reportData, setReportData] = useState<SessionReportsResponse | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportRefreshing, setReportRefreshing] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportStatus, setReportStatus] = useState<ReportStatusFilter>('all')
  const [reportSearch, setReportSearch] = useState('')
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState(() => formatLocalDateInput(new Date()))
  const [reportPage, setReportPage] = useState(1)
  const [exportingReport, setExportingReport] = useState(false)
  const [reportExportFormat, setReportExportFormat] = useState<ReportExportFormat>('csv')

  const closeDetails = useCallback(() => {
    setSelectedSession(null)
    setSmsOpen(false)
    setSmsDraft('')
    setActionMessage('')
    setActionError(false)
  }, [])

  useEffect(() => {
    if (!selectedSession) return
    setClockNow(Date.now())
    const clockInterval = window.setInterval(() => setClockNow(Date.now()), 1_000)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetails()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearInterval(clockInterval)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [closeDetails, selectedSession])

  const load = useCallback(async () => {
    setRefreshing(true)
    setError('')
    try {
      const response = await fetch('/api/hotspot/sessions', { cache: 'no-store' })
      const result = await response.json() as HotspotSessionsResponse
      if (!response.ok) throw new Error(result.error || 'Unable to load live sessions.')
      setData(result)
      setSelectedSession((current) => current
        ? result.sessions.find((session) => session.id === current.id) ?? current
        : null)
      onOnlineCountChange(result.connectedDevices)
      setRefreshedAt(new Date())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load live sessions.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [onOnlineCountChange])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => void load(), 5_000)
    return () => window.clearInterval(interval)
  }, [load])

  const loadReports = useCallback(async () => {
    setReportRefreshing(true)
    setReportError('')
    const params = new URLSearchParams({
      status: reportStatus,
      page: String(reportPage),
    })
    if (reportFrom) params.set('from', reportFrom)
    if (reportTo) params.set('to', reportTo)
    if (reportSearch.trim()) params.set('search', reportSearch.trim())
    try {
      const response = await fetch(`/api/hotspot/session-reports?${params.toString()}`, { cache: 'no-store' })
      const result = await response.json() as SessionReportsResponse
      if (!response.ok) throw new Error(result.error || 'Unable to load session reports.')
      setReportData(result)
    } catch (reason) {
      setReportError(reason instanceof Error ? reason.message : 'Unable to load session reports.')
    } finally {
      setReportLoading(false)
      setReportRefreshing(false)
    }
  }, [reportFrom, reportPage, reportSearch, reportStatus, reportTo])

  useEffect(() => {
    if (view !== 'reports') return
    setReportLoading(true)
    const timeout = window.setTimeout(() => void loadReports(), reportSearch.trim() ? 250 : 0)
    return () => window.clearTimeout(timeout)
  }, [loadReports, view])

  const exportReports = async () => {
    setExportingReport(true)
    setReportError('')
    const params = new URLSearchParams({ format: 'json', status: reportStatus })
    if (reportFrom) params.set('from', reportFrom)
    if (reportTo) params.set('to', reportTo)
    if (reportSearch.trim()) params.set('search', reportSearch.trim())
    try {
      const response = await fetch(`/api/hotspot/session-reports?${params.toString()}`, { cache: 'no-store' })
      const result = await response.json() as { error?: string; columns?: string[]; rows?: unknown[][] }
      if (!response.ok || !result.columns || !result.rows) throw new Error(result.error || 'Unable to export session reports.')
      const dateSuffix = new Date().toISOString().slice(0, 10)
      const pdfText = (value: unknown, maxLength = 40) => {
        const text = value === null || value === undefined ? '' : String(value).trim()
        return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text || '—'
      }
      const pdfDate = (value: unknown) => {
        if (!value) return '—'
        const date = new Date(String(value))
        return Number.isFinite(date.getTime())
          ? date.toLocaleString('en-KE', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Africa/Nairobi',
          })
          : '—'
      }
      const pdfLayout = result.columns[0] === 'Session ID'
        ? {
          headers: ['Subscriber', 'Service & account', 'Connection', 'Session timeline', 'Traffic'],
          columnWidths: [132, 130, 140, 225, 143],
          rows: result.rows.map((row) => {
            const value = (index: number) => row[index]
            const duration = value(13) === null || value(13) === undefined
              ? '—'
              : formatReportDuration(Number(value(13)))
            return [
              `Name: ${pdfText(value(1), 32)}\nUser: ${pdfText(value(2), 30)}\nPhone: ${pdfText(value(3), 20)}`,
              `Type: ${pdfText(value(4), 16)}\nPlan: ${pdfText(value(6), 28)}\nSession: ${pdfText(value(5), 14)}\nAccount: ${pdfText(value(19), 14)}\nExpiry: ${pdfDate(value(18))}`,
              `MAC: ${pdfText(value(7), 24)}\nIP: ${pdfText(value(8), 36)}\nRouter: ${pdfText(value(9), 30)}`,
              `Start: ${pdfDate(value(10))}\nEnd: ${pdfDate(value(11))}\nLast update: ${pdfDate(value(12))}\nDuration: ${duration}\nCause: ${pdfText(value(17), 28)}`,
              `Down: ${formatBytes(String(value(14) || 0))}\nUp: ${formatBytes(String(value(15) || 0))}\nTotal: ${formatBytes(String(value(16) || 0))}`,
            ]
          }),
        }
        : undefined
      await exportTabularReport({
        format: reportExportFormat,
        fileName: `lktech-session-report-${dateSuffix}`,
        title: 'Session history report',
        sheetName: 'Session report',
        headers: result.columns,
        rows: result.rows,
        ...(pdfLayout ? { pdfLayout } : {}),
      })
    } catch (reason) {
      setReportError(reason instanceof Error ? reason.message : 'Unable to export session reports.')
    } finally {
      setExportingReport(false)
    }
  }

  const counts = useMemo(() => ({
    All: data?.sessions.length ?? 0,
    PPPoE: data?.sessions.filter((session) => session.serviceType === 'PPPoE').length ?? 0,
    Hotspot: data?.sessions.filter((session) => session.serviceType === 'Hotspot').length ?? 0,
    Bindings: data?.sessions.filter((session) => Boolean(session.mac?.trim())).length ?? 0,
  }), [data])

  const visibleSessions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.sessions || []).filter((session) => {
      const matchesFilter = filter === 'All' ||
        (filter === 'Bindings' ? Boolean(session.mac?.trim()) : session.serviceType === filter)
      const searchText = [session.customerName, session.phone, session.username, session.ipAddress, session.mac, session.router]
        .filter(Boolean).join(' ').toLowerCase()
      return matchesFilter && (!query || searchText.includes(query))
    })
  }, [data, filter, search])

  const filters: SessionFilter[] = ['All', 'PPPoE', 'Hotspot', 'Bindings']
  const selectedTrafficTotal = selectedSession
    ? Number(selectedSession.downloadBytes) + Number(selectedSession.uploadBytes)
    : 0
  const downloadShare = selectedTrafficTotal > 0
    ? Math.max(6, Number(selectedSession?.downloadBytes || 0) / selectedTrafficTotal * 100)
    : 0
  const uploadShare = selectedTrafficTotal > 0
    ? Math.max(6, Number(selectedSession?.uploadBytes || 0) / selectedTrafficTotal * 100)
    : 0
  const selectedIsOnline = selectedSession
    ? Boolean(data?.sessions.some((session) => session.id === selectedSession.id))
    : false
  const sendSessionSms = async () => {
    if (!selectedSession?.customerId || !smsDraft.trim()) return
    setSendingSms(true)
    setActionMessage('')
    setActionError(false)
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(selectedSession.customerId)}/sms`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: smsDraft }),
      })
      const result = await response.json() as { message?: string; error?: string }
      if (!response.ok && response.status !== 202) throw new Error(result.error || 'Unable to send SMS.')
      setActionMessage(result.message || 'SMS queued for delivery.')
      setSmsOpen(false)
      setSmsDraft('')
    } catch (reason) {
      setActionError(true)
      setActionMessage(reason instanceof Error ? reason.message : 'Unable to send SMS.')
    } finally {
      setSendingSms(false)
    }
  }

  const suspendSessionAccount = async () => {
    if (!selectedSession?.customerId && !selectedSession?.username) return
    setSuspending(true)
    setActionMessage('')
    setActionError(false)
    try {
      const response = selectedSession.customerId
        ? await fetch(`/api/customers/${encodeURIComponent(selectedSession.customerId)}/status`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'suspended' }),
        })
        : await fetch('/api/hotspot/sessions/actions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'suspend', username: selectedSession.username }),
        })
      const result = await response.json() as { error?: string; status?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to suspend this subscriber.')
      setSelectedSession((current) => current ? { ...current, customerStatus: result.status || 'suspended' } : current)
      setActionMessage('Account suspended. The current session remains connected until disconnected from the router.')
      await load()
    } catch (reason) {
      setActionError(true)
      setActionMessage(reason instanceof Error ? reason.message : 'Unable to suspend this subscriber.')
    } finally {
      setSuspending(false)
    }
  }

  const manageRouterSession = async (action: 'disconnect' | 'reconnect') => {
    if (!selectedSession?.routerId || !selectedSession.routerSessionId || !selectedSession.routerSessionType) return
    setSessionAction(action)
    setActionMessage('')
    setActionError(false)
    try {
      const response = await fetch(`/api/routers/${encodeURIComponent(selectedSession.routerId)}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionType: selectedSession.routerSessionType,
          routerSessionId: selectedSession.routerSessionId,
        }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || `Unable to ${action} this session.`)
      setActionMessage(action === 'disconnect'
        ? 'Disconnect queued. The session will end when the router processes the command.'
        : 'Reconnect requested: the current session will be disconnected. The device must reconnect automatically or the user may need to reconnect manually.')
      await load()
    } catch (reason) {
      setActionError(true)
      setActionMessage(reason instanceof Error ? reason.message : `Unable to ${action} this session.`)
    } finally {
      setSessionAction(null)
    }
  }

  return (
    <section className="live-sessions-workspace">
      <header className="live-sessions-heading">
        <div>
          <div className="live-sessions-breadcrumb"><span>NETWORK</span><span>—</span><span>{view === 'live' ? 'LIVE SESSIONS' : 'SESSION REPORTS'}</span></div>
          <h1>{view === 'live' ? <>Currently <span>online.</span></> : <>Session <span>reports.</span></>}</h1>
          <p>{view === 'live' ? 'Everyone currently connected to your network, updated live as sessions change.' : 'Search session history, device details, traffic usage, expirations and disconnect reasons.'}</p>
        </div>
        <div className="live-sessions-refresh">
          <span>{view === 'live' ? (refreshedAt ? `Refreshed ${refreshedAt.toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' })}` : 'Waiting for data') : 'Historical RADIUS accounting records'}</span>
          <button className="outline-button" type="button" onClick={() => view === 'live' ? void load() : void loadReports()} disabled={view === 'live' ? refreshing : reportRefreshing}>
            <RefreshCw size={15} className={(view === 'live' ? refreshing : reportRefreshing) ? 'is-spinning' : undefined} />
            {(view === 'live' ? refreshing : reportRefreshing) ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <p className="dashboard-notice" role="alert">{error}</p>}
      {reportError && <p className="dashboard-notice" role="alert">{reportError}</p>}

      <nav className="live-sessions-view-tabs" aria-label="Session views">
        <button type="button" className={view === 'live' ? 'selected' : ''} aria-pressed={view === 'live'} onClick={() => setView('live')}>Currently online</button>
        <button type="button" className={view === 'reports' ? 'selected' : ''} aria-pressed={view === 'reports'} onClick={() => { setReportPage(1); setView('reports') }}>Session reports</button>
      </nav>

      {view === 'live' && <div className="live-sessions-summary">
        <article><span>ONLINE</span><strong>{loading ? '—' : (data?.connectedDevices ?? 0).toLocaleString('en-KE')}</strong><small>currently connected</small></article>
        <article><span>DOWNLOAD</span><strong>{loading ? '—' : formatBytes(data?.downloadBytes || 0)}</strong><small>across open sessions</small></article>
        <article><span>UPLOAD</span><strong>{loading ? '—' : formatBytes(data?.uploadBytes || 0)}</strong><small>across open sessions</small></article>
        <article><span>TOTAL TRAFFIC</span><strong>{loading ? '—' : formatBytes(data?.totalBytes || 0)}</strong><small>in + out · this session</small></article>
      </div>
      }

      {view === 'reports' && <div className="live-sessions-summary live-session-report-summary">
        <article><span>ALL MATCHING SESSIONS</span><strong>{reportLoading && !reportData ? '—' : (reportData?.summary.totalSessions ?? 0).toLocaleString('en-KE')}</strong><small>within selected filters</small></article>
        <article><span>WENT OFFLINE</span><strong>{reportLoading && !reportData ? '—' : (reportData?.summary.offlineSessions ?? 0).toLocaleString('en-KE')}</strong><small>normal disconnects and stops</small></article>
        <article><span>EXPIRED</span><strong>{reportLoading && !reportData ? '—' : (reportData?.summary.expiredSessions ?? 0).toLocaleString('en-KE')}</strong><small>plan expiry or session timeout</small></article>
        <article><span>UNIQUE DEVICES</span><strong>{reportLoading && !reportData ? '—' : (reportData?.summary.uniqueDevices ?? 0).toLocaleString('en-KE')}</strong><small>distinct device MACs</small></article>
        <article><span>TOTAL TRAFFIC</span><strong>{reportLoading && !reportData ? '—' : formatBytes((BigInt(reportData?.summary.downloadBytes || '0') + BigInt(reportData?.summary.uploadBytes || '0')).toString())}</strong><small>download + upload recorded</small></article>
      </div>}

      {view === 'live' && <div className="live-sessions-toolbar">
        <div className="live-session-filters" role="group" aria-label="Filter live sessions">
          {filters.map((item) => <button key={item} type="button" className={filter === item ? 'selected' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>
            {item}<span>{loading ? '—' : counts[item]}</span>
          </button>)}
        </div>
        <label className="live-session-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, username, IP..." aria-label="Search live sessions" /></label>
      </div>
      }

      {view === 'reports' && <>
        <div className="live-session-report-controls">
          <label>From <span>leave blank for all history</span><input type="date" value={reportFrom} max={reportTo || undefined} onChange={(event) => { setReportPage(1); setReportFrom(event.target.value) }} /></label>
          <label>To <input type="date" value={reportTo} min={reportFrom || undefined} onChange={(event) => { setReportPage(1); setReportTo(event.target.value) }} /></label>
          <label>Status <select value={reportStatus} onChange={(event) => { setReportPage(1); setReportStatus(event.target.value as ReportStatusFilter) }}><option value="all">All statuses</option><option value="online">Online</option><option value="offline">Offline</option><option value="expired">Expired</option></select></label>
          <label className="live-session-search"><Search size={17} /><input value={reportSearch} onChange={(event) => { setReportPage(1); setReportSearch(event.target.value) }} placeholder="Search subscriber, username, device, IP..." aria-label="Search session history" /></label>
          <select className="outline-button report-export-format" aria-label="Session report export format" value={reportExportFormat} onChange={(event) => setReportExportFormat(event.target.value as ReportExportFormat)} disabled={exportingReport || reportLoading}><option value="csv">CSV</option><option value="excel">Excel (.xlsx)</option><option value="pdf">PDF</option></select>
          <button className="outline-button" type="button" onClick={() => void exportReports()} disabled={exportingReport || reportLoading}><ArrowDownToLine size={15} />{exportingReport ? 'Exporting…' : 'Export report'}</button>
        </div>
        <section className="live-sessions-table-panel" aria-label="Session history report">
          {reportLoading && !reportData ? <p className="live-sessions-empty" role="status">Loading session history…</p> : reportData?.sessions.length === 0 ? <p className="live-sessions-empty">No session records match these filters.</p> : <>
            <div className="live-sessions-result-count">Showing {((reportPage - 1) * (reportData?.pageSize || 50)) + 1}–{Math.min(reportPage * (reportData?.pageSize || 50), reportData?.total || 0)} of {(reportData?.total || 0).toLocaleString('en-KE')} matching sessions</div>
            <div className="live-sessions-table-scroll"><table className="live-session-report-table">
              <thead><tr><th>STATUS</th><th>SUBSCRIBER · USERNAME</th><th>DEVICE · IP</th><th>PLAN · SERVICE</th><th>ROUTER</th><th>STARTED</th><th>LAST RADIUS UPDATE</th><th>ENDED · DURATION</th><th>DOWNLOAD · UPLOAD</th><th>DISCONNECT REASON</th></tr></thead>
              <tbody>{(reportData?.sessions || []).map((record) => <tr key={record.id}>
                <td><span className={`live-session-report-status ${record.status}`}>{record.status}</span></td>
                <td><strong>{record.customerName || record.username || 'Unknown subscriber'}</strong><small>{record.username || record.phone || 'No username on record'}</small><small className="live-session-report-id">ID {record.id}</small></td>
                <td><span className="live-session-device">{record.mac || 'No MAC reported'}</span><small className="live-session-ip">{record.ipAddress || 'No IP reported'}</small></td>
                <td><strong>{record.plan || 'Plan not recorded'}</strong><small>{record.serviceType}{record.customerStatus ? ` · account ${record.customerStatus}` : ''}</small><small>{record.expiresAt ? `Expiry · ${formatStartTime(record.expiresAt)}` : 'No expiry recorded'}</small></td>
                <td>{formatAddress(record.router)}</td>
                <td>{formatStartTime(record.startedAt)}</td>
                <td>{formatStartTime(record.lastActivityAt)}</td>
                <td><strong>{formatStartTime(record.endedAt)}</strong><small>{formatReportDuration(record.durationSeconds)}</small></td>
                <td><strong className="live-session-download">{formatBytes(record.downloadBytes)}</strong><small>↑ {formatBytes(record.uploadBytes)}</small></td>
                <td>{record.terminateCause || (record.status === 'online' ? 'Still connected' : 'Not reported')}</td>
              </tr>)}</tbody>
            </table></div>
            <div className="live-session-report-pagination"><span>Page {reportPage} of {Math.max(1, reportData?.pages || 1)}</span><div>
              <button type="button" className="outline-button" disabled={reportPage <= 1 || reportLoading} onClick={() => setReportPage((page) => Math.max(1, page - 1))}><ArrowLeft size={14} />Previous</button>
              <button type="button" className="outline-button" disabled={reportPage >= (reportData?.pages || 1) || reportLoading} onClick={() => setReportPage((page) => page + 1)}>Next<ArrowRight size={14} /></button>
            </div></div>
          </>}
        </section>
        <p className="live-sessions-footnote">Expired includes account expiry at session end or a RADIUS session/idle timeout. Session history is limited to records received by the RADIUS accounting server.</p>
      </>}

      {view === 'live' && <section className="live-sessions-table-panel" aria-label="Currently online subscribers">
        {loading ? <p className="live-sessions-empty" role="status">Loading live sessions…</p> : visibleSessions.length === 0 ? <p className="live-sessions-empty">{search || filter !== 'All' ? 'No sessions match your filters.' : 'No subscribers are online right now.'}</p> : <>
          <div className="live-sessions-result-count">{visibleSessions.length} online {visibleSessions.length === 1 ? 'session' : 'sessions'}{data && data.activeSessions > data.sessions.length ? ` · showing ${data.sessions.length} of ${data.activeSessions}` : ''}</div>
          <div className="live-sessions-table-scroll"><table>
            <thead><tr><th aria-label="Select session"><span className="live-session-checkbox" /></th><th>SUBSCRIBER</th><th>USED · DOWN / UP</th><th>SPEED · DOWN / UP</th><th>DEVICE · IP</th><th>ROUTER</th><th>ONLINE FOR</th><th>EXPIRY</th><th aria-label="Open details" /></tr></thead>
            <tbody>{visibleSessions.map((session) => {
              const expiry = formatExpiry(session.expiresAt)
              return <tr key={session.id} className={selectedSession?.id === session.id ? 'is-selected' : ''} tabIndex={0} aria-label={`Open ${session.customerName || session.username || 'subscriber'} session details`} onClick={() => { setSelectedSession(session); setSmsOpen(false); setActionMessage(''); setActionError(false) }} onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedSession(session)
                  setSmsOpen(false)
                  setActionMessage('')
                  setActionError(false)
                }
              }}>
              <td><span className="live-session-checkbox" aria-hidden="true" /></td>
              <td><strong>{session.customerName || session.username || 'Unknown subscriber'}</strong><small>{session.username || session.phone || 'No username on record'}</small></td>
              <td><b className="live-session-download">{formatBytes(session.downloadBytes)}</b><span className="live-session-traffic-separator"> · </span>{formatBytes(session.uploadBytes)}</td>
              <td className="live-session-speed"><strong>↓ {formatSpeed(session.downloadBps)}</strong><small>↑ {formatSpeed(session.uploadBps)}</small></td>
              <td><span className="live-session-device">{session.mac?.trim() || '—'}</span><small className="live-session-ip">{session.ipAddress || '—'}</small></td>
              <td><strong>{session.router || '—'}</strong></td>
              <td>{formatDuration(session.startedAt)}</td>
              <td><strong>{expiry.date}</strong><small className={session.expiresAt && new Date(session.expiresAt).getTime() > Date.now() ? 'is-expiry-upcoming' : 'is-expiry-ended'}>{expiry.remaining}</small></td>
              <td><button className="live-session-open" type="button" aria-label={`View ${session.customerName || session.username || 'subscriber'} session details`} onClick={(event) => { event.stopPropagation(); setSelectedSession(session); setSmsOpen(false); setActionMessage(''); setActionError(false) }}><ArrowUpRight size={15} /></button></td>
            </tr>})}</tbody>
          </table></div>
        </>}
      </section>
      }
      {view === 'live' && <p className="live-sessions-footnote">Session data refreshes every 5 seconds. Live speeds require an active router connector; — means no recent counter sample is available.</p>}
      {selectedSession && <div className="live-session-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetails() }}>
        <aside className="live-session-drawer" role="dialog" aria-modal="true" aria-labelledby="live-session-drawer-title">
          <header className="live-session-drawer-header">
            <button type="button" className="live-session-drawer-close" onClick={closeDetails} aria-label="Close session details"><X size={17} /></button>
            <span className="live-session-eyebrow">LIVE SESSION</span>
            <div className="live-session-drawer-identity">
              <div className="live-session-avatar">{(selectedSession.customerName || selectedSession.username || 'U').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>
              <div>
                <h2 id="live-session-drawer-title">{selectedSession.customerName || selectedSession.username || 'Unknown subscriber'}</h2>
                <div className="live-session-drawer-meta">
                  <span className={`live-session-status ${selectedIsOnline ? 'online' : 'offline'}`}><i />{selectedIsOnline ? 'Online' : 'Offline'}</span>
                  <span className={`live-session-type ${selectedSession.serviceType.toLowerCase()}`}>{selectedSession.serviceType === 'PPPoE' ? <Signal size={12} /> : <Wifi size={12} />}{selectedSession.serviceType}</span>
                  <span>{selectedSession.phone || 'No phone on record'}</span>
                </div>
              </div>
            </div>
            {selectedSession.customerId && <button className="live-session-profile-link" type="button" onClick={() => {
              onOpenSubscriber(selectedSession.customerId!)
              closeDetails()
            }}>Open full profile <ArrowUpRight size={13} /></button>}
          </header>
          <div className="live-session-drawer-content">
            <section className="live-session-plan-card">
              <span>PLAN</span>
              <strong>{selectedSession.plan || `${selectedSession.serviceType} service`}</strong>
              <small>{selectedSession.username ? `Username · ${selectedSession.username}` : selectedSession.serviceType}</small>
              <div className="live-session-plan-expiry"><Clock3 size={13} /><span>Ends {formatExpiry(selectedSession.expiresAt).date}</span><b>{formatExpiry(selectedSession.expiresAt).remaining}</b></div>
            </section>
            <div className="live-session-detail-metrics">
              <article><span>DOWNLOAD</span><strong>{formatBytes(selectedSession.downloadBytes)}</strong><i style={{ width: `${downloadShare}%` }} /></article>
              <article><span>UPLOAD</span><strong>{formatBytes(selectedSession.uploadBytes)}</strong><i style={{ width: `${uploadShare}%` }} /></article>
              <article><span>DOWNLOAD SPEED</span><strong>{formatSpeed(selectedSession.downloadBps)}</strong><small>live router rate</small></article>
              <article><span>UPLOAD SPEED</span><strong>{formatSpeed(selectedSession.uploadBps)}</strong><small>live router rate</small></article>
              <article className="live-session-elapsed-card"><span>{selectedIsOnline ? 'TIME USED · ELAPSED' : 'SESSION DURATION'}</span><strong>{selectedIsOnline ? formatElapsedClock(selectedSession.startedAt, clockNow) : formatDuration(selectedSession.startedAt)}</strong><small>{selectedIsOnline ? 'since this session connected · updates every second' : 'session is no longer active'}</small></article>
              <article className="live-session-elapsed-card"><span>TIME REMAINING</span><strong>{formatTimeRemaining(selectedSession.expiresAt, clockNow)}</strong><small>{selectedSession.expiresAt ? 'until account expiry · live countdown' : 'no account expiry is recorded'}</small></article>
              <article><span>ACCOUNT</span><strong>{selectedSession.customerStatus || (selectedSession.customerId ? 'Active' : 'Voucher')}</strong><small>{selectedSession.customerId ? 'subscriber status' : 'hotspot login'}</small></article>
            </div>
            <section className="live-session-connection">
              <span>CONNECTION</span>
              <dl>
                <div><dt>Router</dt><dd>{formatAddress(selectedSession.router)}</dd></div>
                <div><dt>Device</dt><dd>{selectedSession.mac?.trim() || 'Not reported'}</dd></div>
                <div><dt>IP address</dt><dd>{formatAddress(selectedSession.ipAddress)}</dd></div>
                <div><dt>Username</dt><dd>{selectedSession.username || 'Not reported'}</dd></div>
                <div><dt>Connected</dt><dd>{formatStartTime(selectedSession.startedAt)}</dd></div>
                <div><dt>Last activity</dt><dd>{formatStartTime(selectedSession.lastActivityAt)}</dd></div>
                <div><dt>Session ID</dt><dd>{selectedSession.id}</dd></div>
              </dl>
            </section>
            {actionMessage && <p className={`live-session-action-message${actionError ? ' is-error' : ''}`} role={actionError ? 'alert' : 'status'}>{actionMessage}</p>}
            {smsOpen && <section className="live-session-sms-compose">
              <label htmlFor="live-session-sms">Message to {selectedSession.customerName || 'subscriber'}</label>
              <textarea id="live-session-sms" value={smsDraft} onChange={(event) => setSmsDraft(event.target.value)} maxLength={500} rows={3} placeholder="Type your message…" />
              <div><small>{smsDraft.length}/500 characters</small><button type="button" disabled={sendingSms || !smsDraft.trim()} onClick={() => void sendSessionSms()}>{sendingSms ? 'Sending…' : 'Send message'}</button></div>
            </section>}
          </div>
          <footer className="live-session-drawer-actions">
            <button type="button" disabled={!selectedSession.customerId || !selectedSession.phone || sendingSms} onClick={() => { setSmsOpen((open) => !open); setActionMessage('') }}><MessageCircle size={14} /> SMS</button>
            {selectedIsOnline && selectedSession.routerId && selectedSession.routerSessionId && selectedSession.routerSessionType && <>
              <button type="button" disabled={Boolean(sessionAction) || suspending} onClick={() => void manageRouterSession('disconnect')}><Unplug size={14} />{sessionAction === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}</button>
              <button type="button" disabled={Boolean(sessionAction) || suspending} onClick={() => void manageRouterSession('reconnect')}><RotateCw size={14} />{sessionAction === 'reconnect' ? 'Requesting…' : 'Reconnect'}</button>
            </>}
            {(selectedSession.customerId || selectedSession.username) && selectedSession.customerStatus !== 'suspended' && selectedSession.customerStatus !== 'disabled' && <button type="button" className="is-danger" disabled={suspending || Boolean(sessionAction)} onClick={() => void suspendSessionAccount()}><Ban size={14} />{suspending ? 'Suspending…' : 'Suspend'}</button>}
          </footer>
        </aside>
      </div>}
    </section>
  )
}
