'use client'

import { useEffect, useState } from 'react'

type DarajaSettings = {
  environment: string
  shortcode: string
  callbackUrl: string
  configured: boolean
  c2bUrls?: { validationUrl: string; confirmationUrl: string }
}

export function PaymentSettings({ onConfiguredChange }: { onConfiguredChange?: (configured: boolean) => void }) {
  const [settings, setSettings] = useState<DarajaSettings>({ environment: 'sandbox', shortcode: '', callbackUrl: '', configured: false })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [c2bUrls, setC2bUrls] = useState({ validationUrl: '', confirmationUrl: '' })

  useEffect(() => {
    fetch('/api/tenant/payment-settings', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as DarajaSettings & { error?: string }
        if (!response.ok) throw new Error(result.error || 'Unable to load payment settings.')
        setSettings(result)
        setC2bUrls(result.c2bUrls || { validationUrl: '', confirmationUrl: '' })
        onConfiguredChange?.(result.configured)
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load payment settings.'))
  }, [])

  async function save(formData: FormData) {
    setSaving(true)
    setError('')
    setMessage('')
    const payload = Object.fromEntries(formData.entries())
    try {
      const response = await fetch('/api/tenant/payment-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json() as DarajaSettings & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to save payment settings.')
      setSettings(result)
      onConfiguredChange?.(result.configured)
      setMessage('Workspace payment credentials saved securely.')
      const form = document.getElementById('tenant-payment-form')
      if (form instanceof HTMLFormElement) form.reset()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save payment settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="module-panel payment-settings-panel">
      <div className="module-heading"><div><p className="eyebrow">WORKSPACE SETTINGS</p><h2>M-Pesa / Daraja</h2></div><span className={`availability-tag ${settings.configured ? 'availability-live' : 'availability-off'}`}>{settings.configured ? 'Configured' : 'Not configured'}</span></div>
      <p>These credentials belong to this workspace only. Secrets are encrypted before they are stored, and never shown again after saving.</p>
      <form id="tenant-payment-form" action={save} className="tenant-payment-form">
        <label>Daraja environment<select name="environment" value={settings.environment} onChange={(event) => setSettings((current) => ({ ...current, environment: event.target.value }))}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></label>
        <label>Business shortcode<input name="shortcode" inputMode="numeric" pattern="[0-9]{5,7}" maxLength={7} value={settings.shortcode} onChange={(event) => setSettings((current) => ({ ...current, shortcode: event.target.value }))} required /></label>
        <label>Consumer key<input name="consumerKey" autoComplete="off" required /></label>
        <label>Consumer secret<input name="consumerSecret" type="password" autoComplete="new-password" required /></label>
        <label>Passkey<input name="passkey" type="password" autoComplete="new-password" required /></label>
        <label>HTTPS callback URL<input name="callbackUrl" type="url" placeholder="https://billing.example.com/api/hotspot/daraja/callback" value={settings.callbackUrl} onChange={(event) => setSettings((current) => ({ ...current, callbackUrl: event.target.value }))} required /></label>
        <p className="tenant-payment-note">Use the callback URL above for STK Push. For direct PayBill transfers, configure these workspace-specific Daraja C2B URLs in the Safaricom portal:</p>
        {c2bUrls.validationUrl && <div className="tenant-payment-callbacks"><label>Validation URL<input readOnly value={c2bUrls.validationUrl} onFocus={(event) => event.currentTarget.select()} /></label><label>Confirmation URL<input readOnly value={c2bUrls.confirmationUrl} onFocus={(event) => event.currentTarget.select()} /></label></div>}
        {!c2bUrls.validationUrl && <p className="tenant-payment-note">Set server-only <code>C2B_CALLBACK_SECRET</code> to a random URL-safe secret of at least 32 characters to generate protected C2B URLs. Set <code>TENANT_SECRETS_ENCRYPTION_KEY</code> before saving credentials.</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="tenant-payment-success" role="status">{message}</p>}
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save workspace credentials'}</button>
      </form>
    </section>
  )
}
