'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, CalendarDays, Clock3, Copy, CreditCard, Router, Wifi } from 'lucide-react'
import { calculateSubscriberUsageRate, type SubscriberUsageCounters, type SubscriberUsageRate } from '@/lib/subscriber-usage'

export type SubscriberProfileData = {
  id: string
  name: string
  email: string
  phone: string | null
  radiusUsername: string | null
  radiusPassword: string | null
  status: string
  plan: string | null
  monthlyRate: number
  expiresAt: string | null
  createdAt: string
  accountNumber: string | null
  siteId: string | null
  siteName: string | null
  planDetails: {
    type: string
    rateLimit: string
    downloadMbps: number
    uploadMbps: number
    fupEnabled: boolean
    fupLimitBytes: number | null
  } | null
  billing: {
    lifetimeValue: number
    paidThisMonth: number
    payments: Array<{
      id: string
      amount: number
      status: string
      method: string | null
      reference: string | null
      paidAt: string
    }>
  }
  sessionSummary: {
    sessionCount: number
    activeSessions: number
    firstSessionAt: string | null
    lastSessionAt: string | null
    bytesIn: string
    bytesOut: string
  }
  sessions: Array<{
    id: string
    nasIpAddress: string | null
    ipAddress: string | null
    macAddress: string | null
    startedAt: string | null
    stoppedAt: string | null
    sessionSeconds: number | null
    bytesIn: string
    bytesOut: string
    terminateCause: string | null
  }>
  activity: Array<{ day: string; sessionCount: number }>
  analytics: {
    paymentTrend: Array<{ month: string; amount: string; paymentCount: number }>
    hourlyUsage: Array<{ hour: number; sessionCount: number }>
  }
}

function formatDate(value: string | null, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-KE', options) : '—'
}

function formatMoney(value: number) {
  return `KSh ${Number(value || 0).toLocaleString('en-KE')}`
}

function formatBytes(value: string | number) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** exponent).toLocaleString('en-KE', { maximumFractionDigits: 1 })} ${units[exponent]}`
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds < 0) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', `${minutes}m`].filter(Boolean).join(' ')
}

type SubscriberLiveData = {
  source: 'router' | 'radius' | 'unavailable'
  connector: {
    state: 'site-unassigned' | 'router-unavailable' | 'not-configured' | 'offline' | 'online'
    routerNames: string[]
    lastSeenAt: string | null
  }
  liveIssue: 'byte-counters-unavailable' | 'username-unassigned' | 'subscriber-session-not-found' |
    'site-unassigned' | 'router-unavailable' | 'not-configured' | 'offline' | null
  checkedAt: string
  observedAt: string | null
  lastAccountingAt: string | null
  activeSessions: Array<{
    id: string
    ipAddress: string | null
    routerName: string | null
    nasIpAddress: string | null
    macAddress: string | null
    startedAt: string | null
    lastAccountingAt: string | null
    sessionSeconds: number | null
    downloadBytes: string | null
    uploadBytes: string | null
  }>
  downloadBytes: string | null
  uploadBytes: string | null
}

type SubscriberUsagePoint = { at: string; rate: SubscriberUsageRate | null }

function SubscriberLiveReports({ subscriberId, data }: { subscriberId: string; data: SubscriberProfileData }) {
  const [liveData, setLiveData] = useState<SubscriberLiveData | null>(null)
  const [currentRate, setCurrentRate] = useState<SubscriberUsageRate | null>(null)
  const [points, setPoints] = useState<SubscriberUsagePoint[]>([])
  const [error, setError] = useState('')
  const previousCounters = useRef<SubscriberUsageCounters | null>(null)
  const currentRateRef = useRef<SubscriberUsageRate | null>(null)

  useEffect(() => {
    let cancelled = false
    let loading = false
    previousCounters.current = null
    currentRateRef.current = null
    setLiveData(null)
    setCurrentRate(null)
    setPoints([])
    setError('')

    const sample = async () => {
      if (loading) return
      loading = true
      try {
        const response = await fetch(`/api/customers/${encodeURIComponent(subscriberId)}/live`, { cache: 'no-store' })
        const result = await response.json() as SubscriberLiveData & { error?: string }
        if (!response.ok) throw new Error(result.error || 'Unable to load live subscriber usage.')
        if (cancelled) return

        let rate = currentRateRef.current
        const previous = previousCounters.current
        if (result.source !== 'router' || !result.observedAt ||
            result.downloadBytes === null || result.uploadBytes === null) {
          previousCounters.current = null
          rate = null
        } else if (!previous) {
          previousCounters.current = {
            observedAt: result.observedAt,
            downloadBytes: result.downloadBytes,
            uploadBytes: result.uploadBytes,
          }
          rate = null
        } else if (result.observedAt !== previous.observedAt) {
          const counters = {
            observedAt: result.observedAt,
            downloadBytes: result.downloadBytes,
            uploadBytes: result.uploadBytes,
          }
          rate = calculateSubscriberUsageRate(previous, counters)
          previousCounters.current = counters
          if (rate) setPoints((current) =>
            [...current, { at: result.observedAt!, rate }].slice(-30))
        }
        currentRateRef.current = rate
        setLiveData(result)
        setCurrentRate(rate)
        setError('')
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load live subscriber usage.')
      } finally {
        loading = false
      }
    }

    void sample()
    const timer = window.setInterval(() => void sample(), 1_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [subscriberId])

  const maxRate = Math.max(
    data.planDetails?.downloadMbps || 0,
    data.planDetails?.uploadMbps || 0,
    ...points.map(({ rate }) => Math.max(rate?.downloadMbps || 0, rate?.uploadMbps || 0)),
    1,
  )
  const chartStart = points.length ? new Date(points[0].at).getTime() : 0
  const chartDuration = points.length > 1 ? new Date(points[points.length - 1].at).getTime() - chartStart : 0
  const chartPath = (direction: 'downloadMbps' | 'uploadMbps') => points.map(({ at, rate }, index) => {
    const x = chartDuration > 0
      ? (new Date(at).getTime() - chartStart) / chartDuration * 1000
      : points.length > 1 ? index / (points.length - 1) * 1000 : 0
    const y = 145 - Math.min(1, (rate?.[direction] || 0) / maxRate) * 125
    return `${index ? 'L' : 'M'} ${x} ${y}`
  }).join(' ')
  const downloadRate = liveData?.source === 'router' ? currentRate?.downloadMbps : undefined
  const uploadRate = liveData?.source === 'router' ? currentRate?.uploadMbps : undefined
  const liveSourceLabel = liveData?.source === 'router'
    ? liveData.liveIssue === 'byte-counters-unavailable' ? 'Counters unavailable' : 'Router live'
    : liveData?.connector.state === 'online'
      ? 'Router online'
      : liveData?.source === 'radius' ? 'RADIUS snapshot' : 'No live data'
  const liveHelp = !liveData
    ? 'Checking router and subscriber session…'
    : liveData.source === 'router' && liveData.liveIssue === 'byte-counters-unavailable'
      ? 'The router sees this session but did not report its byte counters. Update and restart the router connector, then confirm RouterOS exposes bytes-in and bytes-out for the session.'
      : liveData.source === 'router'
        ? null
        : liveData.connector.state === 'site-unassigned'
          ? 'Assign this subscriber to the network site that contains their router.'
          : liveData.connector.state === 'router-unavailable'
            ? 'No enabled, monitored router is assigned to this subscriber’s site.'
            : liveData.connector.state === 'not-configured'
              ? 'The router API connector is not enabled. Enable it from the router’s Users tab, then install and start the connector service.'
              : liveData.connector.state === 'offline'
                ? `The router connector is offline. Start its service and check its APP_URL, router REST connection, credentials, and network access.${liveData.connector.lastSeenAt ? ` Last report: ${formatDate(liveData.connector.lastSeenAt)}.` : ''}`
                : liveData.liveIssue === 'username-unassigned'
                  ? 'This subscriber has no RADIUS username, so their router session cannot be matched.'
                  : liveData.liveIssue === 'subscriber-session-not-found'
                    ? 'The connector is online, but no active session with this subscriber’s exact RADIUS username was found on the assigned router. Confirm the username and active router session.'
                    : 'The router connector has not reported a subscriber session yet.'

  return (
    <section className="subscriber-profile-panel subscriber-live-reports">
      <div className="subscriber-live-reports-heading">
        <div>
          <h4><Activity size={16} /> Live subscriber usage</h4>
          <p>Page checks every second; router counters are sampled about every 5 seconds.</p>
        </div>
        <span className={`subscriber-live-indicator ${liveData?.connector.state === 'online' ? 'is-live' : ''}`}>
          <i />{liveSourceLabel}
        </span>
      </div>
      {error && <p className="subscriber-live-error" role="alert">{error}</p>}
      {liveHelp && <p className="subscriber-live-status-note">{liveHelp}</p>}
      <div className="subscriber-live-stats">
        <article><span>DOWNLOAD SPEED</span><strong>{downloadRate === undefined ? '—' : downloadRate.toFixed(2)} <small>Mbps</small></strong><p>{liveData?.downloadBytes ? `${formatBytes(liveData.downloadBytes)} total in active sessions` : 'Router byte counters unavailable'}</p></article>
        <article><span>UPLOAD SPEED</span><strong>{uploadRate === undefined ? '—' : uploadRate.toFixed(2)} <small>Mbps</small></strong><p>{liveData?.uploadBytes ? `${formatBytes(liveData.uploadBytes)} total in active sessions` : 'Router byte counters unavailable'}</p></article>
      </div>
      <div className="subscriber-live-chart" role="img" aria-label="Router-measured subscriber download and upload rates over recent samples">
        <div className="subscriber-live-chart-scale"><span>Scale: 0–{maxRate.toFixed(maxRate < 10 ? 1 : 0)} Mbps</span><span>{points.length} router samples</span></div>
        <svg viewBox="0 0 1000 160" preserveAspectRatio="none" aria-hidden="true">
          {[20, 62, 103, 145].map((y) => <line key={y} x1="0" x2="1000" y1={y} y2={y} />)}
          {points.length > 1 && <>
            <path className="subscriber-live-download-line" d={chartPath('downloadMbps')} />
            <path className="subscriber-live-upload-line" d={chartPath('uploadMbps')} />
          </>}
        </svg>
        {points.length < 2 && <p>{liveData?.source === 'router' ? 'Waiting for a second router sample to calculate speed…' : liveHelp}</p>}
      </div>
      <div className="subscriber-live-legend"><span className="download">Download</span><span className="upload">Upload</span><span>Plan limit: {data.planDetails ? `${data.planDetails.downloadMbps}/${data.planDetails.uploadMbps} Mbps` : 'Not assigned'}</span></div>
      {points.length > 1 && <div className="subscriber-live-time-axis"><span>{formatDate(points[0].at, { timeStyle: 'short' })}</span><span>Most recent: {formatDate(points[points.length - 1].at, { timeStyle: 'short' })}</span></div>}
      <div className="subscriber-live-footnote">
        <span>{liveData?.source === 'router' ? 'Router sample' : 'Last RADIUS accounting update'}: {liveData?.observedAt ? formatDate(liveData.observedAt) : 'Not received yet'}</span>
        <span>Page checked: {liveData ? formatDate(liveData.checkedAt, { timeStyle: 'medium' }) : 'Loading…'}</span>
      </div>
      {liveData?.activeSessions.length ? <div className="subscriber-profile-table-scroll">
        <table><thead><tr><th>STARTED</th><th>IP ADDRESS</th><th>DEVICE</th><th>SESSION TIME</th><th>DOWNLOAD</th><th>UPLOAD</th><th>ROUTER</th></tr></thead><tbody>
          {liveData.activeSessions.map((session) => <tr key={session.id}><td>{formatDate(session.startedAt)}</td><td>{session.ipAddress || '—'}</td><td>{session.macAddress || '—'}</td><td>{formatDuration(session.sessionSeconds)}</td><td>{session.downloadBytes ? formatBytes(session.downloadBytes) : '—'}</td><td>{session.uploadBytes ? formatBytes(session.uploadBytes) : '—'}</td><td>{session.routerName || session.nasIpAddress || '—'}</td></tr>)}
        </tbody></table>
      </div> : null}
    </section>
  )
}

function SubscriberHistoricalReports({ data }: { data: SubscriberProfileData }) {
  const paymentsByMonth = new Map(data.analytics.paymentTrend.map((entry) => [entry.month, entry]))
  const today = new Date()
  const paymentMonths = Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11 + index, 1))
    const month = monthDate.toISOString().slice(0, 7)
    const entry = paymentsByMonth.get(month)
    return {
      month,
      label: monthDate.toLocaleString('en-KE', { month: 'short', timeZone: 'UTC' }),
      amount: Number(entry?.amount || 0),
      paymentCount: entry?.paymentCount || 0,
    }
  })
  const maxPayment = Math.max(...paymentMonths.map((month) => month.amount), 1)
  const paidMonths = paymentMonths.filter((month) => month.amount > 0)
  const averageMonthlyPayment = paidMonths.length
    ? paidMonths.reduce((sum, month) => sum + month.amount, 0) / paidMonths.length
    : 0
  const latestPayment = [...data.billing.payments]
    .filter((payment) => payment.status === 'paid')
    .sort((left, right) => right.paidAt.localeCompare(left.paidAt))[0]

  const monthStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
  const daysInMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate()
  const startsByDay = new Map(data.activity.map((entry) => [entry.day, entry.sessionCount]))
  const usageDays = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(monthStart + index * 86400000)
    const day = date.toISOString().slice(0, 10)
    const sessionStarts = startsByDay.get(day) || 0
    return { day, date: date.getUTCDate(), sessionStarts }
  })
  const monthSessionStarts = usageDays.reduce((sum, day) => sum + day.sessionStarts, 0)
  const activeUsageDays = usageDays.filter((day) => day.sessionStarts > 0)
  const peakDay = [...activeUsageDays].sort((left, right) => right.sessionStarts - left.sessionStarts)[0]
  const averageDailySessions = activeUsageDays.length
    ? monthSessionStarts / activeUsageDays.length
    : 0
  const maxDailySessions = Math.max(...usageDays.map((day) => day.sessionStarts), 1)

  const usageByHour = new Map(data.analytics.hourlyUsage.map((entry) => [entry.hour, entry]))
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const entry = usageByHour.get(hour)
    return {
      hour,
      sessionCount: entry?.sessionCount || 0,
    }
  })
  const peakHour = [...hours].sort((left, right) => right.sessionCount - left.sessionCount)[0]
  const totalHourlySessions = hours.reduce((sum, hour) => sum + hour.sessionCount, 0)
  const eveningSessions = hours.filter((hour) => hour.hour >= 17).reduce((sum, hour) => sum + hour.sessionCount, 0)
  const eveningShare = totalHourlySessions > 0 ? Math.round(eveningSessions / totalHourlySessions * 100) : 0
  const maxHourlySessions = Math.max(...hours.map((hour) => hour.sessionCount), 1)
  const peakPeriod = peakHour?.sessionCount
    ? peakHour.hour < 12 ? 'Morning' : peakHour.hour < 17 ? 'Afternoon' : 'Evening'
    : 'Not enough data'

  return (
    <div className="subscriber-analytics-grid">
      <section className="subscriber-profile-panel subscriber-analytics-card">
        <div className="subscriber-analytics-heading"><div><h4><CreditCard size={16} /> Payment trend</h4><p>Paid subscriber transactions · last 12 months</p></div></div>
        <div className="subscriber-analytics-chart subscriber-payment-chart" role="img" aria-label="Monthly payments for the last 12 months">
          {paymentMonths.map((month) => <div className="subscriber-payment-column" key={month.month} title={`${month.label}: ${formatMoney(month.amount)} · ${month.paymentCount} payment${month.paymentCount === 1 ? '' : 's'}`}>
            <span className={month.amount > 0 ? 'has-value' : ''} style={{ height: `${Math.max(month.amount > 0 ? 3 : 0, month.amount / maxPayment * 100)}%` }} />
            <small>{month.label}</small>
          </div>)}
        </div>
        <div className="subscriber-analytics-summary">
          <div><span>LIFETIME</span><strong>{formatMoney(data.billing.lifetimeValue)}</strong></div>
          <div><span>AVG / PAID MONTH</span><strong>{formatMoney(averageMonthlyPayment)}</strong></div>
          <div><span>PAID MONTHS</span><strong>{paidMonths.length} / 12</strong></div>
          <div><span>LAST PAYMENT</span><strong>{latestPayment ? formatDate(latestPayment.paidAt, { dateStyle: 'medium' }) : '—'}</strong></div>
        </div>
      </section>

      <section className="subscriber-profile-panel subscriber-analytics-card">
        <div className="subscriber-analytics-heading"><div><h4><Activity size={16} /> Daily connections</h4><p>RADIUS sessions started each day this month</p></div></div>
        <div className="subscriber-analytics-chart subscriber-data-chart" role="img" aria-label="Daily RADIUS session starts this month">
          {usageDays.map((day) => <div className="subscriber-data-column" key={day.day} title={`${day.day}: ${day.sessionStarts} session starts`}>
            <span className="session-start-bar" style={{ height: `${day.sessionStarts / maxDailySessions * 100}%` }} />
            {(day.date === 1 || day.date === daysInMonth || day.date % 5 === 0) && <small>{day.date}</small>}
          </div>)}
        </div>
        <div className="subscriber-analytics-summary">
          <div><span>STARTED THIS MONTH</span><strong>{monthSessionStarts}</strong></div>
          <div><span>BUSIEST DAY</span><strong>{peakDay ? `${peakDay.date} · ${peakDay.sessionStarts}` : '—'}</strong></div>
          <div><span>AVG / ACTIVE DAY</span><strong>{averageDailySessions.toFixed(1)} sessions</strong></div>
          <div><span>ALL-TIME SESSIONS</span><strong>{data.sessionSummary.sessionCount.toLocaleString('en-KE')}</strong></div>
        </div>
      </section>

      <section className="subscriber-profile-panel subscriber-analytics-card subscriber-peak-usage">
        <div className="subscriber-analytics-heading">
          <div><h4><Clock3 size={16} /> Connection start times</h4><p>RADIUS sessions started during each hour · last 30 days</p></div>
          <span className="subscriber-peak-scale">Fewer starts → more starts</span>
        </div>
        <div className="subscriber-hour-chart" role="img" aria-label="RADIUS session starts by hour over the last 30 days">
          {hours.map((hour) => <div key={hour.hour} className="subscriber-hour-column" title={`${String(hour.hour).padStart(2, '0')}:00: ${hour.sessionCount} session starts`}>
            <span className={hour.sessionCount > 0 ? 'has-value' : ''} style={{ height: `${hour.sessionCount / maxHourlySessions * 100}%` }} />
            {(hour.hour % 6 === 0 || hour.hour === 23) && <small>{String(hour.hour).padStart(2, '0')}</small>}
          </div>)}
        </div>
        <div className="subscriber-analytics-summary subscriber-peak-summary">
          <div><span>PEAK HOUR</span><strong>{peakHour?.sessionCount ? `${String(peakHour.hour).padStart(2, '0')}:00 – ${String((peakHour.hour + 1) % 24).padStart(2, '0')}:00` : '—'}</strong></div>
          <div><span>SESSIONS (30 DAYS)</span><strong>{totalHourlySessions}</strong></div>
          <div><span>BUSIEST PERIOD</span><strong>{peakPeriod}</strong></div>
          <div><span>STARTED AFTER 17:00</span><strong>{eveningShare}%</strong></div>
        </div>
        <small className="subscriber-analytics-note">These charts count when sessions began; they do not represent data transferred or online time during each hour.</small>
      </section>
    </div>
  )
}

export function SubscriberProfile({
  data,
  onClose,
  onCopy,
  copiedCredential,
  showPassword,
  onTogglePassword,
}: {
  data: SubscriberProfileData
  onClose: () => void
  onCopy: (kind: 'username' | 'accountNumber' | 'password', value: string) => void
  copiedCredential: string
  showPassword: boolean
  onTogglePassword: () => void
}) {
  const [tab, setTab] = useState<'Overview' | 'Reports' | 'Sessions' | 'Payments'>('Overview')
  const activityByDay = useMemo(() => new Map(data.activity.map((entry) => [entry.day, entry.sessionCount])), [data.activity])
  const activityDays = useMemo(() => Array.from({ length: 365 }, (_, index) => {
    const date = new Date()
    date.setUTCHours(0, 0, 0, 0)
    date.setUTCDate(date.getUTCDate() - (364 - index))
    const day = date.toISOString().slice(0, 10)
    return { day, count: activityByDay.get(day) || 0 }
  }), [activityByDay])
  const activeSession = data.sessions.find((session) => !session.stoppedAt)
  const expiry = data.expiresAt ? new Date(data.expiresAt) : null
  const isOnline = data.sessionSummary.activeSessions > 0

  return (
    <section className="subscriber-profile" aria-label={`Profile for ${data.name}`}>
      <header className="subscriber-profile-header">
        <div className="subscriber-profile-breadcrumb"><span>CUSTOMERS</span><span>—</span><span>SUBSCRIBERS</span><span>—</span><span>#{data.id.slice(0, 8).toUpperCase()}</span></div>
        <button className="text-button" type="button" onClick={onClose}>Close profile</button>
        <div className="subscriber-profile-identity">
          <div className="subscriber-profile-avatar" aria-hidden="true">{data.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U'}</div>
          <div className="subscriber-profile-name">
            <h3>{data.name}</h3>
            <div className="subscriber-profile-meta">
              <strong>@{data.radiusUsername || 'No login'}</strong>
              <span className={`subscriber-profile-badge ${isOnline ? 'online' : ''}`}>{isOnline ? 'Online' : 'Offline'}</span>
              <span className="subscriber-profile-badge"><Wifi size={13} />{data.planDetails?.type || 'Service'}</span>
              {data.plan && <span className="subscriber-profile-badge"><Router size={13} />{data.plan}{data.planDetails?.rateLimit ? ` · ${data.planDetails.rateLimit}` : ''}</span>}
            </div>
            <div className="subscriber-profile-contact">
              {data.phone && <span>{data.phone}</span>}
              {data.email && <span>{data.email}</span>}
              <span>Member since {formatDate(data.createdAt, { dateStyle: 'medium' })}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="subscriber-profile-metrics">
        <article><span>Subscription</span><strong>{expiry && Number.isFinite(expiry.getTime()) ? `${Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86400000))} days` : 'No expiry'}</strong><small>{expiry ? `Renews ${formatDate(expiry.toISOString())}` : 'No expiry date recorded'}</small></article>
        <article><span>Last session</span><strong>{data.sessionSummary.lastSessionAt ? formatDate(data.sessionSummary.lastSessionAt, { dateStyle: 'medium' }) : 'Never'}</strong><small>{data.sessionSummary.lastSessionAt ? formatDate(data.sessionSummary.lastSessionAt, { timeStyle: 'short' }) : 'No sessions on record'}</small></article>
        <article><span>Lifetime value</span><strong>{formatMoney(data.billing.lifetimeValue)}</strong><small>{formatMoney(data.billing.paidThisMonth)} this month</small></article>
        <article><span>Sessions</span><strong>{data.sessionSummary.sessionCount.toLocaleString('en-KE')}</strong><small>{data.sessionSummary.activeSessions} active now</small></article>
      </div>

      <nav className="subscriber-profile-tabs" aria-label="Subscriber profile sections">
        {(['Overview', 'Reports', 'Sessions', 'Payments'] as const).map((item) => (
          <button key={item} type="button" className={tab === item ? 'selected' : ''} aria-current={tab === item ? 'page' : undefined} onClick={() => setTab(item)}>
            {item}{item === 'Sessions' ? <span>{data.sessionSummary.sessionCount}</span> : item === 'Payments' ? <span>{data.billing.payments.length}</span> : null}
          </button>
        ))}
      </nav>

      {tab === 'Overview' && <>
        <div className="subscriber-profile-columns">
          <div className="subscriber-profile-main-column">
            <section className="subscriber-profile-panel">
              <h4><Clock3 size={16} /> Subscription lifecycle</h4>
              <p>Account events from signup to now</p>
              <div className="subscriber-lifecycle">
                <div><span className="lifecycle-dot muted" /><div><strong>Account created</strong><small>{formatDate(data.createdAt)}</small><p>Subscriber added to this workspace</p></div></div>
                {data.sessionSummary.firstSessionAt && <div><span className="lifecycle-dot" /><div><strong>First session</strong><small>{formatDate(data.sessionSummary.firstSessionAt)}</small><p>First recorded RADIUS connection</p></div></div>}
                <div><span className={`lifecycle-dot ${isOnline ? 'live' : ''}`} /><div><strong>{isOnline ? 'Connected now' : 'Current state'}</strong><small>{data.status}</small><p>{isOnline ? 'An active RADIUS session is recorded' : expiry ? `Service expiry ${formatDate(expiry.toISOString())}` : 'No active RADIUS session'}</p></div></div>
              </div>
            </section>

            <section className="subscriber-profile-panel">
              <h4><CalendarDays size={16} /> Activity · last 365 days</h4>
              <div className="subscriber-activity-legend"><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} className={`activity-level-${level}`} />)}<span>More</span></div>
              <div className="subscriber-activity-content">
                <p>{activityDays.filter((day) => day.count > 0).length} active days</p>
                <div className="subscriber-activity-grid" aria-label="Daily RADIUS sessions over the last 365 days">
                  {activityDays.map(({ day, count }) => <span key={day} className={`activity-level-${count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4}`} title={`${day}: ${count} session${count === 1 ? '' : 's'}`} />)}
                </div>
                <small>{data.sessionSummary.sessionCount ? 'Daily activity is based on recorded RADIUS sessions.' : 'No RADIUS activity in the last year.'}</small>
              </div>
            </section>

            {data.planDetails?.fupEnabled && data.planDetails.fupLimitBytes && <section className="subscriber-profile-panel">
              <h4><Activity size={16} /> Fair Use Policy</h4>
              <div className="subscriber-profile-inset"><p>Configured plan limit: <strong>{formatBytes(String(data.planDetails.fupLimitBytes))}</strong></p><p>All-time recorded data: <strong>{formatBytes(data.sessionSummary.bytesIn)} received</strong> · <strong>{formatBytes(data.sessionSummary.bytesOut)} sent</strong></p></div>
            </section>}
          </div>

          <aside className="subscriber-profile-side-column">
            <section className="subscriber-profile-panel">
              <h4><Wifi size={16} /> Device &amp; network</h4>
              <dl className="subscriber-profile-facts">
                <div><dt>Network site</dt><dd>{data.siteName || 'Not assigned'}</dd></div>
                <div><dt>Connection type</dt><dd>{data.planDetails?.type || 'Not recorded'}</dd></div>
                <div><dt>Username</dt><dd>{data.radiusUsername || 'Not set'}{data.radiusUsername && <button type="button" aria-label="Copy username" onClick={() => onCopy('username', data.radiusUsername!)}><Copy size={14} />{copiedCredential === 'username' ? 'Copied' : ''}</button>}</dd></div>
                {data.accountNumber && <div><dt>Account number</dt><dd>{data.accountNumber}<button type="button" aria-label="Copy account number" onClick={() => onCopy('accountNumber', data.accountNumber!)}><Copy size={14} />{copiedCredential === 'accountNumber' ? 'Copied' : ''}</button></dd></div>}
                {data.radiusPassword && <div><dt>Password</dt><dd><span className="subscriber-profile-password">{showPassword ? data.radiusPassword : '••••••••••••'}</span><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={onTogglePassword}>{showPassword ? 'Hide' : 'Show'}</button><button type="button" aria-label="Copy password" onClick={() => onCopy('password', data.radiusPassword!)}><Copy size={14} />{copiedCredential === 'password' ? 'Copied' : ''}</button></dd></div>}
                <div><dt>Current IP</dt><dd>{activeSession?.ipAddress || 'No active session'}</dd></div>
                <div><dt>Router / NAS</dt><dd>{activeSession?.nasIpAddress || 'No active session'}</dd></div>
                <div><dt>Data received · all sessions</dt><dd>{formatBytes(data.sessionSummary.bytesIn)}</dd></div>
                <div><dt>Data sent · all sessions</dt><dd>{formatBytes(data.sessionSummary.bytesOut)}</dd></div>
              </dl>
            </section>
            <section className="subscriber-profile-panel">
              <h4><CreditCard size={16} /> Recent payments</h4>
              {data.billing.payments.slice(0, 4).length ? <div className="subscriber-profile-payments">{data.billing.payments.slice(0, 4).map((payment) => <div key={payment.id}><span>{payment.method || payment.status}</span><strong>{formatMoney(payment.amount)}</strong><small>{formatDate(payment.paidAt)}</small></div>)}</div> : <p className="subscriber-profile-empty">No payments recorded for this subscriber.</p>}
            </section>
          </aside>
        </div>
      </>}

      {tab === 'Reports' && <>
        <SubscriberLiveReports subscriberId={data.id} data={data} />
        <SubscriberHistoricalReports data={data} />
      </>}

      {tab === 'Sessions' && <section className="subscriber-profile-panel subscriber-profile-table-panel">
        <h4><Wifi size={16} /> Recorded RADIUS sessions</h4>
        <p>{data.sessionSummary.activeSessions} active · showing up to 50 most recent sessions</p>
        <div className="subscriber-profile-table-scroll"><table><thead><tr><th>STARTED</th><th>ENDED</th><th>STATUS</th><th>IP ADDRESS</th><th>DEVICE</th><th>DURATION</th><th>DATA</th><th>ROUTER</th></tr></thead><tbody>
          {data.sessions.map((session) => <tr key={session.id}><td>{formatDate(session.startedAt)}</td><td>{session.stoppedAt ? formatDate(session.stoppedAt) : '—'}</td><td><span className={`subscriber-profile-badge ${!session.stoppedAt ? 'online' : ''}`}>{session.stoppedAt ? session.terminateCause || 'Ended' : 'Active'}</span></td><td>{session.ipAddress || '—'}</td><td>{session.macAddress || '—'}</td><td>{formatDuration(session.sessionSeconds)}</td><td>{formatBytes(session.bytesIn)} ↓ · {formatBytes(session.bytesOut)} ↑</td><td>{session.nasIpAddress || '—'}</td></tr>)}
          {!data.sessions.length && <tr><td colSpan={8} className="subscriber-profile-empty">No RADIUS sessions have been recorded for this subscriber.</td></tr>}
        </tbody></table></div>
      </section>}

      {tab === 'Payments' && <section className="subscriber-profile-panel subscriber-profile-table-panel">
        <h4><CreditCard size={16} /> Payment history</h4>
        <p>{data.billing.payments.length} recorded payments · {formatMoney(data.billing.lifetimeValue)} paid total</p>
        <div className="subscriber-profile-table-scroll"><table><thead><tr><th>DATE</th><th>REFERENCE</th><th>METHOD</th><th>STATUS</th><th>AMOUNT</th></tr></thead><tbody>
          {data.billing.payments.map((payment) => <tr key={payment.id}><td>{formatDate(payment.paidAt)}</td><td>{payment.reference || '—'}</td><td>{payment.method || '—'}</td><td>{payment.status}</td><td>{formatMoney(payment.amount)}</td></tr>)}
          {!data.billing.payments.length && <tr><td colSpan={5} className="subscriber-profile-empty">No payments are linked to this subscriber.</td></tr>}
        </tbody></table></div>
      </section>}
    </section>
  )
}
