'use client'

import { useEffect, useState } from 'react'
import { paymentGatewayDefinitions, paymentGatewayProviders, type PaymentGatewayEnvironment, type PaymentGatewayProvider } from '@/lib/payment-gateways'

type GatewayStatus = {
  provider: PaymentGatewayProvider
  name: string
  environment: PaymentGatewayEnvironment
  enabled: boolean
  configuredSecrets: string[]
  requiredSecrets: string[]
}

const providerHelp: Record<PaymentGatewayProvider, string> = {
  'airtel-money': 'Airtel Money is deferred until its merchant API contract can be verified. No credentials or payments are accepted yet.',
  pesapal: 'Create a merchant application in the Pesapal developer portal. Use sandbox credentials for testing and production credentials after merchant approval.',
  intasend: 'Use IntaSend test keys first. Register the webhook endpoint shown in your browser origin at /api/payment-gateways/intasend/webhook and enter the same challenge secret below.',
}

export function AdditionalPaymentGateways() {
  const [appOrigin, setAppOrigin] = useState('')
  const [gateways, setGateways] = useState<GatewayStatus[]>([])
  const [secrets, setSecrets] = useState<Record<PaymentGatewayProvider, Record<string, string>>>(() => ({
    'airtel-money': {},
    pesapal: { consumerKey: '', consumerSecret: '' },
    intasend: { publishableKey: '', secretKey: '' },
  }))
  const [loading, setLoading] = useState(true)
  const [savingProvider, setSavingProvider] = useState<PaymentGatewayProvider | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setAppOrigin(window.location.origin)
    let active = true
    fetch('/api/tenant/payment-gateways', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as { gateways?: GatewayStatus[]; error?: string }
        if (!response.ok || !result.gateways) throw new Error(result.error || 'Unable to load gateway settings.')
        if (active) setGateways(result.gateways)
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load gateway settings.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const updateGateway = (provider: PaymentGatewayProvider, changes: Partial<GatewayStatus>) => {
    setGateways((current) => current.map((gateway) => gateway.provider === provider ? { ...gateway, ...changes } : gateway))
  }

  const saveGateway = async (provider: PaymentGatewayProvider) => {
    const gateway = gateways.find((item) => item.provider === provider)
    if (!gateway) return
    setSavingProvider(provider)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/tenant/payment-gateways', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          environment: gateway.environment,
          enabled: gateway.enabled,
          secrets: secrets[provider],
        }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to save gateway settings.')
      setGateways((current) => current.map((item) => item.provider === provider
        ? { ...item, configuredSecrets: item.requiredSecrets }
        : item))
      setSecrets((current) => ({
        ...current,
        [provider]: Object.fromEntries(Object.keys(current[provider]).map((key) => [key, ''])),
      }))
      setNotice(`${gateway.name} settings saved securely for this workspace.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save gateway settings.')
    } finally {
      setSavingProvider(null)
    }
  }

  return (
    <section className="module-panel payment-settings-panel additional-gateways-panel">
      <div className="module-heading">
        <div><p className="eyebrow">MORE PAYMENT METHODS</p><h2>Kenya gateways</h2></div>
        <span className="availability-tag availability-off">Setup required</span>
      </div>
      <p>Connect each provider using the merchant account owned by this workspace. Credentials are encrypted at rest and never shown again after saving. Use sandbox keys before enabling live payments.</p>
      {loading ? <p role="status">Loading gateway settings…</p> : <div className="additional-gateway-list">
        {paymentGatewayProviders.map((provider) => {
          const gateway = gateways.find((item) => item.provider === provider)
          const definition = paymentGatewayDefinitions[provider]
          const configuredSecrets = gateway?.configuredSecrets || []
          const configured = Boolean(gateway && gateway.requiredSecrets.every((key) => configuredSecrets.includes(key)))
          return <article className="additional-gateway-card" key={provider}>
            <div className="additional-gateway-heading">
              <div><h3>{definition.name}</h3><p>{providerHelp[provider]}</p></div>
              <span className={`availability-tag ${configured ? 'availability-live' : 'availability-off'}`}>{!definition.available ? 'Integration pending' : configured ? 'Configured' : 'Not configured'}</span>
            </div>
              {provider === 'intasend' && <label>IntaSend webhook URL
                <input readOnly value={appOrigin ? `${appOrigin}/api/payment-gateways/intasend/webhook` : ''} />
              </label>}
              {definition.available && <label>Environment
              <select value={gateway?.environment || 'sandbox'} onChange={(event) => updateGateway(provider, { environment: event.target.value as PaymentGatewayEnvironment })}>
                <option value="sandbox">Sandbox / test</option>
                <option value="production">Production / live</option>
              </select>
              </label>}
              {definition.available && definition.secretFields.map(({ key, label }) => <label key={key}>{label}
              <input
                type="password"
                autoComplete="new-password"
                minLength={key === 'webhookChallenge' ? 32 : undefined}
                value={secrets[provider][key] || ''}
                placeholder={configured && configuredSecrets.includes(key) ? 'Saved securely — leave blank to keep' : ''}
                onChange={(event) => setSecrets((current) => ({
                  ...current,
                  [provider]: { ...current[provider], [key]: event.target.value },
                }))}
              />
            </label>)}
            {definition.available && <label className="additional-gateway-toggle">
              <span>Enable for customer checkout</span>
              <input type="checkbox" checked={gateway?.enabled || false} onChange={(event) => updateGateway(provider, { enabled: event.target.checked })} />
            </label>}
            {definition.available && <button className="primary-button" type="button" disabled={savingProvider !== null} onClick={() => void saveGateway(provider)}>
              {savingProvider === provider ? 'Saving…' : 'Save gateway'}
            </button>}
          </article>
        })}
      </div>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="tenant-payment-success" role="status">{notice}</p>}
    </section>
  )
}
