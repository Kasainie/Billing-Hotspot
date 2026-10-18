'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { BrandWordmark } from '@/components/brand-wordmark'
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
  const [accountName, setAccountName] = useState('')
  const [accountEmail, setAccountEmail] = useState('')
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
        if (!response.ok || typeof result.user?.name !== 'string' || typeof result.user?.email !== 'string' ||
            typeof result.tenant?.name !== 'string' || typeof result.tenant?.slug !== 'string') {
          throw new Error(result.error || 'Could not load your ISP account.')
        }
        return {
          user: result.user as { name: string; email: string },
          tenant: result.tenant as { name: string; slug: string },
        }
      }),
      fetch('/api/hotspot/portal-template', { cache: 'no-store' }).then(async (response) => {
        const result = await response.json()
        if (!response.ok || typeof result.companyName !== 'string') throw new Error(result.error || 'Could not load captive portal settings.')
        return result.companyName as string
      }),
    ]).then(([{ user, tenant }, companyName]) => {
      if (!active) return
      setAccountName(user.name)
      setAccountEmail(user.email)
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

  const steps = ['Account & ISP', 'Payments', 'Site & router', 'Complete']
  if (loading) return <main className="get-started-page"><section className="get-started-shell"><p role="status">Loading your setup...</p></section></main>

  return (
    <main className="get-started-page">
      <section className="get-started-shell">
        <header className="get-started-header">
          <a className="get-started-brand" href="/" aria-label="LKTECH home"><BrandWordmark primary="LKTECH" accent="SETUP" /></a>
          <p>Follow each step to set up your account, customer site, payments, and router.</p>
        </header>
        <ol className="get-started-steps" aria-label="Setup progress">
          {steps.map((label, index) => <li key={label} className={index === step ? 'current' : index < step ? 'complete' : ''}>
            <span>{index < step ? '✓' : index + 1}</span>{label}
          </li>)}
        </ol>

        {error && <p className="get-started-error" role="alert">{error}</p>}

        {step === 0 && <form className="get-started-card" onSubmit={saveProfile}>
          <p className="eyebrow">STEP 1 OF 4 · ACCOUNT & ISP</p>
          <h1>Set up your account and ISP</h1>
          <p>Your account is ready. Confirm the ISP workspace and customer-facing portal identity before setting up your first site.</p>
          <div className="get-started-account-summary">
            <span>OWNER ACCOUNT</span>
            <strong>{accountName}</strong>
            <small>{accountEmail}</small>
          </div>
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

        <section className="get-started-card" hidden={step !== 1}>
          <p className="eyebrow">STEP 2 OF 4 · PAYMENTS</p>
          <h1>Connect customer payments</h1>
          <p>Configure M-Pesa Daraja for this workspace. You can finish this now or continue and return before accepting paid customer checkouts.</p>
          <PaymentSettings onConfiguredChange={setPaymentConfigured} />
          <div className="get-started-actions">
            <button className="wizard-back" onClick={() => setStep(0)}>Back</button>
            <button className="wizard-next" onClick={() => setStep(2)}>Continue to site setup</button>
          </div>
          {!paymentConfigured && <p className="get-started-hint">Payment setup is still incomplete. You can configure it later in Billing → Payment settings, but paid checkouts will remain unavailable until then.</p>}
        </section>

        {step === 2 && <section className="get-started-router">
          <div className="get-started-router-intro">
            <p className="eyebrow">STEP 3 OF 4 · SITE & ROUTER</p>
            <h1>Create your first site and configure its MikroTik router</h1>
            <p>Choose a site name, then follow the guided RouterOS steps to provision the router and confirm its services.</p>
          </div>
          <RouterProvisioning
            initialSiteName={`${tenantName || 'Main'} Main Site`.slice(0, 64)}
            exitLabel="Back to payments"
            provisionedLabel="Continue"
            onExit={() => setStep(1)}
            onProvision={() => { setRouterConfigured(true); setStep(3) }}
          />
        </section>}

        {step === 3 && <section className="get-started-card get-started-complete">
          <p className="eyebrow">STEP 4 OF 4 · SETUP SUMMARY</p>
          <h1>{paymentConfigured ? 'Your account and site are ready.' : 'Your site is ready; finish payment setup when ready.'}</h1>
          <ul className="get-started-checklist">
            <li className="complete">Owner account created and ISP workspace branded</li>
            <li className={routerConfigured ? 'complete' : 'incomplete'}>{routerConfigured ? 'First site created and RouterOS services confirmed' : 'Site and router setup not confirmed'}</li>
            <li className={paymentConfigured ? 'complete' : 'incomplete'}>{paymentConfigured ? 'M-Pesa Daraja payments configured' : 'M-Pesa Daraja payments still need setup'}</li>
          </ul>
          {!paymentConfigured && <p className="get-started-hint">You can still manage your workspace and use non-paid services. Paid customer checkouts will remain unavailable until Daraja credentials are saved.</p>}
          <div className="get-started-actions">
            {!paymentConfigured && <button className="wizard-back" onClick={() => setStep(1)}>Finish payment setup</button>}
            <button className="wizard-next" onClick={() => router.push('/')}>Open your dashboard</button>
          </div>
          <a className="get-started-portal-link" href={`/hotspot/login?tenant=${encodeURIComponent(tenantSlug)}`} target="_blank" rel="noreferrer">Preview your captive portal</a>
        </section>}
      </section>
    </main>
  )
}
