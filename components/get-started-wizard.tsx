'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { PaymentSettings } from '@/components/payment-settings'
import { RouterProvisioning } from '@/components/admin-dashboard'

type SetupStep = 0 | 1 | 2 | 3

function slugify(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63).replace(/-$/g, '')
}

export default function GetStartedWizard() {
  const router = useRouter()
  const [step, setStep] = useState<SetupStep>(0)
  const [tenantName, setTenantName] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [portalName, setPortalName] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [paymentConfigured, setPaymentConfigured] = useState(false)
  const [routerConfigured, setRouterConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      fetch('/api/auth/session', { cache: 'no-store' }).then(async (response) => {
        const result = await response.json()
        if (!response.ok || typeof result.tenant?.name !== 'string' || typeof result.tenant?.slug !== 'string') {
          throw new Error(result.error || 'Could not load your ISP account.')
        }
        return result.tenant as { name: string; slug: string }
      }),
      fetch('/api/hotspot/portal-template', { cache: 'no-store' }).then(async (response) => {
        const result = await response.json()
        if (!response.ok || typeof result.companyName !== 'string') throw new Error(result.error || 'Could not load captive portal settings.')
        return result.companyName as string
      }),
    ]).then(([tenant, companyName]) => {
      if (!active) return
      setTenantName(tenant.name)
      setTenantSlug(tenant.slug)
      setPortalName(companyName)
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load your setup details.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/tenants/current', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: tenantName, slug: tenantSlug, portalName }),
      })
      const result = await response.json() as { name?: string; slug?: string; portalName?: string; error?: string }
      if (!response.ok) throw new Error(result.error || 'Could not save your ISP profile.')
      setTenantName(result.name || tenantName)
      setTenantSlug(result.slug || tenantSlug)
      setPortalName(result.portalName || portalName)
      setStep(1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your ISP profile.')
    } finally {
      setSaving(false)
    }
  }

  const steps = ['ISP identity', 'Payments', 'Router', 'Go live']
  if (loading) return <main className="get-started-page"><section className="get-started-shell"><p role="status">Loading your setup...</p></section></main>

  return (
    <main className="get-started-page">
      <section className="get-started-shell">
        <header className="get-started-header">
          <a className="get-started-brand" href="/" aria-label="LKTECH home">LKTECH <span>SETUP</span></a>
          <p>Get your ISP workspace ready for customers.</p>
        </header>
        <ol className="get-started-steps" aria-label="Setup progress">
          {steps.map((label, index) => <li key={label} className={index === step ? 'current' : index < step ? 'complete' : ''}>
            <span>{index < step ? '✓' : index + 1}</span>{label}
          </li>)}
        </ol>

        {error && <p className="get-started-error" role="alert">{error}</p>}

        {step === 0 && <form className="get-started-card" onSubmit={saveProfile}>
          <p className="eyebrow">STEP 1 OF 3</p>
          <h1>Name your ISP</h1>
          <p>These details identify your account and the brand customers see on your captive portal.</p>
          <label>ISP or account name
            <input value={tenantName} minLength={2} maxLength={80} required onChange={(event) => {
              const value = event.target.value
              setTenantName(value)
              if (!slugEdited) setTenantSlug(slugify(value))
            }} />
          </label>
          <label>Captive portal display name
            <input value={portalName} minLength={2} maxLength={48} required onChange={(event) => setPortalName(event.target.value)} />
          </label>
          <label>Workspace address
            <div className="get-started-slug"><span>billing.lktech.life/</span><input value={tenantSlug} maxLength={63} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required onChange={(event) => { setSlugEdited(true); setTenantSlug(event.target.value.toLowerCase()) }} /></div>
          </label>
          <p className="get-started-hint">You can change your portal branding later in Portal design settings.</p>
          <button className="primary-button" disabled={saving}>{saving ? 'Saving ISP profile...' : 'Save and continue'}</button>
        </form>}

        {step === 1 && <section className="get-started-card">
          <p className="eyebrow">STEP 2 OF 3</p>
          <h1>Connect customer payments</h1>
          <p>Configure your organization’s M-Pesa Daraja credentials. They are encrypted and saved to this workspace.</p>
          <PaymentSettings onConfiguredChange={setPaymentConfigured} />
          <div className="get-started-actions">
            <button className="wizard-back" onClick={() => setStep(0)}>Back</button>
            <button className="wizard-next" onClick={() => setStep(2)}>Continue to router setup</button>
          </div>
          {!paymentConfigured && <p className="get-started-hint">You can continue now, but the portal cannot accept paid checkouts until Daraja is configured. You’ll need to finish this before going live.</p>}
        </section>}

        {step === 2 && <section className="get-started-router">
          <RouterProvisioning
            initialSiteName={`${tenantName || 'Main'} Main Site`.slice(0, 64)}
            onExit={() => setStep(1)}
            onProvision={() => { setRouterConfigured(true); setStep(3) }}
          />
        </section>}

        {step === 3 && <section className="get-started-card get-started-complete">
          <p className="eyebrow">SETUP STATUS</p>
          <h1>{paymentConfigured ? 'Your router is live.' : 'Router configured; payments need attention.'}</h1>
          <ul className="get-started-checklist">
            <li className="complete">ISP profile and captive portal name saved</li>
            <li className={paymentConfigured ? 'complete' : 'incomplete'}>{paymentConfigured ? 'M-Pesa Daraja payments configured' : 'M-Pesa Daraja payments not configured'}</li>
            <li className={routerConfigured ? 'complete' : 'incomplete'}>{routerConfigured ? 'RouterOS confirmed service configuration' : 'Router configuration not confirmed'}</li>
          </ul>
          {!paymentConfigured && <p className="get-started-hint">Paid customer checkouts will stay unavailable until payment credentials are saved.</p>}
          <div className="get-started-actions">
            {!paymentConfigured && <button className="wizard-back" onClick={() => setStep(1)}>Finish payment setup</button>}
            <button className="wizard-next" onClick={() => router.push('/')}>Open LKTECH dashboard</button>
          </div>
          <a className="get-started-portal-link" href={`/hotspot?tenant=${encodeURIComponent(tenantSlug)}`} target="_blank" rel="noreferrer">Preview your captive portal</a>
        </section>}
      </section>
    </main>
  )
}
