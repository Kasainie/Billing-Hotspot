'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { KENYAN_MOBILE_PHONE_PATTERN } from '@/lib/kenyan-phone'

type SmsMessage = {
  id: string
  recipient: string
  status: string
  deliveryStatus: string
  lastError: string | null
  createdAt: string
  sentAt: string | null
  deliveryReportedAt: string | null
  deliveryReport: Record<string, string | null> | null
  message: string | null
  messageError: string | null
  resendOfId: string | null
}

type SmsHistory = {
  messages: SmsMessage[]
  total: number
  offset: number
  limit: number
  counts: { queued: number; pending: number; delivered: number; failed: number }
}

type SmsSettings = {
  environment: string
  username: string
  senderId: string
  configured: boolean
  deliveryReportUrl: string
}

const emptySettings: SmsSettings = {
  environment: 'production',
  username: '',
  senderId: '',
  configured: false,
  deliveryReportUrl: '',
}

export function SmsSettings({ configurationOnly = false }: { configurationOnly?: boolean }) {
  const [settings, setSettings] = useState(emptySettings)
  const [history, setHistory] = useState<SmsHistory>({ messages: [], total: 0, offset: 0, limit: 50, counts: { queued: 0, pending: 0, delivered: 0, failed: 0 } })
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testing, setTesting] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [resendingId, setResendingId] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)

  async function loadSettings() {
    const response = await fetch('/api/tenant/sms-settings', { cache: 'no-store' })
    const result = await response.json() as SmsSettings & { error?: string }
    if (!response.ok) throw new Error(result.error || 'Unable to load SMS settings.')
    setSettings(result)
  }

  async function loadHistory(nextFilter = filter, append = false) {
    setLoadingHistory(true)
    try {
      const offset = append ? history.messages.length : 0
      const response = await fetch(`/api/tenant/sms-messages?status=${encodeURIComponent(nextFilter)}&offset=${offset}`, { cache: 'no-store' })
      const result = await response.json() as SmsHistory & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to load SMS delivery reports.')
      setHistory((current) => ({
        ...result,
        messages: append ? [...current.messages, ...result.messages] : result.messages,
      }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load SMS delivery reports.')
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    void loadSettings().catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load SMS settings.'))
  }, [])

  useEffect(() => {
    if (!configurationOnly) void loadHistory('all')
  }, [configurationOnly])

  async function save(formData: FormData) {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/tenant/sms-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      })
      const result = await response.json() as SmsSettings & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to save SMS settings.')
      setSettings((current) => ({ ...current, ...result, configured: true }))
      setMessage('Africa’s Talking credentials saved securely.')
      await loadSettings()
      const form = document.getElementById('tenant-sms-form')
      if (form instanceof HTMLFormElement) form.reset()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save SMS settings.')
    } finally {
      setSaving(false)
    }
  }

  async function sendTest() {
    setTesting(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/tenant/sms-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: testPhone }),
      })
      const result = await response.json() as { message?: string; error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to send a test SMS.')
      setMessage(result.message || 'Test SMS sent successfully.')
      await Promise.all([loadSettings(), loadHistory(filter)])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to send a test SMS.')
    } finally {
      setTesting(false)
    }
  }

  async function resendSms(id: string) {
    setResendingId(id)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/tenant/sms-messages/${encodeURIComponent(id)}/retry`, { method: 'POST' })
      const result = await response.json() as { message?: string; error?: string }
      if (!response.ok && response.status !== 202) throw new Error(result.error || 'Unable to resend SMS.')
      setMessage(result.message || 'SMS resend queued.')
      await loadHistory(filter)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to resend SMS.')
    } finally {
      setResendingId('')
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSending(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/tenant/sms-messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: recipient, message: draft }),
      })
      const result = await response.json() as { message?: string; error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to send this SMS.')
      setMessage(result.message || 'SMS message submitted.')
      setRecipient('')
      setDraft('')
      setComposeOpen(false)
      setFilter('all')
      await loadHistory('all')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to send this SMS.')
    } finally {
      setSending(false)
    }
  }

  function messageStatus(item: SmsMessage) {
    if (item.messageError) return 'Unreadable'
    if (item.status === 'sending') return 'Sending'
    if (item.status === 'queued') return 'Queued'
    if (item.status === 'failed' || item.deliveryStatus === 'failed') return 'Failed'
    if (item.deliveryStatus === 'delivered') return 'Delivered'
    return 'Sent to provider'
  }

  if (configurationOnly) {
    return <section className="module-panel payment-settings-panel">
      <div className="module-heading"><div><p className="eyebrow">COMMUNICATIONS</p><h2>SMS gateway</h2></div><span className={`availability-tag ${settings.configured ? 'availability-live' : 'availability-off'}`}>{settings.configured ? 'Configured' : 'Not configured'}</span></div>
      <p>Configure the Africa’s Talking account used for workspace SMS. API keys are encrypted before storage and never shown again.</p>
      <form id="tenant-sms-form" action={save} className="tenant-payment-form">
        <label>Environment<select name="environment" value={settings.environment} onChange={(event) => setSettings((current) => ({ ...current, environment: event.target.value }))}><option value="production">Production</option><option value="sandbox">Sandbox</option></select></label>
        <label>Africa’s Talking username<input name="username" autoComplete="off" value={settings.username} onChange={(event) => setSettings((current) => ({ ...current, username: event.target.value }))} required maxLength={100} /></label>
        <label>API key<input name="apiKey" type="password" autoComplete="new-password" required minLength={8} maxLength={2048} /></label>
        <label>Sender ID (optional)<input name="senderId" autoComplete="off" value={settings.senderId} onChange={(event) => setSettings((current) => ({ ...current, senderId: event.target.value }))} maxLength={11} pattern="[A-Za-z0-9]{1,11}" /></label>
        <p className="tenant-payment-note">A sender ID must be approved by Africa’s Talking. Include the country code when entering recipient numbers, for example +254712345678.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="tenant-payment-success" role="status">{message}</p>}
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save SMS settings'}</button>
      </form>
    </section>
  }

  return (
    <section className="module-panel payment-settings-panel">
      <div className="module-heading"><div><p className="eyebrow">SMS ACTIVITY</p><h2>Outbox</h2></div><div className="communications-sms-heading-actions"><span className={`availability-tag ${settings.configured ? 'availability-live' : 'availability-off'}`}>{settings.configured ? 'Configured' : 'Not configured'}</span><button type="button" className="primary-button" disabled={!settings.configured} onClick={() => setComposeOpen((open) => !open)}>{composeOpen ? 'Close composer' : '+ New message'}</button></div></div>
      {composeOpen && <form className="communications-compose-form" onSubmit={sendMessage}>
        <div><span>NEW SMS</span><h3>Compose a message</h3><p>Send one SMS to a Kenyan mobile number. Delivery status will appear in the outbox.</p></div>
        <label>Recipient phone number<input required type="tel" inputMode="tel" autoComplete="tel" pattern={KENYAN_MOBILE_PHONE_PATTERN} maxLength={13} placeholder="0712345678 or +254712345678" title="Use 07 followed by 8 digits or +254 followed by 9 digits." value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label>
        <label>Message<textarea required maxLength={1000} rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type your message…" /></label>
        <div className="communications-compose-actions"><small>{draft.length}/1000 characters. SMS charges are set by your provider.</small><button type="submit" className="primary-button" disabled={sending || !recipient.trim() || !draft.trim()}>{sending ? 'Sending…' : 'Send SMS'}</button></div>
      </form>}
      {settings.configured && <div className="sms-test-panel">
        <h3>Send a test message</h3>
        <div className="sms-test-controls"><label htmlFor="sms-test-phone">Kenyan mobile number</label><input id="sms-test-phone" type="tel" value={testPhone} onChange={(event) => setTestPhone(event.target.value)} placeholder="0712345678 or +254712345678" title="Enter 07 followed by 8 digits or +254 followed by 9 digits." pattern={KENYAN_MOBILE_PHONE_PATTERN} maxLength={13} inputMode="tel" /><button className="text-button" type="button" disabled={testing || !testPhone.trim()} onClick={() => void sendTest()}>{testing ? 'Sending…' : 'Send test SMS'}</button></div>
      </div>}
      <div className="sms-deliveries">
        <div className="sms-deliveries-heading"><div><h3>SMS delivery reports</h3><p>Automatic notices and messages sent from subscriber accounts.</p></div><button className="text-button" type="button" disabled={loadingHistory} onClick={() => void Promise.all([loadSettings(), loadHistory(filter)])}>{loadingHistory ? 'Refreshing…' : 'Refresh reports'}</button></div>
        <div className="sms-delivery-summary">
          {([
            ['queued', 'Queued'],
            ['pending', 'Sent to provider'],
            ['delivered', 'Delivered'],
            ['failed', 'Failed'],
          ] as const).map(([key, label]) => <button type="button" key={key} className={`sms-summary-card${filter === key ? ' is-selected' : ''}`} aria-pressed={filter === key} onClick={() => { setFilter(key); void loadHistory(key) }}><span>{label}</span><strong>{history.counts[key]}</strong></button>)}
        </div>
        <div className="communications-sms-filters"><label className="sms-history-filter">Show messages<select value={filter} onChange={(event) => { setFilter(event.target.value); void loadHistory(event.target.value) }}><option value="all">All messages</option><option value="queued">Queued</option><option value="pending">Sent to provider</option><option value="delivered">Delivered</option><option value="failed">Failed</option></select></label><label className="communications-sms-search"><span className="sr-only">Search messages</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search recipient or message" /></label></div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="tenant-payment-success" role="status">{message}</p>}
        {history.messages.length ? <>
          <div className="table-scroll"><table><thead><tr><th>Recipient / message</th><th>Status</th><th>Sent</th><th>Delivery report</th><th>Action</th></tr></thead><tbody>{history.messages.filter((item) => `${item.recipient} ${item.message || ''}`.toLowerCase().includes(search.trim().toLowerCase())).map((item) => {
            const report = item.deliveryReport
            const failed = item.status === 'failed' || item.deliveryStatus === 'failed'
            return <tr key={item.id}>
              <td><strong>{item.recipient}</strong><span className="sms-message-preview">{item.message ?? 'Message text unavailable: encryption key differs from the key used when this message was stored.'}</span>{item.messageError && <span className="sms-delivery-error">{item.messageError}</span>}{item.resendOfId && <small>Resent message</small>}</td>
              <td><span className={`sms-status-badge sms-status-${messageStatus(item).toLowerCase().replace(/\s+/g, '-')}`}>{messageStatus(item)}</span>{item.lastError && <span className="sms-delivery-error">{item.lastError}</span>}</td>
              <td>{new Date(item.sentAt || item.createdAt).toLocaleString()}</td>
              <td>{report ? <><strong>{report.status || item.deliveryStatus}</strong>{report.failureReason && <span className="sms-delivery-error">{report.failureReason}</span>}{report.networkCode && <small>Network: {report.networkCode}</small>}{report.cost && <small>Cost: {report.cost}</small>}{item.deliveryReportedAt && <small>Reported {new Date(item.deliveryReportedAt).toLocaleString()}</small>}</> : item.deliveryStatus === 'pending' ? 'Awaiting provider report' : 'No provider report yet'}</td>
              <td>{item.messageError ? <span className="sms-delivery-error">Cannot send or resend without the original encryption key.</span> : failed ? <button className="text-button" type="button" disabled={resendingId === item.id} onClick={() => void resendSms(item.id)}>{resendingId === item.id ? 'Resending…' : 'Resend SMS'}</button> : '—'}</td>
            </tr>
          })}</tbody></table></div>
          {!search.trim() && history.messages.length < history.total && <button className="text-button sms-load-more" type="button" disabled={loadingHistory} onClick={() => void loadHistory(filter, true)}>{loadingHistory ? 'Loading…' : `Load more (${history.total - history.messages.length} remaining)`}</button>}
          {search.trim() && !history.messages.some((item) => `${item.recipient} ${item.message || ''}`.toLowerCase().includes(search.trim().toLowerCase())) && <p className="tenant-payment-note">No loaded messages match your search.</p>}
        </> : <p className="tenant-payment-note">{loadingHistory ? 'Loading SMS messages…' : 'No SMS messages match this filter yet.'}</p>}
        {settings.deliveryReportUrl && <div className="sms-report-setup"><strong>Delivery-report callback URL</strong><p>Set this callback URL in your Africa’s Talking account to receive delivery confirmations.</p><input readOnly value={settings.deliveryReportUrl} onFocus={(event) => event.currentTarget.select()} aria-label="Africa’s Talking delivery-report callback URL" /></div>}
      </div>
    </section>
  )
}
