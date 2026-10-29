'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { KENYAN_MOBILE_PHONE_PATTERN } from '@/lib/kenyan-phone'

type SmsMessage = {
  id: string
  recipient: string
  channel: 'sms' | 'whatsapp'
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
  baseUrl: string
  smsSender: string
  whatsappSender: string
  configured: boolean
  whatsappConfigured: boolean
  statusCallbackUrl: string
}

const emptySettings: SmsSettings = {
  baseUrl: '',
  smsSender: '',
  whatsappSender: '',
  configured: false,
  whatsappConfigured: false,
  statusCallbackUrl: '',
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
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms')
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
        signal: AbortSignal.timeout(30_000),
      })
      const result = await response.json() as SmsSettings & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to save SMS settings.')
      setSettings((current) => ({ ...current, ...result, configured: true }))
      setMessage('Infobip credentials saved securely.')
      const apiKey = document.querySelector<HTMLInputElement>('#tenant-sms-form input[name="apiKey"]')
      if (apiKey) apiKey.value = ''
    } catch (reason) {
      setError(reason instanceof DOMException && (reason.name === 'TimeoutError' || reason.name === 'AbortError')
        ? 'Saving timed out before the server confirmed the result. Refresh settings before trying again.'
        : reason instanceof Error ? reason.message : 'Unable to save SMS settings.')
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
        body: JSON.stringify({ phone: recipient, message: draft, channel }),
      })
      const result = await response.json() as { message?: string; error?: string }
      if (!response.ok) throw new Error(result.error || `Unable to send this ${channel === 'whatsapp' ? 'WhatsApp message' : 'SMS'}.`)
      setMessage(result.message || `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} message submitted.`)
      setRecipient('')
      setDraft('')
      setChannel('sms')
      setComposeOpen(false)
      setFilter('all')
      await loadHistory('all')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Unable to send this ${channel === 'whatsapp' ? 'WhatsApp message' : 'SMS'}.`)
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
      <div className="module-heading"><div><p className="eyebrow">COMMUNICATIONS</p><h2>Infobip messaging</h2></div><span className={`availability-tag ${settings.configured ? 'availability-live' : 'availability-off'}`}>{settings.configured ? 'SMS configured' : 'SMS not configured'}</span></div>
      <p>Configure Infobip for SMS and optional WhatsApp messaging. The API key is encrypted before storage and never shown again.</p>
      <form id="tenant-sms-form" className="tenant-payment-form" onSubmit={(event) => {
        event.preventDefault()
        void save(new FormData(event.currentTarget))
      }}>
        <label>Infobip Base URL<input name="baseUrl" autoComplete="url" value={settings.baseUrl} onChange={(event) => setSettings((current) => ({ ...current, baseUrl: event.target.value }))} required maxLength={253} placeholder="xxxxx.api.infobip.com" /></label>
        <label>Infobip API key<input name="apiKey" type="password" autoComplete="new-password" minLength={8} maxLength={512} /><small>Required for first-time setup. Leave blank to keep the saved key.</small></label>
        <label>SMS sender ID<input name="smsSender" autoComplete="off" value={settings.smsSender} onChange={(event) => setSettings((current) => ({ ...current, smsSender: event.target.value }))} required maxLength={30} placeholder="Your approved sender ID" /></label>
        <label>WhatsApp sender number (optional)<input name="whatsappSender" autoComplete="off" value={settings.whatsappSender} onChange={(event) => setSettings((current) => ({ ...current, whatsappSender: event.target.value }))} maxLength={16} placeholder="+254712345678" pattern="[+][1-9][0-9]{7,14}" /></label>
        <p className="tenant-payment-note">Use the Base URL and API key from your Infobip account, plus a sender ID enabled for SMS. Add your registered WhatsApp sender number to enable WhatsApp in the message composer. WhatsApp free-form messages require an open 24-hour customer service window; outside it, use an approved WhatsApp template. Set the server-side APP_URL to enable delivery callbacks.</p>
        {settings.statusCallbackUrl && <p className="tenant-payment-note">Infobip delivery callback: <code>{settings.statusCallbackUrl}</code></p>}
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
        <div><span>NEW MESSAGE</span><h3>Compose a message</h3><p>Send one message to a Kenyan mobile number. Delivery status will appear in the outbox.</p></div>
        <label>Channel<select value={channel} onChange={(event) => setChannel(event.target.value === 'whatsapp' ? 'whatsapp' : 'sms')}><option value="sms">SMS</option><option value="whatsapp" disabled={!settings.whatsappConfigured}>WhatsApp{settings.whatsappConfigured ? '' : ' (configure sender first)'}</option></select></label>
        <label>Recipient phone number<input required type="tel" inputMode="tel" autoComplete="tel" pattern={KENYAN_MOBILE_PHONE_PATTERN} maxLength={13} placeholder="0712345678 or +254712345678" title="Use 07 followed by 8 digits or +254 followed by 9 digits." value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label>
        <label>Message<textarea required maxLength={1000} rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type your message…" /></label>
        {channel === 'whatsapp' && <p className="tenant-payment-note">WhatsApp free-form messages can be sent only during the 24-hour customer service window after the recipient messages you. Outside that window, an approved WhatsApp template is required.</p>}
        <div className="communications-compose-actions"><small>{draft.length}/1000 characters. Charges are set by Infobip.</small><button type="submit" className="primary-button" disabled={sending || !recipient.trim() || !draft.trim() || (channel === 'whatsapp' && !settings.whatsappConfigured)}>{sending ? 'Sending…' : `Send ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}</button></div>
      </form>}
      {settings.configured && <div className="sms-test-panel">
        <h3>Send a test message</h3>
        <div className="sms-test-controls"><label htmlFor="sms-test-phone">Kenyan mobile number</label><input id="sms-test-phone" type="tel" value={testPhone} onChange={(event) => setTestPhone(event.target.value)} placeholder="0712345678 or +254712345678" title="Enter 07 followed by 8 digits or +254 followed by 9 digits." pattern={KENYAN_MOBILE_PHONE_PATTERN} maxLength={13} inputMode="tel" /><button className="text-button" type="button" disabled={testing || !testPhone.trim()} onClick={() => void sendTest()}>{testing ? 'Sending…' : 'Send test SMS'}</button></div>
      </div>}
      <div className="sms-deliveries">
        <div className="sms-deliveries-heading"><div><h3>Message delivery reports</h3><p>Automatic notices and messages sent from subscriber accounts.</p></div><button className="text-button" type="button" disabled={loadingHistory} onClick={() => void Promise.all([loadSettings(), loadHistory(filter)])}>{loadingHistory ? 'Refreshing…' : 'Refresh reports'}</button></div>
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
              <td><strong>{item.recipient} · {item.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</strong><span className="sms-message-preview">{item.message ?? 'Message text unavailable: encryption key differs from the key used when this message was stored.'}</span>{item.messageError && <span className="sms-delivery-error">{item.messageError}</span>}{item.resendOfId && <small>Resent message</small>}</td>
              <td><span className={`sms-status-badge sms-status-${messageStatus(item).toLowerCase().replace(/\s+/g, '-')}`}>{messageStatus(item)}</span>{item.lastError && <span className="sms-delivery-error">{item.lastError}</span>}</td>
              <td>{new Date(item.sentAt || item.createdAt).toLocaleString()}</td>
              <td>{report ? <><strong>{report.status || item.deliveryStatus}</strong>{report.errorMessage && <span className="sms-delivery-error">{report.errorMessage}</span>}{report.errorCode && <small>Infobip error code: {report.errorCode}</small>}{item.deliveryReportedAt && <small>Reported {new Date(item.deliveryReportedAt).toLocaleString()}</small>}</> : item.deliveryStatus === 'pending' ? 'Awaiting provider report' : 'No provider report yet'}</td>
              <td>{item.messageError ? <span className="sms-delivery-error">Cannot send or resend without the original encryption key.</span> : failed ? <button className="text-button" type="button" disabled={resendingId === item.id} onClick={() => void resendSms(item.id)}>{resendingId === item.id ? 'Resending…' : `Resend ${item.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}</button> : '—'}</td>
            </tr>
          })}</tbody></table></div>
          {!search.trim() && history.messages.length < history.total && <button className="text-button sms-load-more" type="button" disabled={loadingHistory} onClick={() => void loadHistory(filter, true)}>{loadingHistory ? 'Loading…' : `Load more (${history.total - history.messages.length} remaining)`}</button>}
          {search.trim() && !history.messages.some((item) => `${item.recipient} ${item.message || ''}`.toLowerCase().includes(search.trim().toLowerCase())) && <p className="tenant-payment-note">No loaded messages match your search.</p>}
        </> : <p className="tenant-payment-note">{loadingHistory ? 'Loading SMS messages…' : 'No SMS messages match this filter yet.'}</p>}
        {settings.statusCallbackUrl && <div className="sms-report-setup"><strong>Infobip delivery callback URL</strong><p>The app sends this secured callback URL with each outbound message to update delivery status.</p><input readOnly value={settings.statusCallbackUrl} onFocus={(event) => event.currentTarget.select()} aria-label="Infobip delivery callback URL" /></div>}
      </div>
    </section>
  )
}
