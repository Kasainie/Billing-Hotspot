'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Activity, CalendarDays, Clock3, Copy, CreditCard, Ellipsis, FileText, Gift, MessageCircle, Pause, Pencil, Router, Send, Ticket, Trash2, Wifi, X } from 'lucide-react'
import {
  calculateSubscriberUsageRate,
  formatSubscriberSpeed,
  subscriberUsageChartScale,
  type SubscriberUsageCounters,
  type SubscriberUsageRate,
} from '@/lib/subscriber-usage'
import { exportSubscriberUsagePdf } from '@/lib/report-export'

export type SubscriberProfileData = {
  id: string
  name: string
  email: string
  phone: string | null
  location: string | null
  radiusUsername: string | null
  radiusPassword: string | null
  status: string
  plan: string | null
  monthlyRate: number
  expiresAt: string | null
  createdAt: string
  accountNumber: string | null
  accountSource: string
  siteId: string | null
  siteName: string | null
  siteLocation: string | null
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
    creditBalance: number
    creditEntries: Array<{ id: string; type: string; amount: number; reason: string; createdAt: string }>
    invoices: Array<{ id: string; invoiceNumber: string; amount: number; status: string; dueAt: string; createdAt: string; description: string }>
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
  activity: Array<{ day: string; sessionCount: number; bytesIn: string; bytesOut: string }>
  events: Array<{ id: string; eventType: string; description: string; metadata: Record<string, unknown>; createdAt: string }>
  tickets: Array<{ id: string; subject: string; description: string; status: string; priority: string; createdAt: string; updatedAt: string }>
  packageHistory: Array<{ id: string; productName: string; amount: number; status: string; receipt: string | null; createdAt: string; paidAt: string | null }>
  analytics: {
    paymentTrend: Array<{ month: string; amount: string; paymentCount: number }>
    hourlyUsage: Array<{ hour: number; sessionCount: number; bytesIn: string; bytesOut: string }>
    dailyUsage: Array<{ day: string; sessionCount: number; bytesIn: string; bytesOut: string }>
    hourlyUsage24h: Array<{ hourAt: string | null; sessionCount: number; bytesIn: string; bytesOut: string }>
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
  const duration = Number(seconds)
  if (seconds === null || !Number.isSafeInteger(duration) || duration < 0 || duration > 10 * 365 * 86400) return '—'
  const days = Math.floor(duration / 86400)
  const hours = Math.floor((duration % 86400) / 3600)
  const minutes = Math.floor((duration % 3600) / 60)
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
    callerId: string | null
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

function SubscriberLiveReports({ subscriberId, data, onLiveDataChange }: { subscriberId: string; data: SubscriberProfileData; onLiveDataChange: (data: SubscriberLiveData, rate?: SubscriberUsageRate | null) => void }) {
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
        onLiveDataChange(result, rate)
        setCurrentRate(rate)
        setError('')
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load live subscriber usage.')
      } finally {
        loading = false
      }
    }

    void sample()
    const timer = window.setInterval(() => void sample(), 5_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [onLiveDataChange, subscriberId])

  const peakRate = Math.max(
    currentRate?.downloadMbps || 0,
    currentRate?.uploadMbps || 0,
    ...points.map(({ rate }) => Math.max(rate?.downloadMbps || 0, rate?.uploadMbps || 0)),
  )
  const maxRate = subscriberUsageChartScale(peakRate)
  const chartStart = points.length ? new Date(points[0].at).getTime() : 0
  const chartDuration = points.length > 1 ? new Date(points[points.length - 1].at).getTime() - chartStart : 0
  const chartPath = (direction: 'downloadMbps' | 'uploadMbps') => points.map(({ at, rate }, index) => {
    const x = chartDuration > 0
      ? 60 + (new Date(at).getTime() - chartStart) / chartDuration * 940
      : points.length > 1 ? 60 + index / (points.length - 1) * 940 : 60
    const y = 145 - Math.min(1, (rate?.[direction] || 0) / maxRate) * 125
    return `${index ? 'L' : 'M'} ${x} ${y}`
  }).join(' ')
  const downloadRate = liveData?.source === 'router' ? currentRate?.downloadMbps : undefined
  const uploadRate = liveData?.source === 'router' ? currentRate?.uploadMbps : undefined
  const formattedDownloadRate = downloadRate === undefined ? null : formatSubscriberSpeed(downloadRate)
  const formattedUploadRate = uploadRate === undefined ? null : formatSubscriberSpeed(uploadRate)
  const activeSessionSeconds = Math.max(0, ...((liveData?.activeSessions || []).map((session) => session.sessionSeconds || 0)))
  const currentSessionDownload = liveData?.downloadBytes || '0'
  const currentSessionUpload = liveData?.uploadBytes || '0'
  const currentSessionTotal = BigInt(currentSessionDownload) + BigInt(currentSessionUpload)
  const reportMonth = new Date().toISOString().slice(0, 7)
  const monthEntries = data.analytics.dailyUsage.filter((entry) => entry.day.startsWith(reportMonth))
  const monthTraffic = monthEntries.reduce((total, entry) =>
    total + BigInt(entry.bytesIn || '0') + BigInt(entry.bytesOut || '0'), BigInt(0))
  const connectionType = data.planDetails?.type || (data.accountNumber ? 'PPPoE' : 'Service')
  const planLimit = data.planDetails
    ? data.planDetails.downloadMbps > 0 || data.planDetails.uploadMbps > 0
      ? `${data.planDetails.downloadMbps}/${data.planDetails.uploadMbps} Mbps`
      : data.planDetails.rateLimit || 'Unavailable'
    : 'Not assigned'
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
          <p>Router counters are checked every 5 seconds while this report is open.</p>
        </div>
        <span className={`subscriber-live-indicator ${liveData?.connector.state === 'online' ? 'is-live' : ''}`}>
          <i />{liveSourceLabel}
        </span>
      </div>
      {error && <p className="subscriber-live-error" role="alert">{error}</p>}
      {liveHelp && <p className="subscriber-live-status-note">{liveHelp}</p>}
      <div className="subscriber-live-stats">
        <article><span>DOWNLOAD SPEED</span><strong>{formattedDownloadRate ? <>{formattedDownloadRate.value} <small>{formattedDownloadRate.unit}</small></> : '—'}</strong><p>{liveData?.downloadBytes ? `${formatBytes(liveData.downloadBytes)} total in active sessions` : 'Router byte counters unavailable'}</p></article>
        <article><span>UPLOAD SPEED</span><strong>{formattedUploadRate ? <>{formattedUploadRate.value} <small>{formattedUploadRate.unit}</small></> : '—'}</strong><p>{liveData?.uploadBytes ? `${formatBytes(liveData.uploadBytes)} total in active sessions` : 'Router byte counters unavailable'}</p></article>
      </div>
      <div className="subscriber-live-session-summary">
        <article><span>SESSION UP</span><strong>{liveData?.activeSessions.length ? formatDuration(activeSessionSeconds) : 'Offline'}</strong><small>{liveData?.activeSessions[0]?.startedAt ? `Since ${formatDate(liveData.activeSessions[0].startedAt)}` : 'Current connection'}</small></article>
        <article><span>THIS SESSION</span><strong>{liveData?.downloadBytes !== null && liveData?.uploadBytes !== null && liveData ? formatBytes(currentSessionTotal.toString()) : '—'}</strong><small>↓ {formatBytes(currentSessionDownload)} · ↑ {formatBytes(currentSessionUpload)}</small></article>
        <article><span>SESSIONS STARTED THIS MONTH</span><strong>{formatBytes(monthTraffic.toString())}</strong><small>Cumulative RADIUS session counters</small></article>
        <article><span>CONNECTION</span><strong>{connectionType}</strong><small>{liveData?.activeSessions[0]?.ipAddress || 'No active IP'}</small></article>
        <article><span>DEVICE · NETWORK</span><strong>{liveData?.activeSessions[0]?.macAddress || liveData?.activeSessions[0]?.callerId || (liveData?.activeSessions.length ? 'Device ID not reported' : 'No active device')}</strong><small>{liveData?.activeSessions[0]?.routerName || liveData?.activeSessions[0]?.nasIpAddress || data.siteName || 'Router not reported'}</small></article>
      </div>
      <div className="subscriber-live-chart" role="img" aria-label="Router-measured subscriber download and upload rates over recent samples">
        <div className="subscriber-live-chart-scale"><span>Auto scale: 0–{formatSubscriberSpeed(maxRate).value} {formatSubscriberSpeed(maxRate).unit}</span><span>{points.length} router samples</span></div>
        <svg viewBox="0 0 1000 160" preserveAspectRatio="none" aria-hidden="true">
          {[20, 62, 103, 145].map((y, index) => {
            const rate = maxRate * (3 - index) / 3
            const formattedRate = formatSubscriberSpeed(rate)
            return <g key={y}>
              <line x1="58" x2="1000" y1={y} y2={y} />
              <text className="subscriber-live-chart-axis-label" x="2" y={y + 3}>{formattedRate.value}</text>
            </g>
          })}
          {points.length > 1 && <>
            <path className="subscriber-live-download-line" d={chartPath('downloadMbps')} />
            <path className="subscriber-live-upload-line" d={chartPath('uploadMbps')} />
          </>}
        </svg>
        {points.length < 2 && <p>{liveData?.source === 'router' ? 'Waiting for a second router sample to calculate speed…' : liveHelp}</p>}
      </div>
      <div className="subscriber-live-legend"><span className="download">Download</span><span className="upload">Upload</span><span>Plan limit: {planLimit}</span></div>
      {points.length > 1 && <div className="subscriber-live-time-axis"><span>{formatDate(points[0].at, { timeStyle: 'short' })}</span><span>Most recent: {formatDate(points[points.length - 1].at, { timeStyle: 'short' })}</span></div>}
      <div className="subscriber-live-footnote">
        <span>{liveData?.source === 'router' ? 'Router sample' : 'Last RADIUS accounting update'}: {liveData?.observedAt ? formatDate(liveData.observedAt) : 'Not received yet'}</span>
        <span>Live check: {liveData ? formatDate(liveData.checkedAt, { timeStyle: 'medium' }) : 'Loading…'} · analytics refresh every 30s</span>
      </div>
      {liveData?.activeSessions.length ? <div className="subscriber-profile-table-scroll">
        <table><thead><tr><th>STARTED</th><th>IP ADDRESS</th><th>DEVICE</th><th>SESSION TIME</th><th>DOWNLOAD</th><th>UPLOAD</th><th>ROUTER</th></tr></thead><tbody>
          {liveData.activeSessions.map((session) => <tr key={session.id}><td>{formatDate(session.startedAt)}</td><td>{session.ipAddress || '—'}</td><td>{session.macAddress || session.callerId || 'Not reported'}</td><td>{formatDuration(session.sessionSeconds)}</td><td>{session.downloadBytes ? formatBytes(session.downloadBytes) : '—'}</td><td>{session.uploadBytes ? formatBytes(session.uploadBytes) : '—'}</td><td>{session.routerName || session.nasIpAddress || '—'}</td></tr>)}
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

  const monthKey = today.toISOString().slice(0, 7)
  const dailyUsageByDay = new Map(data.analytics.dailyUsage.map((entry) => [entry.day, entry]))
  const usageDays = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - (29 - index) * 86400000)
    const day = date.toISOString().slice(0, 10)
    const entry = dailyUsageByDay.get(day)
    return {
      day,
      date: date.getUTCDate(),
      sessionStarts: entry?.sessionCount || 0,
      bytesIn: entry?.bytesIn || '0',
      bytesOut: entry?.bytesOut || '0',
    }
  })
  const monthActivity = data.analytics.dailyUsage.filter((entry) => entry.day.startsWith(monthKey))
  const monthSessionStarts = monthActivity.reduce((sum, day) => sum + day.sessionCount, 0)
  const monthBytesIn = monthActivity.reduce((sum, day) => sum + BigInt(day.bytesIn || '0'), BigInt(0))
  const monthBytesOut = monthActivity.reduce((sum, day) => sum + BigInt(day.bytesOut || '0'), BigInt(0))
  const monthBytes = monthBytesIn + monthBytesOut
  const monthActiveDays = monthActivity.filter((day) => day.sessionCount > 0).length
  const recentBytes = usageDays.reduce((sum, day) =>
    sum + BigInt(day.bytesIn || '0') + BigInt(day.bytesOut || '0'), BigInt(0))
  const currentHour = new Date()
  currentHour.setUTCMinutes(0, 0, 0)
  const recentHourMap = new Map(data.analytics.hourlyUsage24h
    .filter((entry) => entry.hourAt)
    .map((entry) => [new Date(entry.hourAt!).toISOString().slice(0, 13), entry]))
  const recentHours = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(currentHour.getTime() - (23 - index) * 3_600_000)
    const key = date.toISOString().slice(0, 13)
    const entry = recentHourMap.get(key)
    return {
      key,
      label: date.toLocaleTimeString('en-KE', { hour: '2-digit', hour12: false, timeZone: 'UTC' }),
      sessionCount: entry?.sessionCount || 0,
      bytesIn: entry?.bytesIn || '0',
      bytesOut: entry?.bytesOut || '0',
    }
  })
  const maxRecentHourBytes = Math.max(...recentHours.map((hour) =>
    Number(BigInt(hour.bytesIn) + BigInt(hour.bytesOut))), 1)
  const recent24hBytes = recentHours.reduce((total, hour) =>
    total + BigInt(hour.bytesIn) + BigInt(hour.bytesOut), BigInt(0))
  const usageByHour = new Map(data.analytics.hourlyUsage.map((entry) => [entry.hour, entry]))
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const entry = usageByHour.get(hour)
    return {
      hour,
      sessionCount: entry?.sessionCount || 0,
      bytesIn: entry?.bytesIn || '0',
      bytesOut: entry?.bytesOut || '0',
      bytes: BigInt(entry?.bytesIn || '0') + BigInt(entry?.bytesOut || '0'),
    }
  })
  const peakHour = [...hours].sort((left, right) => left.bytes === right.bytes
    ? right.sessionCount - left.sessionCount
    : left.bytes < right.bytes ? 1 : -1)[0]
  const totalHourlyBytes = hours.reduce((sum, hour) => sum + hour.bytes, BigInt(0))
  const eveningBytes = hours.filter((hour) => hour.hour >= 17).reduce((sum, hour) => sum + hour.bytes, BigInt(0))
  const eveningShare = totalHourlyBytes > BigInt(0) ? Number(eveningBytes * BigInt(100) / totalHourlyBytes) : 0
  const maxHourlyBytes = Math.max(...hours.map((hour) => Number(hour.bytes)), 1)
  const peakPeriod = peakHour?.bytes > BigInt(0)
    ? peakHour.hour < 12 ? 'Morning' : peakHour.hour < 17 ? 'Afternoon' : 'Evening'
    : 'Not enough data'
  const maxDailyBytes = Math.max(...usageDays.map((day) => Number(BigInt(day.bytesIn || '0') + BigInt(day.bytesOut || '0'))), 1)
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
        <div className="subscriber-analytics-heading"><div><h4><Activity size={16} /> Data usage · last 30 days</h4><p>RADIUS data recorded for sessions started each day · updates with accounting</p></div></div>
        <div className="subscriber-analytics-chart subscriber-data-chart" role="img" aria-label="Daily subscriber download and upload bytes recorded over the last 30 days">
          {usageDays.map((day, index) => {
            const bytesIn = Number(day.bytesIn)
            const bytesOut = Number(day.bytesOut)
            const total = bytesIn + bytesOut
            return <div className="subscriber-data-column" key={day.day} title={`${day.day}: ${formatBytes(total)} total · ${day.sessionStarts} sessions`}>
              <span className="download-bar" style={{ height: `${bytesIn ? Math.max(1, bytesIn / maxDailyBytes * 100) : 0}%` }} />
              <span className="upload-bar" style={{ height: `${bytesOut ? Math.max(1, bytesOut / maxDailyBytes * 100) : 0}%` }} />
              {(index === 0 || index === usageDays.length - 1 || day.date % 5 === 0) && <small>{day.date}</small>}
            </div>
          })}
        </div>
        <div className="subscriber-analytics-legend"><span className="download">Download</span><span className="upload">Upload</span></div>
        <div className="subscriber-analytics-summary">
          <div><span>THIS MONTH</span><strong>{formatBytes(monthBytes.toString())}</strong></div>
          <div><span>LAST 30 DAYS</span><strong>{formatBytes(recentBytes.toString())}</strong></div>
          <div><span>AVG / ACTIVE DAY</span><strong>{formatBytes(monthActiveDays ? (monthBytes / BigInt(monthActiveDays)).toString() : '0')}</strong></div>
          <div><span>SESSIONS THIS MONTH</span><strong>{monthSessionStarts.toLocaleString('en-KE')}</strong></div>
        </div>
      </section>

      <section className="subscriber-profile-panel subscriber-analytics-card subscriber-peak-usage">
        <div className="subscriber-analytics-heading"><div><h4><Activity size={16} /> Last 24 hours</h4><p>RADIUS traffic grouped by session start hour · refreshed every 30 seconds</p></div></div>
        <div className="subscriber-analytics-chart subscriber-data-chart subscriber-24h-chart" role="img" aria-label="RADIUS data for sessions started in each of the last 24 hours">
          {recentHours.map((hour, index) => {
            const bytesIn = Number(hour.bytesIn)
            const bytesOut = Number(hour.bytesOut)
            const total = bytesIn + bytesOut
            return <div className="subscriber-data-column" key={hour.key} title={`${hour.label}:00 UTC · ${formatBytes(total)} across ${hour.sessionCount} session${hour.sessionCount === 1 ? '' : 's'}`}>
              <span className="download-bar" style={{ height: `${bytesIn ? Math.max(1, bytesIn / maxRecentHourBytes * 100) : 0}%` }} />
              <span className="upload-bar" style={{ height: `${bytesOut ? Math.max(1, bytesOut / maxRecentHourBytes * 100) : 0}%` }} />
              {(index % 4 === 0 || index === recentHours.length - 1) && <small>{hour.label}</small>}
            </div>
          })}
        </div>
        <div className="subscriber-analytics-legend"><span className="download">Download</span><span className="upload">Upload</span></div>
        <div className="subscriber-analytics-summary">
          <div><span>RECORDED TRAFFIC</span><strong>{formatBytes(recent24hBytes.toString())}</strong></div>
          <div><span>SESSION STARTS</span><strong>{recentHours.reduce((sum, hour) => sum + hour.sessionCount, 0)}</strong></div>
          <div><span>ACTIVE HOURS</span><strong>{recentHours.filter((hour) => hour.sessionCount > 0).length} / 24</strong></div>
          <div><span>WINDOW</span><strong>24 hours</strong></div>
        </div>
        <small className="subscriber-analytics-note">RADIUS stores cumulative session counters. The chart attributes each session’s recorded totals to its start hour; it is not a per-hour packet capture.</small>
      </section>

      <section className="subscriber-profile-panel subscriber-analytics-card subscriber-peak-usage">
        <div className="subscriber-analytics-heading">
          <div><h4><Clock3 size={16} /> Peak usage hours</h4><p>Traffic from sessions started during each hour · last 30 days</p></div>
          <span className="subscriber-peak-scale">Less traffic → more traffic</span>
        </div>
        <div className="subscriber-hour-chart" role="img" aria-label="Subscriber traffic grouped by session start hour over the last 30 days">
          {hours.map((hour) => <div key={hour.hour} className="subscriber-hour-column" title={`${String(hour.hour).padStart(2, '0')}:00: ${formatBytes(hour.bytes.toString())} across ${hour.sessionCount} sessions`}>
            <span className={hour.bytesIn !== '0' ? 'has-value' : ''} style={{ height: `${Number(hour.bytesIn) / maxHourlyBytes * 100}%` }} />
            <span className="upload-bar" style={{ height: `${Number(hour.bytesOut) / maxHourlyBytes * 100}%` }} />
            {(hour.hour % 6 === 0 || hour.hour === 23) && <small>{String(hour.hour).padStart(2, '0')}</small>}
          </div>)}
        </div>
        <div className="subscriber-analytics-legend"><span className="download">Download</span><span className="upload">Upload</span></div>
        <div className="subscriber-analytics-summary subscriber-peak-summary">
          <div><span>PEAK HOUR</span><strong>{peakHour?.bytes ? `${String(peakHour.hour).padStart(2, '0')}:00 – ${String((peakHour.hour + 1) % 24).padStart(2, '0')}:00` : '—'}</strong></div>
          <div><span>TRAFFIC (30 DAYS)</span><strong>{formatBytes(totalHourlyBytes.toString())}</strong></div>
          <div><span>BUSIEST PERIOD</span><strong>{peakPeriod}</strong></div>
          <div><span>AFTER 17:00</span><strong>{eveningShare}% of traffic</strong></div>
        </div>
        <small className="subscriber-analytics-note">RADIUS stores cumulative counters per session, not per-hour samples. Traffic is attributed to each session’s start hour; these values refresh as router accounting updates arrive.</small>
      </section>
    </div>
  )
}

export function SubscriberProfile({
  data,
  onClose,
  onRefresh,
  onDelete,
  onCopy,
  copiedCredential,
  showPassword,
  onTogglePassword,
}: {
  data: SubscriberProfileData
  onClose: () => void
  onRefresh: () => Promise<void>
  onDelete: () => void
  onCopy: (kind: 'username' | 'accountNumber' | 'password', value: string) => void
  copiedCredential: string
  showPassword: boolean
  onTogglePassword: () => void
}) {
  const [tab, setTab] = useState<'Overview' | 'Reports' | 'Sessions' | 'Payments' | 'Package history' | 'SMS' | 'Tickets' | 'Notes'>('Overview')
  const [liveData, setLiveData] = useState<SubscriberLiveData | null>(null)
  const [liveRate, setLiveRate] = useState<SubscriberUsageRate | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [actionDialog, setActionDialog] = useState<'edit' | 'expiry' | 'sms' | 'credentials' | 'payment_details' | 'invoice' | 'compensate' | 'ticket' | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [exportingReport, setExportingReport] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState(false)
  const [profileName, setProfileName] = useState(data.name)
  const [profileEmail, setProfileEmail] = useState(data.email)
  const [profilePhone, setProfilePhone] = useState(data.phone || '')
  const [expiryInput, setExpiryInput] = useState(() => {
    const date = data.expiresAt ? new Date(data.expiresAt) : new Date()
    if (!Number.isFinite(date.getTime())) return ''
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
  })
  const [smsMessage, setSmsMessage] = useState('')
  const [compensationKind, setCompensationKind] = useState<'days' | 'credit'>('days')
  const [compensationAmount, setCompensationAmount] = useState('1')
  const [actionReason, setActionReason] = useState('')
  const [invoiceDueAt, setInvoiceDueAt] = useState(() => {
    const due = new Date(Date.now() + 14 * 86_400_000)
    return `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`
  })
  const [ticketSubject, setTicketSubject] = useState('')
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketPriority, setTicketPriority] = useState('normal')
  const [clockNow, setClockNow] = useState(Date.now())
  const [lastLiveCheck, setLastLiveCheck] = useState('')
  const [lastDetailsCheck, setLastDetailsCheck] = useState(() => new Date().toISOString())
  const [detailsRefreshError, setDetailsRefreshError] = useState('')
  const detailsRefreshInFlight = useRef(false)
  const actionDialogRef = useRef<HTMLDivElement>(null)
  const activityByDay = useMemo(() => new Map(data.activity.map((entry) => [entry.day, entry])), [data.activity])
  const activityDays = useMemo(() => Array.from({ length: 365 }, (_, index) => {
    const date = new Date()
    date.setUTCHours(0, 0, 0, 0)
    date.setUTCDate(date.getUTCDate() - (364 - index))
    const day = date.toISOString().slice(0, 10)
    const entry = activityByDay.get(day)
    return { day, count: entry?.sessionCount || 0, bytes: BigInt(entry?.bytesIn || '0') + BigInt(entry?.bytesOut || '0') }
  }), [activityByDay])
  const activeSession = liveData?.activeSessions[0] || data.sessions.find((session) => !session.stoppedAt)
  const expiry = data.expiresAt ? new Date(data.expiresAt) : null
  const isOnline = liveData ? liveData.activeSessions.length > 0 : data.sessionSummary.activeSessions > 0
  const visibleSession = liveData?.activeSessions[0]
  const eventItems = useMemo(() => data.events, [data.events])
  const currentMonth = new Date(clockNow).toISOString().slice(0, 7)
  const monthActivity = data.analytics.dailyUsage.filter((entry) => entry.day.startsWith(currentMonth))
  const monthUsageBytes = monthActivity.reduce((total, entry) =>
    total + BigInt(entry.bytesIn || '0') + BigInt(entry.bytesOut || '0'), BigInt(0))
  const yearActivityBytes = data.activity.reduce((total, entry) =>
    total + BigInt(entry.bytesIn || '0') + BigInt(entry.bytesOut || '0'), BigInt(0))
  const recentCommunications = eventItems.filter((entry) => entry.eventType === 'sms').slice(0, 3)

  const handleLiveDataChange = useCallback((value: SubscriberLiveData, rate?: SubscriberUsageRate | null) => {
    setLiveData(value)
    if (rate !== undefined) setLiveRate(rate)
    setLastLiveCheck(value.checkedAt)
  }, [])

  useEffect(() => {
    if (tab === 'Reports') return
    let cancelled = false
    let inFlight = false
    let controller: AbortController | null = null
    const refresh = async () => {
      if (cancelled || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      controller = new AbortController()
      const timeout = window.setTimeout(() => controller?.abort(), 4_000)
      try {
        const response = await fetch(`/api/customers/${encodeURIComponent(data.id)}/live`, {
          cache: 'no-store', signal: controller.signal,
        })
        const result = await response.json() as SubscriberLiveData & { error?: string }
        if (!response.ok) throw new Error(result.error || 'Unable to refresh subscriber status.')
        if (!cancelled) handleLiveDataChange(result)
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
          setActionMessage(error instanceof Error ? error.message : 'Unable to refresh subscriber status.')
          setActionError(true)
        }
      } finally {
        window.clearTimeout(timeout)
        inFlight = false
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5_000)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      controller?.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [data.id, handleLiveDataChange, tab])

  useEffect(() => {
    let cancelled = false
    const refreshDetails = async () => {
      if (cancelled || detailsRefreshInFlight.current || document.visibilityState === 'hidden') return
      detailsRefreshInFlight.current = true
      try {
        await onRefresh()
        if (!cancelled) {
          setLastDetailsCheck(new Date().toISOString())
          setDetailsRefreshError('')
        }
      } catch (error) {
        if (!cancelled) setDetailsRefreshError(error instanceof Error ? error.message : 'Unable to refresh subscriber reports.')
      } finally {
        detailsRefreshInFlight.current = false
      }
    }
    const timer = window.setInterval(() => void refreshDetails(), 30_000)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshDetails()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [data.id, onRefresh])

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!actionDialog) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !actionBusy) setActionDialog(null)
    }
    document.addEventListener('keydown', onKeyDown)
    actionDialogRef.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [actionBusy, actionDialog])

  const performAction = async (action: string, values: Record<string, unknown> = {}) => {
    setActionBusy(true)
    setActionMessage('')
    setActionError(false)
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(data.id)}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...values }),
      })
      const result = await response.json() as { error?: string; message?: string; status?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to complete subscriber action.')
      setActionDialog(null)
      setMenuOpen(false)
      setActionMessage(result.message || 'Subscriber information updated.')
      setActionError(false)
      await onRefresh()
      return true
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Unable to complete subscriber action.')
      setActionError(true)
      return false
    } finally {
      setActionBusy(false)
    }
  }

  const submitDialogAction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (actionDialog === 'edit') {
      void performAction('profile', { name: profileName, email: profileEmail, phone: profilePhone })
    } else if (actionDialog === 'expiry') {
      const expiresAt = new Date(expiryInput)
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        setActionError(true)
        setActionMessage('Choose an expiry date and time in the future.')
        return
      }
      void performAction('subscription', { status: 'active', expiresAt: expiresAt.toISOString() })
    } else if (actionDialog === 'sms') {
      void performAction('sms', { message: smsMessage })
    } else if (actionDialog === 'credentials' || actionDialog === 'payment_details') {
      void performAction(actionDialog)
    } else if (actionDialog === 'invoice') {
      void performAction('invoice', { dueAt: invoiceDueAt })
    } else if (actionDialog === 'compensate') {
      const numericAmount = Number(compensationAmount)
      if (!Number.isSafeInteger(numericAmount) || numericAmount < 1) {
        setActionError(true)
        setActionMessage('Enter a positive whole-number amount.')
        return
      }
      void performAction(compensationKind === 'days' ? 'extend' : 'credit', {
        ...(compensationKind === 'days' ? { days: numericAmount } : { amount: numericAmount }),
        reason: actionReason,
        idempotencyKey: crypto.randomUUID(),
      })
    } else if (actionDialog === 'ticket') {
      void performAction('ticket', { subject: ticketSubject, description: ticketDescription, priority: ticketPriority })
    }
  }

  const exportSubscriberReport = async () => {
    const activeReportSession = liveData?.activeSessions[0] || activeSession
    const liveSession = liveData?.activeSessions[0]
    const liveDownload = liveData?.downloadBytes ?? liveSession?.downloadBytes ??
      (activeSession && 'bytesIn' in activeSession ? activeSession.bytesIn : null)
    const liveUpload = liveData?.uploadBytes ?? liveSession?.uploadBytes ??
      (activeSession && 'bytesOut' in activeSession ? activeSession.bytesOut : null)
    const monthKey = new Date(clockNow).toISOString().slice(0, 7)
    const monthEntries = data.analytics.dailyUsage.filter((entry) => entry.day.startsWith(monthKey))
    const monthSessionCount = monthEntries.reduce((total, entry) => total + entry.sessionCount, 0)
    const monthSessionDurations = data.sessions
      .filter((session) => session.startedAt?.startsWith(monthKey))
      .map((session) => Number(session.sessionSeconds))
      .filter((seconds) => Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 10 * 365 * 86400)
    const averageSessionSeconds = monthSessionDurations.length
      ? Math.round(monthSessionDurations.reduce((total, seconds) => total + seconds, 0) / monthSessionDurations.length)
      : 0
    const hourMap = new Map(data.analytics.hourlyUsage24h
      .filter((entry) => entry.hourAt)
      .map((entry) => [new Date(entry.hourAt!).toISOString().slice(0, 13), entry]))
    const currentHour = new Date(clockNow)
    currentHour.setUTCMinutes(0, 0, 0)
    const last24Hours = Array.from({ length: 24 }, (_, index) => {
      const hour = new Date(currentHour.getTime() - (23 - index) * 3_600_000)
      const entry = hourMap.get(hour.toISOString().slice(0, 13))
      const download = BigInt(entry?.bytesIn || '0')
      const upload = BigInt(entry?.bytesOut || '0')
      return {
        hour: `${hour.toLocaleTimeString('en-KE', { hour: '2-digit', hour12: false, timeZone: 'UTC' })}:00`,
        download: formatBytes(download.toString()),
        upload: formatBytes(upload.toString()),
        totalBytes: Number(download + upload),
      }
    }).filter((entry) => entry.totalBytes > 0)
    const thisMonth = monthEntries.map((entry) => ({
      day: entry.day,
      download: formatBytes(entry.bytesIn),
      upload: formatBytes(entry.bytesOut),
      totalBytes: Number(BigInt(entry.bytesIn || '0') + BigInt(entry.bytesOut || '0')),
    })).filter((entry) => entry.totalBytes > 0)

    setExportingReport(true)
    setActionMessage('')
    setActionError(false)
    try {
      const safeName = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'subscriber'
      await exportSubscriberUsagePdf({
        fileName: `subscriber-${safeName}-${new Date().toISOString().slice(0, 10)}`,
        name: data.name,
        email: data.email,
        username: data.radiusUsername,
        phone: data.phone,
        connectionType: data.planDetails?.type || (data.accountNumber ? 'PPPoE' : 'Service'),
        accountNumber: data.accountNumber,
        totalPaid: formatMoney(data.billing.lifetimeValue),
        paidThisMonth: formatMoney(data.billing.paidThisMonth),
        sessionsThisMonth: monthSessionCount,
        averageSessionThisMonth: averageSessionSeconds ? formatDuration(averageSessionSeconds) : '—',
        online: isOnline,
        siteName: data.siteLocation || data.siteName,
        currentSession: [
          ['Router', liveSession?.routerName || liveSession?.nasIpAddress || activeReportSession?.nasIpAddress || data.siteName || '—'],
          ['IP address', activeReportSession?.ipAddress || '—'],
          ['MAC / caller ID', liveSession?.macAddress || liveSession?.callerId || activeReportSession?.macAddress || '—'],
          ['Connected for', activeReportSession?.sessionSeconds != null
            ? formatDuration(activeReportSession.sessionSeconds)
            : activeReportSession?.startedAt
              ? formatDuration(Math.floor((clockNow - new Date(activeReportSession.startedAt).getTime()) / 1000))
              : 'Offline'],
          ['Downloaded', liveDownload ? formatBytes(liveDownload) : '—'],
          ['Uploaded', liveUpload ? formatBytes(liveUpload) : '—'],
        ],
        last24Hours,
        thisMonth,
        sessions: data.sessions.map((session) => [
          formatDate(session.startedAt),
          session.nasIpAddress || data.siteName || '—',
          formatDuration(session.sessionSeconds),
          formatBytes(session.bytesIn),
          formatBytes(session.bytesOut),
          session.stoppedAt ? session.terminateCause || formatDate(session.stoppedAt) : 'Still connected',
        ]),
        payments: data.billing.payments.map((payment) => [
          formatDate(payment.paidAt, { dateStyle: 'medium' }),
          payment.method || payment.status,
          payment.reference || '—',
          formatMoney(payment.amount),
        ]),
        generatedAt: formatDate(new Date().toISOString()),
      })
      setActionMessage('Subscriber usage report exported.')
    } catch (error) {
      console.error('Unable to export the subscriber report', error)
      setActionError(true)
      setActionMessage('Unable to export subscriber PDF. Please try again.')
    } finally {
      setExportingReport(false)
    }
  }

  return (
    <section className="subscriber-profile" aria-label={`Profile for ${data.name}`}>
      <header className="subscriber-profile-header">
        <div className="subscriber-profile-toolbar">
          <div className="subscriber-profile-breadcrumb"><span>CUSTOMERS</span><span>—</span><span>SUBSCRIBERS</span><span>—</span><span>#{data.id.slice(0, 8).toUpperCase()}</span></div>
          <div className="subscriber-profile-actions">
            <button className="outline-button" type="button" onClick={onClose}>Close profile</button>
            <button className="outline-button" type="button" disabled={!data.phone || actionBusy} onClick={() => { setActionMessage(''); setActionDialog('sms') }}><MessageCircle size={14} /> SMS</button>
            <button className="outline-button subscriber-profile-icon-action" type="button" aria-label="Edit subscriber" disabled={actionBusy} onClick={() => { setProfileName(data.name); setProfileEmail(data.email); setProfilePhone(data.phone || ''); setActionMessage(''); setActionDialog('edit') }}><Pencil size={14} /></button>
            <button className="primary-button subscriber-profile-expiry-action" type="button" disabled={actionBusy || !data.radiusUsername} onClick={() => { setActionMessage(''); setActionDialog('expiry') }}><CalendarDays size={14} /> Change expiry</button>
            <div className="subscriber-profile-menu-anchor">
              <button className="outline-button subscriber-profile-icon-action" type="button" aria-label="More subscriber actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Ellipsis size={17} /></button>
              {menuOpen && <div className="subscriber-profile-menu" role="menu">
                <button type="button" role="menuitem" disabled title="Customer self-service portal is not configured"><Wifi size={14} /> View customer portal</button>
                <button type="button" role="menuitem" disabled={!data.phone || !data.radiusUsername || !data.radiusPassword} onClick={() => { setActionMessage(''); setActionDialog('credentials'); setMenuOpen(false) }}><Send size={14} /> Send credentials</button>
                <button type="button" role="menuitem" disabled={!data.phone} onClick={() => { setActionMessage(''); setActionDialog('payment_details'); setMenuOpen(false) }}><MessageCircle size={14} /> Send payment details</button>
                <button type="button" role="menuitem" onClick={() => { setActionMessage(''); setActionDialog('invoice'); setMenuOpen(false) }}><FileText size={14} /> Generate invoice</button>
                <button type="button" role="menuitem" disabled={!data.radiusUsername || data.status === 'suspended'} onClick={() => void performAction('subscription', { status: 'suspended' })}><Pause size={14} /> Pause subscription</button>
                <button type="button" role="menuitem" disabled title="FUP override is unavailable until an operator policy is configured"><Activity size={14} /> FUP override · unavailable</button>
                <button type="button" role="menuitem" className="is-danger" disabled={!data.radiusUsername || data.status === 'blocked'} onClick={() => {
                  if (window.confirm(`Block ${data.name}? New RADIUS logins will be rejected.`)) void performAction('subscription', { status: 'blocked' })
                }}><Wifi size={14} /> Block subscriber</button>
                <button type="button" role="menuitem" onClick={() => { setActionReason(''); setCompensationAmount('1'); setCompensationKind('days'); setActionDialog('compensate'); setMenuOpen(false) }}><Gift size={14} /> Compensate</button>
                <div className="subscriber-profile-menu-separator" />
                <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuOpen(false); onDelete() }}><Trash2 size={14} /> Delete subscriber</button>
              </div>}
            </div>
          </div>
        </div>
        <div className="subscriber-profile-identity">
          <div className="subscriber-profile-avatar" aria-hidden="true">{data.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U'}</div>
          <div className="subscriber-profile-name">
            <h3>{data.name}</h3>
            <div className="subscriber-profile-meta">
              <strong>@{data.radiusUsername || 'No login'}</strong>
              <span className={`subscriber-profile-badge ${isOnline ? 'online' : ''}`}>{isOnline ? `Online · ${visibleSession?.startedAt ? formatDuration(Math.floor((clockNow - new Date(visibleSession.startedAt).getTime()) / 1000)) : 'active'}` : 'Offline'}</span>
              {visibleSession?.routerName && <span className="subscriber-profile-badge">{visibleSession.routerName}</span>}
              {(visibleSession?.downloadBytes || visibleSession?.uploadBytes) && <span className="subscriber-profile-badge">{formatBytes(String(BigInt(visibleSession.downloadBytes || '0') + BigInt(visibleSession.uploadBytes || '0')))} this session</span>}
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
        {actionMessage && <p className={`subscriber-profile-action-message${actionError ? ' is-error' : ''}`} role={actionError ? 'alert' : 'status'}>{actionMessage}</p>}
      </header>

      <div className="subscriber-profile-metrics">
        <article><span>Subscription</span><strong>{expiry && Number.isFinite(expiry.getTime()) ? `${Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86400000))} days` : 'No expiry'}</strong><small>{expiry ? `Renews ${formatDate(expiry.toISOString())}` : 'No expiry date recorded'}</small></article>
        <article><span>Last session</span><strong className={isOnline ? 'is-online-value' : ''}>{isOnline ? 'Online' : data.sessionSummary.lastSessionAt ? formatDate(data.sessionSummary.lastSessionAt, { dateStyle: 'medium' }) : 'Never'}</strong><small>{isOnline ? `Live · ${visibleSession?.startedAt ? formatDuration(Math.floor((clockNow - new Date(visibleSession.startedAt).getTime()) / 1000)) : 'active'}${lastLiveCheck ? ` · checked ${formatDate(lastLiveCheck, { timeStyle: 'short' })}` : ''}` : data.sessionSummary.lastSessionAt ? formatDate(data.sessionSummary.lastSessionAt, { timeStyle: 'short' }) : 'No sessions on record'}</small></article>
        <article><span>Lifetime value</span><strong>{formatMoney(data.billing.lifetimeValue)}</strong><small>{formatMoney(data.billing.paidThisMonth)} this month</small></article>
        <article><span>Wallet balance</span><strong>{data.billing.creditBalance > 0 ? formatMoney(data.billing.creditBalance) : '—'}</strong><small>{data.billing.creditBalance > 0 ? 'Account credit available' : 'No account credit'}</small></article>
      </div>

      <nav className="subscriber-profile-tabs" aria-label="Subscriber profile sections">
        {(['Overview', 'Reports', 'Sessions', 'Payments', 'Package history', 'SMS', 'Tickets', 'Notes'] as const).map((item) => (
          <button key={item} type="button" className={tab === item ? 'selected' : ''} aria-current={tab === item ? 'page' : undefined} onClick={() => setTab(item)}>
            {item}{item === 'Sessions' ? <span>{data.sessionSummary.sessionCount}</span> : item === 'Payments' ? <span>{data.billing.payments.length}</span> : item === 'Package history' ? <span>{data.packageHistory.length}</span> : item === 'SMS' ? <span>{eventItems.filter((entry) => entry.eventType === 'sms').length}</span> : item === 'Tickets' ? <span>{data.tickets.length}</span> : item === 'Notes' ? <span>{eventItems.filter((entry) => entry.eventType === 'note').length}</span> : null}
          </button>
        ))}
      </nav>

      {tab === 'Overview' && <>
        <div className="subscriber-profile-refresh-status">
          <span>Profile data refreshes every 30 seconds. Router status and counters refresh every 5 seconds.</span>
          <span>{lastDetailsCheck ? `Updated ${formatDate(lastDetailsCheck, { timeStyle: 'short' })}` : 'Profile data loaded'}</span>
        </div>
        {detailsRefreshError && <p className="subscriber-live-error" role="alert">{detailsRefreshError}</p>}
        <div className="subscriber-profile-columns">
          <div className="subscriber-profile-main-column">
            <section className="subscriber-profile-panel">
              <h4><Clock3 size={16} /> Subscription lifecycle</h4>
              <p>Account events from signup to now</p>
              <div className="subscriber-lifecycle">
                <div><span className="lifecycle-dot muted" /><div><strong>Account created</strong><small>{formatDate(data.createdAt)}</small><p>Subscriber added to this workspace</p></div></div>
                {data.sessionSummary.firstSessionAt && <div><span className="lifecycle-dot" /><div><strong>First session</strong><small>{formatDate(data.sessionSummary.firstSessionAt)}</small><p>First recorded RADIUS connection</p></div></div>}
                {data.sessionSummary.lastSessionAt && <div><span className="lifecycle-dot" /><div><strong>Last session</strong><small>{formatDate(data.sessionSummary.lastSessionAt)}</small><p>Most recent RADIUS accounting record</p></div></div>}
                <div><span className={`lifecycle-dot ${isOnline ? 'live' : ''}`} /><div><strong>{isOnline ? 'Today · live session' : 'Current state'}</strong><small>{isOnline ? `${liveData?.activeSessions.length || data.sessionSummary.activeSessions} online` : data.status}</small><p>{isOnline ? `Connected for ${visibleSession?.sessionSeconds ? formatDuration(visibleSession.sessionSeconds) : 'active'}` : expiry ? `Service expiry ${formatDate(expiry.toISOString())}` : 'No active RADIUS session'}</p></div></div>
              </div>
            </section>

            <section className="subscriber-profile-panel">
              <h4><CalendarDays size={16} /> Activity · last 365 days</h4>
              <div className="subscriber-activity-legend"><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} className={`activity-level-${level}`} />)}<span>More</span></div>
              <div className="subscriber-activity-content">
                <p>{activityDays.filter((day) => day.count > 0).length} active days · {formatBytes(yearActivityBytes.toString())} transferred</p>
                <div className="subscriber-activity-grid" aria-label="Daily RADIUS sessions over the last 365 days">
                  {activityDays.map(({ day, count, bytes }) => <span key={day} className={`activity-level-${count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4}`} title={`${day}: ${count} session${count === 1 ? '' : 's'} · ${formatBytes(bytes.toString())}`} />)}
                </div>
                <small>{data.sessionSummary.sessionCount ? 'Daily activity is based on recorded RADIUS sessions.' : 'No RADIUS activity in the last year.'}</small>
              </div>
            </section>

            {data.planDetails?.fupEnabled && data.planDetails.fupLimitBytes && <section className="subscriber-profile-panel">
              <h4><Activity size={16} /> Fair Use Policy</h4>
              <div className="subscriber-profile-inset">
                <p>Month-to-date RADIUS usage: <strong>{formatBytes(monthUsageBytes.toString())}</strong> of <strong>{formatBytes(String(data.planDetails.fupLimitBytes))}</strong></p>
                <div className="subscriber-fup-progress" role="progressbar" aria-label="Fair use policy usage this month" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(Number(monthUsageBytes) / data.planDetails.fupLimitBytes * 100))}><span style={{ width: `${Math.min(100, Number(monthUsageBytes) / data.planDetails.fupLimitBytes * 100)}%` }} /></div>
                <p>Downloaded {formatBytes(data.sessionSummary.bytesOut)} · Uploaded {formatBytes(data.sessionSummary.bytesIn)}</p>
              </div>
            </section>}
          </div>

          <aside className="subscriber-profile-side-column">
            <section className="subscriber-profile-panel">
              <h4><Wifi size={16} /> Device &amp; network</h4>
              <dl className="subscriber-profile-facts">
                <div><dt>Router</dt><dd>{visibleSession?.routerName || data.siteName || 'Not reported'}</dd></div>
                <div><dt>IP address</dt><dd>{visibleSession?.ipAddress || activeSession?.ipAddress || 'No active session'}</dd></div>
                <div><dt>MAC / caller ID</dt><dd>{visibleSession?.macAddress || visibleSession?.callerId || activeSession?.macAddress || (isOnline ? 'Not reported by router' : 'No active session')}</dd></div>
                <div><dt>Connection type</dt><dd>{data.planDetails?.type || (data.accountNumber ? 'PPPoE' : 'Not recorded')}</dd></div>
                <div><dt>Username</dt><dd>{data.radiusUsername || 'Not set'}{data.radiusUsername && <button type="button" aria-label="Copy username" onClick={() => onCopy('username', data.radiusUsername!)}><Copy size={14} />{copiedCredential === 'username' ? 'Copied' : ''}</button>}</dd></div>
                {data.accountNumber && <div><dt>Account number</dt><dd>{data.accountNumber}<button type="button" aria-label="Copy account number" onClick={() => onCopy('accountNumber', data.accountNumber!)}><Copy size={14} />{copiedCredential === 'accountNumber' ? 'Copied' : ''}</button></dd></div>}
                {data.radiusPassword && <div><dt>Password</dt><dd><span className="subscriber-profile-password">{showPassword ? data.radiusPassword : '••••••••••••'}</span><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={onTogglePassword}>{showPassword ? 'Hide' : 'Show'}</button><button type="button" aria-label="Copy password" onClick={() => onCopy('password', data.radiusPassword!)}><Copy size={14} />{copiedCredential === 'password' ? 'Copied' : ''}</button></dd></div>}
                <div><dt>Customer location</dt><dd>{data.location || 'Not recorded'}</dd></div>
                <div><dt>Network site</dt><dd>{data.siteName ? `${data.siteName}${data.siteLocation ? ` · ${data.siteLocation}` : ''}` : 'Not assigned'}</dd></div>
                <div><dt>Router / NAS</dt><dd>{visibleSession?.routerName || visibleSession?.nasIpAddress || activeSession?.nasIpAddress || 'Not reported'}</dd></div>
                <div><dt>Data received · all sessions</dt><dd>{formatBytes(data.sessionSummary.bytesIn)}</dd></div>
                <div><dt>Data sent · all sessions</dt><dd>{formatBytes(data.sessionSummary.bytesOut)}</dd></div>
              </dl>
            </section>
            <section className="subscriber-profile-panel">
              <h4><FileText size={16} /> Reference</h4>
              <dl className="subscriber-profile-facts">
                <div><dt>Account ID</dt><dd>#{data.id.slice(0, 8).toUpperCase()}</dd></div>
                <div><dt>Account number</dt><dd>{data.accountNumber || 'Not assigned'}</dd></div>
                <div><dt>Phone</dt><dd>{data.phone || 'Not recorded'}</dd></div>
                <div><dt>Customer location</dt><dd>{data.location || 'Not recorded'}</dd></div>
                <div><dt>Network site</dt><dd>{data.siteName || 'Not assigned'}</dd></div>
                <div><dt>Acquired via</dt><dd>{data.accountSource}</dd></div>
              </dl>
            </section>
            <section className="subscriber-profile-panel">
              <div className="subscriber-profile-section-heading"><div><h4><MessageCircle size={16} /> Communications</h4><p>Recent messages sent to this subscriber</p></div><button type="button" className="outline-button" onClick={() => setTab('SMS')}>View all</button></div>
              {recentCommunications.length ? <div className="subscriber-profile-communications">{recentCommunications.map((entry) => <article key={entry.id}><div><strong>Sent</strong><time>{formatDate(entry.createdAt, { dateStyle: 'medium' })}</time></div><p>{entry.description}</p></article>)}</div> : <p className="subscriber-profile-empty">No communications recorded.</p>}
            </section>
            <section className="subscriber-profile-panel">
              <h4><CreditCard size={16} /> Recent payments</h4>
              {data.billing.payments.slice(0, 4).length ? <div className="subscriber-profile-payments">{data.billing.payments.slice(0, 4).map((payment) => <div key={payment.id}><span>{payment.method || payment.status}</span><strong>{formatMoney(payment.amount)}</strong><small>{formatDate(payment.paidAt)}</small></div>)}</div> : <p className="subscriber-profile-empty">No payments recorded for this subscriber.</p>}
            </section>
          </aside>
        </div>
      </>}

      {tab === 'Reports' && <>
        <div className="subscriber-report-export-bar">
          <button className="outline-button" type="button" disabled={exportingReport} onClick={() => void exportSubscriberReport()}>
            <FileText size={15} /> {exportingReport ? 'Exporting PDF…' : 'Export PDF'}
          </button>
        </div>
        <div className="subscriber-profile-refresh-status">
          <span>Live router counters update every 5 seconds. Historical billing and usage refresh every 30 seconds.</span>
          <span>Updated {formatDate(lastDetailsCheck, { timeStyle: 'short' })}</span>
        </div>
        {detailsRefreshError && <p className="subscriber-live-error" role="alert">{detailsRefreshError}</p>}
        <SubscriberLiveReports subscriberId={data.id} data={data} onLiveDataChange={handleLiveDataChange} />
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

      {tab === 'Package history' && <section className="subscriber-profile-panel subscriber-profile-table-panel">
        <h4><Router size={16} /> Package history</h4>
        <p>Completed hotspot purchases and recorded subscription changes.</p>
        <div className="subscriber-profile-table-scroll"><table><thead><tr><th>DATE</th><th>PACKAGE / EVENT</th><th>STATUS</th><th>AMOUNT</th><th>REFERENCE</th></tr></thead><tbody>
          {[
            ...data.packageHistory.map((purchase) => ({
              id: purchase.id, at: purchase.paidAt || purchase.createdAt, name: purchase.productName,
              status: purchase.status, amount: purchase.amount, reference: purchase.receipt || '—',
            })),
            ...eventItems.filter((entry) => entry.eventType === 'package_changed' || entry.eventType === 'subscription_updated').map((entry) => ({
              id: entry.id, at: entry.createdAt, name: entry.description, status: 'recorded', amount: 0, reference: '—',
            })),
          ].sort((left, right) => right.at.localeCompare(left.at)).map((entry) => <tr key={entry.id}><td>{formatDate(entry.at)}</td><td>{entry.name}</td><td>{entry.status}</td><td>{entry.amount ? formatMoney(entry.amount) : '—'}</td><td>{entry.reference}</td></tr>)}
          {!data.packageHistory.length && !eventItems.some((entry) => entry.eventType === 'package_changed' || entry.eventType === 'subscription_updated') && <tr><td colSpan={5} className="subscriber-profile-empty">No package changes or purchases have been recorded.</td></tr>}
        </tbody></table></div>
      </section>}

      {tab === 'SMS' && <section className="subscriber-profile-panel subscriber-profile-table-panel">
        <div className="subscriber-profile-section-heading"><div><h4><MessageCircle size={16} /> SMS history</h4><p>Delivery state is recorded when messages are sent or queued.</p></div><button type="button" className="outline-button" disabled={!data.phone} onClick={() => { setActionMessage(''); setActionDialog('sms') }}><Send size={14} /> Send SMS</button></div>
        <div className="subscriber-profile-table-scroll"><table><thead><tr><th>DATE</th><th>ACTIVITY</th><th>RECIPIENT</th><th>STATUS</th></tr></thead><tbody>
          {eventItems.filter((entry) => entry.eventType === 'sms').map((entry) => <tr key={entry.id}><td>{formatDate(entry.createdAt)}</td><td>{entry.description}</td><td>{String(entry.metadata.phone || data.phone || '—')}</td><td>{String(entry.metadata.status || 'Recorded')}</td></tr>)}
          {!eventItems.some((entry) => entry.eventType === 'sms') && <tr><td colSpan={4} className="subscriber-profile-empty">No SMS messages have been sent from this profile.</td></tr>}
        </tbody></table></div>
      </section>}

      {tab === 'Tickets' && <section className="subscriber-profile-panel subscriber-profile-table-panel">
        <div className="subscriber-profile-section-heading"><div><h4><Ticket size={16} /> Support tickets</h4><p>Tickets linked to this subscriber account.</p></div><button type="button" className="outline-button" onClick={() => { setActionMessage(''); setActionDialog('ticket') }}><Ticket size={14} /> New ticket</button></div>
        <div className="subscriber-profile-table-scroll"><table><thead><tr><th>CREATED</th><th>SUBJECT</th><th>PRIORITY</th><th>STATUS</th><th>UPDATED</th></tr></thead><tbody>
          {data.tickets.map((ticket) => <tr key={ticket.id}><td>{formatDate(ticket.createdAt)}</td><td><strong>{ticket.subject}</strong><small>{ticket.description}</small></td><td>{ticket.priority}</td><td>{ticket.status}</td><td>{formatDate(ticket.updatedAt)}</td></tr>)}
          {!data.tickets.length && <tr><td colSpan={5} className="subscriber-profile-empty">No support tickets are linked to this subscriber.</td></tr>}
        </tbody></table></div>
      </section>}

      {tab === 'Notes' && <section className="subscriber-profile-panel subscriber-profile-table-panel">
        <h4><FileText size={16} /> Subscriber notes</h4>
        <form className="subscriber-profile-note-form" onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          const note = new FormData(form).get('note')
          void performAction('note', { note }).then((saved) => { if (saved) form.reset() })
        }}>
          <label htmlFor={`subscriber-note-${data.id}`}>Add a private workspace note</label>
          <textarea id={`subscriber-note-${data.id}`} name="note" required maxLength={2000} rows={3} placeholder="Add a service or account note…" />
          <button type="submit" className="primary-button" disabled={actionBusy}><FileText size={14} /> Save note</button>
        </form>
        <div className="subscriber-profile-events">{eventItems.filter((entry) => entry.eventType === 'note').map((entry) => <article key={entry.id}><p>{entry.description}</p><time>{formatDate(entry.createdAt)}</time></article>)}{!eventItems.some((entry) => entry.eventType === 'note') && <p className="subscriber-profile-empty">No private notes have been added.</p>}</div>
      </section>}

      {actionDialog && <div className="subscriber-action-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !actionBusy) setActionDialog(null)
      }}>
        <div className="subscriber-action-dialog" role="dialog" aria-modal="true" aria-labelledby={`subscriber-action-title-${data.id}`} ref={actionDialogRef}>
          <div className="subscriber-action-dialog-heading"><div><span>SUBSCRIBER ACTION</span><h3 id={`subscriber-action-title-${data.id}`}>{({
            edit: 'Edit subscriber', expiry: 'Change subscription expiry', sms: 'Send SMS',
            credentials: 'Send login credentials', payment_details: 'Send payment details',
            invoice: 'Generate invoice', compensate: 'Compensate subscriber', ticket: 'Create support ticket',
          })[actionDialog]}</h3></div><button type="button" aria-label="Close dialog" disabled={actionBusy} onClick={() => setActionDialog(null)}><X size={17} /></button></div>
          <form onSubmit={submitDialogAction}>
            {actionDialog === 'edit' && <div className="subscriber-action-form-grid">
              <label>Full name<input required maxLength={120} value={profileName} onChange={(event) => setProfileName(event.target.value)} /></label>
              <label>Email<input required type="email" maxLength={254} value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} /></label>
              <label>Phone<input type="tel" maxLength={32} value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} /></label>
            </div>}
            {actionDialog === 'expiry' && <label className="subscriber-action-form-field">New expiry date and time<input required type="datetime-local" value={expiryInput} onChange={(event) => setExpiryInput(event.target.value)} /></label>}
            {actionDialog === 'sms' && <label className="subscriber-action-form-field">Message to {data.name}<textarea required maxLength={500} rows={4} value={smsMessage} onChange={(event) => setSmsMessage(event.target.value)} placeholder="Type a message…" /><small>{smsMessage.length}/500 characters · {data.phone || 'No phone number'}</small></label>}
            {actionDialog === 'credentials' && <p className="subscriber-action-warning">This sends the stored RADIUS username and password to {data.phone}. Only continue if this number is verified and the subscriber requested their credentials.</p>}
            {actionDialog === 'payment_details' && <p className="subscriber-action-warning">This sends plan and monthly price details to {data.phone}: {data.plan || 'plan not set'} · {formatMoney(data.monthlyRate)}/month.</p>}
            {actionDialog === 'invoice' && <><p className="subscriber-action-warning">Creates the current month’s invoice for {formatMoney(data.monthlyRate)}. Available account credit will be applied in full if it covers the invoice. An invoice can only be generated once per month.</p><label className="subscriber-action-form-field">Due date<input required type="date" value={invoiceDueAt} onChange={(event) => setInvoiceDueAt(event.target.value)} /></label></>}
            {actionDialog === 'compensate' && <div className="subscriber-action-form-grid">
              <label>Compensation type<select value={compensationKind} onChange={(event) => setCompensationKind(event.target.value as 'days' | 'credit')}><option value="days">Free service days</option><option value="credit">Account credit (KSh)</option></select></label>
              <label>{compensationKind === 'days' ? 'Days to add' : 'Credit amount (KSh)'}<input required type="number" min="1" max={compensationKind === 'days' ? '365' : '10000000'} step="1" value={compensationAmount} onChange={(event) => setCompensationAmount(event.target.value)} /></label>
              <label className="subscriber-action-wide">Reason<input required maxLength={500} value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="Document why this compensation is being granted" /></label>
              {compensationKind === 'credit' && <p className="subscriber-action-warning subscriber-action-wide">Account credits are applied to a generated monthly invoice only when they fully cover it. Current balance: {formatMoney(data.billing.creditBalance)}.</p>}
            </div>}
            {actionDialog === 'ticket' && <div className="subscriber-action-form-grid">
              <label className="subscriber-action-wide">Subject<input required maxLength={180} value={ticketSubject} onChange={(event) => setTicketSubject(event.target.value)} /></label>
              <label>Priority<select value={ticketPriority} onChange={(event) => setTicketPriority(event.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
              <label className="subscriber-action-wide">Description<textarea required maxLength={4000} rows={4} value={ticketDescription} onChange={(event) => setTicketDescription(event.target.value)} /></label>
            </div>}
            {actionError && actionMessage && <p className="subscriber-action-error" role="alert">{actionMessage}</p>}
            <div className="subscriber-action-dialog-actions"><button type="button" className="outline-button" disabled={actionBusy} onClick={() => setActionDialog(null)}>Cancel</button><button className="primary-button" type="submit" disabled={actionBusy}>{actionBusy ? 'Working…' : actionDialog === 'credentials' || actionDialog === 'payment_details' ? 'Confirm and send' : actionDialog === 'invoice' ? 'Generate invoice' : 'Save'}</button></div>
          </form>
        </div>
      </div>}
    </section>
  )
}
