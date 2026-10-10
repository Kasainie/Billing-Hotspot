'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock3, RefreshCw, Search, Signal, Wifi } from 'lucide-react'

type HotspotSession = {
  id: string
  username: string | null
  mac: string | null
  ipAddress: string | null
  startedAt: string | null
  phone: string | null
  customerName: string | null
  serviceType: 'PPPoE' | 'Hotspot'
  router: string | null
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

type SessionFilter = 'All' | 'PPPoE' | 'Hotspot' | 'Bindings'

function formatBytes(value: string | number) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** exponent).toLocaleString('en-KE', { maximumFractionDigits: 1 })} ${units[exponent]}`
}

function formatStartTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-KE') : '—'
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

export function LiveHotspotSessions() {
  const [data, setData] = useState<HotspotSessionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<SessionFilter>('All')
  const [search, setSearch] = useState('')
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setRefreshing(true)
    setError('')
    try {
      const response = await fetch('/api/hotspot/sessions', { cache: 'no-store' })
      const result = await response.json() as HotspotSessionsResponse
      if (!response.ok) throw new Error(result.error || 'Unable to load live sessions.')
      setData(result)
      setRefreshedAt(new Date())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load live sessions.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => void load(), 30_000)
    return () => window.clearInterval(interval)
  }, [load])

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

  return (
    <section className="live-sessions-workspace">
      <header className="live-sessions-heading">
        <div>
          <div className="live-sessions-breadcrumb"><span>NETWORK</span><span>—</span><span>LIVE SESSIONS</span></div>
          <h1>Currently <span>online.</span></h1>
          <p>Everyone currently connected to your network, updated live as sessions change.</p>
        </div>
        <div className="live-sessions-refresh">
          <span>{refreshedAt ? `Refreshed ${refreshedAt.toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' })}` : 'Waiting for data'}</span>
          <button className="outline-button" type="button" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? 'is-spinning' : undefined} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <p className="dashboard-notice" role="alert">{error}</p>}

      <div className="live-sessions-summary">
        <article><span>ONLINE</span><strong>{loading ? '—' : (data?.connectedDevices ?? 0).toLocaleString('en-KE')}</strong><small>currently connected</small></article>
        <article><span>DOWNLOAD</span><strong>{loading ? '—' : formatBytes(data?.downloadBytes || 0)}</strong><small>across open sessions</small></article>
        <article><span>UPLOAD</span><strong>{loading ? '—' : formatBytes(data?.uploadBytes || 0)}</strong><small>across open sessions</small></article>
        <article><span>TOTAL TRAFFIC</span><strong>{loading ? '—' : formatBytes(data?.totalBytes || 0)}</strong><small>in + out · this session</small></article>
      </div>

      <div className="live-sessions-toolbar">
        <div className="live-session-filters" role="group" aria-label="Filter live sessions">
          {filters.map((item) => <button key={item} type="button" className={filter === item ? 'selected' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>
            {item}<span>{loading ? '—' : counts[item]}</span>
          </button>)}
        </div>
        <label className="live-session-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, username, IP..." aria-label="Search live sessions" /></label>
      </div>

      <section className="live-sessions-table-panel" aria-label="Currently online subscribers">
        {loading ? <p className="live-sessions-empty" role="status">Loading live sessions…</p> : visibleSessions.length === 0 ? <p className="live-sessions-empty">{search || filter !== 'All' ? 'No sessions match your filters.' : 'No subscribers are online right now.'}</p> : <>
          <div className="live-sessions-result-count">{visibleSessions.length} online {visibleSessions.length === 1 ? 'session' : 'sessions'}{data && data.activeSessions > data.sessions.length ? ` · showing ${data.sessions.length} of ${data.activeSessions}` : ''}</div>
          <div className="live-sessions-table-scroll"><table>
            <thead><tr><th>SUBSCRIBER</th><th>TYPE</th><th>DEVICE / MAC</th><th>IP ADDRESS</th><th>ROUTER</th><th>CONNECTED</th><th>DURATION</th><th>DOWNLOAD</th><th>UPLOAD</th></tr></thead>
            <tbody>{visibleSessions.map((session) => <tr key={session.id}>
              <td><strong>{session.customerName || session.username || 'Unknown subscriber'}</strong><small>{session.phone || session.username || 'No phone on record'}</small></td>
              <td><span className={`live-session-type ${session.serviceType.toLowerCase()}`}>{session.serviceType === 'PPPoE' ? <Signal size={13} /> : <Wifi size={13} />}{session.serviceType}</span></td>
              <td className="mono">{session.mac?.trim() || '—'}</td>
              <td className="mono">{session.ipAddress || '—'}</td>
              <td className="mono">{session.router || '—'}</td>
              <td>{formatStartTime(session.startedAt)}</td>
              <td><span className="live-session-duration"><Clock3 size={13} />{formatDuration(session.startedAt)}</span></td>
              <td>{formatBytes(session.downloadBytes)}</td>
              <td>{formatBytes(session.uploadBytes)}</td>
            </tr>)}</tbody>
          </table></div>
        </>}
      </section>
      <p className="live-sessions-footnote">Session data refreshes automatically every 30 seconds.</p>
    </section>
  )
}
