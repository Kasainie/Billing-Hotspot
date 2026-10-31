'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, Download, Target, TrendingUp, Wifi } from 'lucide-react'

type DashboardData = {
  sites: { id: string; name: string; location: string }[]
  customers: { id: string; name: string; status: string; plan: string | null; expiresAt: string | null; monthlyRate: number; createdAt: string; siteId: string | null }[]
  payments: { id: string; customerId: string | null; amount: number; status: string; method: string | null; paidAt: string; reference: string | null }[]
  packages: { id: string; name: string; type: string; monthlyPrice: number; downloadMbps: number; uploadMbps: number; active: boolean }[]
  summary: { activeCustomers: number; totalCustomers: number; siteCount: number; paidRevenue: number; paidPaymentCount: number }
}

type SessionData = {
  activeSessions: number
  connectedDevices: number
  downloadBytes: string
  uploadBytes: string
  totalBytes: string
  sessions: { username: string | null; customerName: string | null; plan: string | null; startedAt: string | null; downloadBytes: string; uploadBytes: string; router: string | null; serviceType: string }[]
}

type RouterData = {
  routers: { id: string; routerName: string; status: string; siteName: string; activeHotspotUsers: number | null; activePppoeUsers: number | null; monitored: boolean; cpuLoad?: number | null; memoryUsedPercent?: number | null; metricsUpdatedAt?: string | null }[]
}

type AnalyticsData = {
  generatedAt: string
  summary: {
    activeSubscribers: number
    totalSubscribers: number
    newSubscribers: number
    activeSessions: number
    connectedDevices: number
    revenue: number
    paymentCount: number
    payingSubscribers: number
    downloadBytes: string | number
    uploadBytes: string | number
    routerCount: number
  }
  dailyRevenue: { date: string; revenue: number; payments: number }[]
  methods: { method: string; revenue: number; payments: number }[]
  topCustomers: { id: string; name: string; revenue: number }[]
  topPackages: { name: string; subscribers: number; revenue: number }[]
  subscribers: { date: string; subscribers: number }[]
  lifecycle: { active: number; suspended: number; inactive: number; hotspot: number; pppoe: number; expiring7: number; expiring14: number; expiring30: number; expired: number }
  traffic: { active: number; sessions: number; downloadBytes: number; uploadBytes: number }
  topTalkers: { name: string; bytes: number; sessions: number }[]
  routers: { id: string; name: string; siteName: string; lastSeenAt: string | null; active_hotspot_users: number | null; active_pppoe_users: number | null; cpu_load: number | null; metricsUpdatedAt: string | null }[]
  heatmap: { weekday: number; hour: number; devices: number }[]
  expenses: { amount: number; count: number }
  routerPerformance: { id: string; name: string; status: string; subscribers: number; revenue: number; sessions: number; data: string | number }[]
  unlinkedPerformance: { subscribers: number; revenue: number; sessions: number; data: string | number }
}

const formatBytes = (value: string | number) => {
  const bytes = Number(value) || 0
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(2)} TB`
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

const money = (value: number) => `Ksh ${Math.round(value).toLocaleString('en-KE')}`

export function StandaloneAnalytics() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [sessions, setSessions] = useState<SessionData | null>(null)
  const [routers, setRouters] = useState<RouterData | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [period, setPeriod] = useState('Monthly')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [routerFilter, setRouterFilter] = useState('All routers')
  const [serviceFilter, setServiceFilter] = useState<'All' | 'Hotspot' | 'PPPoE'>('All')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revenueTarget, setRevenueTarget] = useState(0)
  const [subscriberTarget, setSubscriberTarget] = useState(0)

  useEffect(() => {
    setRevenueTarget(Number(localStorage.getItem('analytics-revenue-target') || 0))
    setSubscriberTarget(Number(localStorage.getItem('analytics-subscriber-target') || 0))
    const load = async () => {
      try {
        const query = new URLSearchParams({ period })
        if (period === 'Custom' && customStart) query.set('start', customStart)
        if (period === 'Custom' && customEnd) query.set('end', customEnd)
        const [analyticsResponse, dashboardResponse, sessionsResponse, routersResponse] = await Promise.all([
          fetch(`/api/analytics?${query}`, { cache: 'no-store' }),
          fetch('/api/dashboard?range=30 days', { cache: 'no-store' }),
          fetch('/api/hotspot/sessions', { cache: 'no-store' }),
          fetch('/api/routers', { cache: 'no-store' }),
        ])
        const [analyticsResult, dashboardResult, sessionsResult, routersResult] = await Promise.all([
          analyticsResponse.json(), dashboardResponse.json(), sessionsResponse.json(), routersResponse.json(),
        ])
        if (!analyticsResponse.ok) throw new Error(analyticsResult.error || 'Unable to load analytics.')
        setAnalytics(analyticsResult)
        setDashboard(dashboardResult)
        setSessions(sessionsResult)
        setRouters(routersResult)
        setError('')
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Unable to load analytics.')
      } finally {
        setLoading(false)
      }
    }
    void load()
    const interval = window.setInterval(load, 30_000)
    return () => window.clearInterval(interval)
  }, [period, customStart, customEnd])

  const paidPayments = useMemo(() => (dashboard?.payments || []).filter((payment) => payment.status === 'paid'), [dashboard])
  const filteredPayments = useMemo(() => paidPayments, [paidPayments])
  const revenue = Number(analytics?.summary.revenue || 0)
  const activeSubscribers = Number(analytics?.summary.activeSubscribers || 0)
  const totalCustomers = Number(analytics?.summary.totalSubscribers || 0)
  const downloadBytes = Number(analytics?.summary.downloadBytes || analytics?.traffic.downloadBytes || 0)
  const uploadBytes = Number(analytics?.summary.uploadBytes || analytics?.traffic.uploadBytes || 0)
  const totalBytes = downloadBytes + uploadBytes
  const packageUsage = useMemo(() => (analytics?.topPackages || []).map((item) => [item.name, item.revenue] as [string, number]), [analytics])
  const topTalkers = useMemo(() => (analytics?.topTalkers || []).map((item) => [item.name, item.bytes] as [string, number]), [analytics])
  const topCustomers = useMemo(() => (analytics?.topCustomers || []).map((item) => [item.name, Number(item.revenue)] as [string, number]), [analytics])
  const revenueByMethod = useMemo(() => (analytics?.methods || []).map((item) => [item.method, Number(item.revenue)] as [string, number]), [analytics])
  const dailyRevenue = useMemo(() => (analytics?.dailyRevenue || []).map((item) => ({
    label: new Date(item.date).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }),
    amount: Number(item.revenue),
  })), [analytics])

  const expiringSoon = useMemo(() => ({
    '7 days': Number(analytics?.lifecycle.expiring7 || 0),
    '14 days': Number(analytics?.lifecycle.expiring14 || 0),
    '30 days': Number(analytics?.lifecycle.expiring30 || 0),
  }), [analytics])

  const subscriberTypes = useMemo(() => ({
    hotspot: Number(analytics?.lifecycle.hotspot || 0),
    pppoe: Number(analytics?.lifecycle.pppoe || 0),
    total: totalCustomers,
  }), [analytics, totalCustomers])

  const paymentCount = Number(analytics?.summary.paymentCount || 0)
  const payingSubscribers = Number(analytics?.summary.payingSubscribers || 0)
  const arpu = payingSubscribers ? revenue / payingSubscribers : 0
  const maxRevenue = Math.max(1, ...dailyRevenue.map((day) => day.amount))
  const currentMonthRevenue = revenue
  const averageRevenue = paymentCount ? revenue / paymentCount : 0

  const setTarget = (kind: 'revenue' | 'subscriber') => {
    const current = kind === 'revenue' ? revenueTarget : subscriberTarget
    const value = window.prompt(kind === 'revenue' ? 'Set monthly revenue target (Ksh)' : 'Set monthly subscriber target', String(current || 0))
    if (!value) return
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) return
    if (kind === 'revenue') {
      setRevenueTarget(parsed)
      localStorage.setItem('analytics-revenue-target', String(parsed))
    } else {
      setSubscriberTarget(parsed)
      localStorage.setItem('analytics-subscriber-target', String(parsed))
    }
  }

  const exportCsv = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Active subscribers', activeSubscribers],
      ['Revenue', revenue],
      ['ARPU', arpu],
      ['Active sessions', analytics?.summary.activeSessions || 0],
      ['Data transferred', totalBytes],
      ['Routers', analytics?.summary.routerCount || 0],
      ...revenueByMethod.map(([method, value]) => [method, value]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="standalone-analytics"><div className="analytics-loading">Loading analytics…</div></div>
  if (error) return <div className="standalone-analytics"><div className="analytics-error" role="alert">{error}</div></div>

  return (
    <div className="standalone-analytics">
      <div className="analytics-heading">
        <div><span className="analytics-eyebrow">INSIGHTS — ANALYTICS</span><h1>Your <em>network.</em></h1><p><strong>{analytics?.summary.routerCount || 0} MikroTik routers</strong><span>·</span>{period}<span>·</span>Live · Updated {analytics?.generatedAt ? new Date(analytics.generatedAt).toLocaleTimeString() : 'now'}</p></div>
        <button type="button" className="analytics-export" onClick={exportCsv}><Download size={16} /> Export CSV</button>
      </div>

      <div className="analytics-toolbar">
        <div className="analytics-periods">
          {['Daily', 'Weekly', 'Monthly', 'Yearly', 'Last Year', 'Custom'].map((value) => <button type="button" className={period === value ? 'is-active' : ''} onClick={() => setPeriod(value)} key={value}>{value === 'Custom' && <CalendarDays size={14} />}{value}</button>)}
        </div>
        <select value={routerFilter} onChange={(event) => setRouterFilter(event.target.value)} aria-label="Filter analytics by router"><option>All routers</option>{routers?.routers.map((router) => <option key={router.id}>{router.routerName}</option>)}</select>
      </div>
      {period === 'Custom' && <div className="analytics-custom-range"><label>Start <input type="datetime-local" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label>End <input type="datetime-local" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label></div>}

      <div className="analytics-kpis">
        <article><span>ACTIVE SUBSCRIBERS</span><strong>{activeSubscribers}</strong><small>{analytics?.summary.newSubscribers || 0} new in period</small></article>
        <article><span>REVENUE</span><strong>{money(revenue)}</strong><small>{period}</small></article>
        <article><span title="Average Revenue Per User: revenue divided by the number of unique subscribers with a paid payment in the selected period">ARPU</span><strong>{money(arpu)}</strong><small>{payingSubscribers} paying {payingSubscribers === 1 ? 'subscriber' : 'subscribers'} · {period}</small></article>
        <article><span>ACTIVE SESSIONS</span><strong>{analytics?.summary.activeSessions || 0}</strong><small>{analytics?.traffic.sessions || 0} sessions in period</small></article>
        <article><span>DATA TRANSFERRED</span><strong>{formatBytes(totalBytes)}</strong><small>{formatBytes(downloadBytes)} down</small></article>
        <article><span>ONLINE NOW</span><strong>{analytics?.summary.connectedDevices || 0}</strong><small>connected devices</small></article>
        <article><span>PAYMENTS</span><strong>{paymentCount}</strong><small>{period}</small></article>
        <article><span>EXPENSES</span><strong>{money(Number(analytics?.expenses.amount || 0))}</strong><small>{analytics?.expenses.count || 0} recorded</small></article>
      </div>

      <h2 className="analytics-section-label">THIS MONTH&apos;S TARGETS</h2>
      <div className="analytics-target-grid">
        <article className="analytics-card analytics-target"><div className="analytics-card-heading"><div><h3>Revenue collected</h3><p>{new Date().toLocaleString('en-KE', { month: 'long', year: 'numeric' })} · every router</p></div><button type="button" onClick={() => setTarget('revenue')}><Target size={14} /> Set target</button></div><div className="analytics-target-body"><strong>{money(currentMonthRevenue)} <small>{revenueTarget ? `of ${money(revenueTarget)} target` : 'so far this month'}</small></strong>{revenueTarget ? <div className="analytics-progress"><span style={{ width: `${Math.min(100, currentMonthRevenue / revenueTarget * 100)}%` }} /></div> : <p>You averaged {money(averageRevenue)} per payment. <button type="button" onClick={() => setTarget('revenue')}>Set a target</button></p>}</div></article>
        <article className="analytics-card analytics-target"><div className="analytics-card-heading"><div><h3>New subscribers</h3><p>{new Date().toLocaleString('en-KE', { month: 'long', year: 'numeric' })} · every router</p></div><button type="button" onClick={() => setTarget('subscriber')}><Target size={14} /> Set target</button></div><div className="analytics-target-body"><strong>{totalCustomers} <small>{subscriberTarget ? `of ${subscriberTarget} target` : 'so far this month'}</small></strong>{subscriberTarget ? <div className="analytics-progress"><span style={{ width: `${Math.min(100, totalCustomers / subscriberTarget * 100)}%` }} /></div> : <p>No history yet to suggest a target. <button type="button" onClick={() => setTarget('subscriber')}>Set a target</button></p>}</div></article>
      </div>

      <h2 className="analytics-section-label">REVENUE &amp; BILLING</h2>
      <article className="analytics-card analytics-revenue-chart">
        <div className="analytics-card-heading"><div><h3>Payments trend · {period}</h3><p>Payments vs previous period, with expenses</p></div><div className="analytics-inline-controls"><button className={serviceFilter === 'All' ? 'is-active' : ''} onClick={() => setServiceFilter('All')}>All</button><button className={serviceFilter === 'Hotspot' ? 'is-active' : ''} onClick={() => setServiceFilter('Hotspot')}>Hotspot</button><button className={serviceFilter === 'PPPoE' ? 'is-active' : ''} onClick={() => setServiceFilter('PPPoE')}>PPPoE</button></div></div>
        <div className="analytics-bar-chart">{dailyRevenue.map((day) => <div key={day.label} title={`${day.label}: ${money(day.amount)}`}><span style={{ height: `${Math.max(day.amount ? 8 : 2, day.amount / maxRevenue * 100)}%` }} /></div>)}</div>
        <div className="analytics-chart-footer"><span>This period <strong>{money(revenue)}</strong></span><span>Average <strong>{money(averageRevenue)}</strong></span></div>
      </article>

      <div className="analytics-grid-two">
        <article className="analytics-card"><div className="analytics-card-heading"><div><h3>Top packages · {period}</h3><p>Monthly value by configured subscriber plan</p></div></div><div className="analytics-ranking">{packageUsage.length ? packageUsage.map(([name, value], index) => <div key={name}><span><b>#{index + 1}</b>{name}</span><div className="analytics-ranking-track"><span style={{ width: `${packageUsage[0]?.[1] ? value / packageUsage[0][1] * 100 : 0}%` }} /></div><strong>{money(value)}</strong></div>) : <p className="analytics-empty">No package data.</p>}</div></article>
        <article className="analytics-card"><div className="analytics-card-heading"><div><h3>Top customers · {period}</h3><p>Highest-paying subscribers</p></div></div><div className="analytics-ranking">{topCustomers.length ? topCustomers.map(([name, value], index) => <div key={name}><span><b>#{index + 1}</b>{name}</span><div className="analytics-ranking-track"><span style={{ width: `${topCustomers[0]?.[1] ? value / topCustomers[0][1] * 100 : 0}%` }} /></div><strong>{money(value)}</strong></div>) : <p className="analytics-empty">No customer payment data.</p>}</div></article>
      </div>

      <div className="analytics-grid-two">
        <article className="analytics-card"><div className="analytics-card-heading"><div><h3>Revenue mix · {period}</h3><p>{money(revenue)} total</p></div></div><div className="analytics-donut" style={{ '--analytics-donut': `${revenue ? 100 : 0}%` } as React.CSSProperties}><span><strong>{money(revenue)}</strong><small>TOTAL</small></span></div><div className="analytics-method-list"><div><span><i /> Hotspot</span><strong>{money(revenueByMethod.filter(([method]) => /hotspot|voucher/i.test(method)).reduce((sum, [, value]) => sum + value, 0))}</strong></div><div><span><i /> PPPoE</span><strong>{money(revenueByMethod.filter(([method]) => !/hotspot|voucher/i.test(method)).reduce((sum, [, value]) => sum + value, 0))}</strong></div></div></article>
        <article className="analytics-card"><div className="analytics-card-heading"><div><h3>Payment methods · {period}</h3><p>{money(revenue)} total</p></div></div><div className="analytics-method-list">{revenueByMethod.length ? revenueByMethod.map(([method, value]) => <div key={method}><span><i />{method}</span><strong>{money(value)}</strong></div>) : <p className="analytics-empty">No payments in this period.</p>}</div></article>
      </div>

      <h2 className="analytics-section-label">SUBSCRIBERS</h2>
      <div className="analytics-grid-three">
        <article className="analytics-card"><div className="analytics-card-heading"><div><h3>Subscribers by type</h3><p>{subscriberTypes.total} subscribers</p></div></div><div className="analytics-donut"><span><strong>{subscriberTypes.total}</strong><small>SUBSCRIBERS</small></span></div><div className="analytics-method-list"><div><span><i />Hotspot</span><strong>{subscriberTypes.hotspot}</strong></div><div><span><i />PPPoE</span><strong>{subscriberTypes.pppoe}</strong></div></div></article>
        <article className="analytics-card"><div className="analytics-card-heading"><div><h3>Lifecycle</h3><p>{activeSubscribers} active</p></div></div><div className="analytics-donut"><span><strong>{activeSubscribers}</strong><small>ACTIVE</small></span></div></article>
        <article className="analytics-card"><div className="analytics-card-heading"><div><h3>Expiring soon</h3><p>Upcoming account renewals</p></div></div><div className="analytics-expiry-bars">{Object.entries(expiringSoon).map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ height: `${Math.max(value ? 35 : 3, value * 12)}%` }} /></i><strong>{value}</strong></div>)}</div></article>
      </div>

      <article className="analytics-card analytics-revenue-chart"><div className="analytics-card-heading"><div><h3>New subscribers · {period}</h3><p>Subscribers created in the selected period</p></div></div><div className="analytics-bar-chart">{(analytics?.subscribers || []).map((item) => { const max = Math.max(1, ...(analytics?.subscribers || []).map((row) => Number(row.subscribers))); const count = Number(item.subscribers); return <div key={item.date} title={`${new Date(item.date).toLocaleDateString()}: ${count}`}><span style={{ height: `${Math.max(count ? 8 : 2, count / max * 100)}%` }} /></div> })}</div></article>

      <h2 className="analytics-section-label">NETWORK</h2>
      <article className="analytics-card analytics-revenue-chart"><div className="analytics-card-heading"><div><h3>Active sessions · live</h3><p>Fresh FreeRADIUS accounting sessions</p></div><span>{analytics?.summary.connectedDevices || 0} devices</span></div><div className="analytics-bar-chart"><div><span style={{ height: `${Math.min(100, Math.max(4, (analytics?.summary.activeSessions || 0) * 4))}%` }} /></div></div></article>
      <article className="analytics-card analytics-revenue-chart"><div className="analytics-card-heading"><div><h3>Data usage · {period}</h3><p>Accounting totals for the selected period</p></div></div><div className="analytics-bar-chart"><div title={`Download ${formatBytes(downloadBytes)}`}><span style={{ height: `${Math.min(100, downloadBytes ? 100 : 2)}%` }} /></div><div title={`Upload ${formatBytes(uploadBytes)}`}><span style={{ height: `${Math.min(100, uploadBytes && downloadBytes ? uploadBytes / downloadBytes * 100 : uploadBytes ? 100 : 2)}%` }} /></div></div><div className="analytics-chart-footer"><span>This period <strong>{formatBytes(totalBytes)}</strong></span><span>Download <strong>{formatBytes(downloadBytes)}</strong></span></div></article>

      <div className="analytics-grid-three">
        <article className="analytics-card"><div className="analytics-card-heading"><div><h3>Upload vs download</h3><p>{formatBytes(totalBytes)} total</p></div></div><div className="analytics-donut"><span><strong>{formatBytes(totalBytes)}</strong><small>TOTAL</small></span></div><div className="analytics-method-list"><div><span><i />Download</span><strong>{formatBytes(downloadBytes)}</strong></div><div><span><i />Upload</span><strong>{formatBytes(uploadBytes)}</strong></div></div></article>
        <article className="analytics-card"><div className="analytics-card-heading"><div><h3>Revenue by plan · {period}</h3><p>Current subscriber value by package</p></div></div><div className="analytics-ranking compact">{packageUsage.map(([name, value]) => <div key={name}><span>{name}</span><div className="analytics-ranking-track"><span style={{ width: `${packageUsage[0]?.[1] ? value / packageUsage[0][1] * 100 : 0}%` }} /></div><strong>{money(value)}</strong></div>)}</div></article>
        <article className="analytics-card"><div className="analytics-card-heading"><div><h3>Top talkers · {period}</h3><p>Highest data users</p></div></div><div className="analytics-ranking compact">{topTalkers.length ? topTalkers.map(([name, value]) => <div key={name}><span>{name}</span><div className="analytics-ranking-track"><span style={{ width: `${topTalkers[0]?.[1] ? value / topTalkers[0][1] * 100 : 0}%` }} /></div><strong>{formatBytes(value)}</strong></div>) : <p className="analytics-empty">No live usage yet.</p>}</div></article>
      </div>

      <article className="analytics-card analytics-heatmap-card"><div className="analytics-card-heading"><div><h3>Traffic heatmap · {period}</h3><p>Distinct accounting devices by weekday and hour</p></div></div><div className="analytics-heatmap">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, dayIndex) => { const postgresDay = (dayIndex + 1) % 7; const maxDevices = Math.max(1, ...(analytics?.heatmap || []).map((cell) => Number(cell.devices))); return <div className="analytics-heatmap-row" key={day}><span>{day}</span>{Array.from({ length: 24 }, (_, hour) => { const cell = (analytics?.heatmap || []).find((item) => Number(item.weekday) === postgresDay && Number(item.hour) === hour); const devices = Number(cell?.devices || 0); return <i key={hour} style={{ opacity: devices ? 0.25 + devices / maxDevices * 0.75 : 0.08 }} title={`${day} ${String(hour).padStart(2, '0')}: ${devices} devices`} /> })}</div> })}</div></article>
      <article className="analytics-card analytics-mikrotik">
        <div className="analytics-card-heading"><div><h3>MikroTik performance · {period}</h3><p>Revenue, sessions, and data per router · Share is based on data usage</p></div></div>
        {(() => {
          const linked = (analytics?.routerPerformance || []).filter((router) => routerFilter === 'All routers' || router.name === routerFilter)
          const unlinked = analytics?.unlinkedPerformance
          const totalData = linked.reduce((sum, router) => sum + Number(router.data || 0), 0) + (routerFilter === 'All routers' ? Number(unlinked?.data || 0) : 0)
          const rows = [
            ...linked.map((router) => ({
              name: router.name,
              status: router.status,
              subscribers: Number(router.subscribers || 0),
              revenue: Number(router.revenue || 0),
              sessions: Number(router.sessions || 0),
              data: Number(router.data || 0),
            })),
            ...(routerFilter === 'All routers' ? [{
              name: 'Not linked to a router',
              status: '—',
              subscribers: Number(unlinked?.subscribers || 0),
              revenue: Number(unlinked?.revenue || 0),
              sessions: Number(unlinked?.sessions || 0),
              data: Number(unlinked?.data || 0),
            }] : []),
          ]
          return <div className="analytics-router-table">
            <div className="analytics-router-head"><span>ROUTER</span><span>STATUS</span><span>SUBS</span><span>REVENUE</span><span>SESSIONS</span><span>DATA</span><span>SHARE</span></div>
            {rows.map((row) => {
              const share = totalData ? row.data / totalData * 100 : 0
              return <div className="analytics-router-row" key={row.name}>
                <strong>{row.name}</strong>
                <span className={`analytics-router-status ${row.status.toLowerCase()}`}>{row.status}</span>
                <span>{row.subscribers}</span>
                <span>{money(row.revenue)}</span>
                <span>{row.sessions}</span>
                <span>{formatBytes(row.data)}</span>
                <span className="analytics-share" title={`${formatBytes(row.data)} of ${formatBytes(totalData)} total data usage`}><i><b style={{ width: `${Math.min(100, share)}%` }} /></i>{Math.round(share)}%</span>
              </div>
            })}
            {!rows.length && <div className="analytics-router-row"><strong>No router data.</strong></div>}
          </div>
        })()}
      </article>
      <button type="button" className="analytics-back-top" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑</button>
    </div>
  )
}
