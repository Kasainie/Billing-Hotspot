'use client'

import { useMemo, useState } from 'react'
import { Activity, CalendarDays, Clock3, Copy, CreditCard, Router, Wifi } from 'lucide-react'

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
  const [tab, setTab] = useState<'Overview' | 'Sessions' | 'Payments'>('Overview')
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
        {(['Overview', 'Sessions', 'Payments'] as const).map((item) => (
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
