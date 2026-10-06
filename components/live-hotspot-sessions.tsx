'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Wifi } from 'lucide-react'

type HotspotSession = {
  id: string
  username: string | null
  mac: string | null
  ipAddress: string | null
  startedAt: string | null
}

type HotspotSessionsResponse = {
  connectedDevices: number
  activeSessions: number
  sessions: HotspotSession[]
  error?: string
}

function formatStartTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '—'
}

export function LiveHotspotSessions() {
  const [data, setData] = useState<HotspotSessionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setRefreshing(true)
    setError('')
    try {
      const response = await fetch('/api/hotspot/sessions', { cache: 'no-store' })
      const result = await response.json() as HotspotSessionsResponse
      if (!response.ok) throw new Error(result.error || 'Unable to load live hotspot sessions.')
      setData(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load live hotspot sessions.')
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

  return (
    <section className="live-sessions-workspace">
      <div className="page-heading">
        <div>
          <div className="live-label"><span className="status-dot status-green" aria-hidden="true" /> HOTSPOT NETWORK</div>
          <h1>Live sessions</h1>
          <p>See hotspot devices currently connected to your network.</p>
        </div>
        <button className="outline-button" type="button" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? 'is-spinning' : undefined} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="dashboard-notice" role="alert">{error}</p>}

      <div className="live-sessions-summary">
        <article className="metric-card">
          <div className="metric-top">
            <span className="eyebrow">Connected devices</span>
            <span className="metric-icon green"><Wifi size={17} /></span>
          </div>
          <div className="metric-value">{loading ? '—' : data?.connectedDevices.toLocaleString() ?? '—'}</div>
          <div className="metric-bottom"><span>{loading ? 'Loading live count…' : `${data?.activeSessions.toLocaleString() ?? 0} active RADIUS sessions`}</span></div>
        </article>
      </div>

      <section className="panel operations-panel">
        <div className="panel-heading">
          <div>
            <h3>Connected hotspot devices</h3>
            <span>{loading ? 'Loading sessions…' : `Updated automatically every 30 seconds · ${data?.sessions.length ?? 0}${(data?.activeSessions ?? 0) > 100 ? ' of 100' : ''} shown`}</span>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Device address</th><th>Hotspot username</th><th>IP address</th><th>Connected since</th></tr></thead>
            <tbody>
              {!loading && data?.sessions.length === 0 && <tr><td colSpan={4}>No hotspot devices are currently connected.</td></tr>}
              {data?.sessions.map((item) => (
                <tr key={item.id}>
                  <td className="mono">{item.mac?.trim() || 'Address unavailable'}</td>
                  <td>{item.username || '—'}</td>
                  <td className="mono">{item.ipAddress || '—'}</td>
                  <td>{formatStartTime(item.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
