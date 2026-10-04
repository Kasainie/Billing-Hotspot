'use client'

import { useEffect, useState } from 'react'

type HotspotPlan = {
  id: string
  name: string
  price: number
  durationLabel: string
  speedLabel: string
}

type PppoePlan = {
  id: string
  name: string
  monthlyPrice: number
  durationSeconds: number
  rateLimit: string
}

type ApiError = { error?: string }

export function SubscriptionPlans() {
  const [hotspotPlans, setHotspotPlans] = useState<HotspotPlan[]>([])
  const [pppoePlans, setPppoePlans] = useState<PppoePlan[]>([])
  const [hotspotError, setHotspotError] = useState('')
  const [pppoeError, setPppoeError] = useState('')
  const [hotspotLoading, setHotspotLoading] = useState(true)
  const [pppoeLoading, setPppoeLoading] = useState(true)
  const [tenantQuery, setTenantQuery] = useState('')
  const [captiveLoginUrl, setCaptiveLoginUrl] = useState('')
  const paidHotspotPlans = hotspotPlans.filter((plan) => plan.price > 0)

  useEffect(() => {
    let active = true
    const tenant = new URLSearchParams(window.location.search).get('tenant')
    const tenantQuery = tenant ? `?${new URLSearchParams({ tenant })}` : ''
    setTenantQuery(tenantQuery)
    const returnTarget = new URLSearchParams(window.location.search).get('return')
    if (returnTarget) {
      try {
        const candidate = new URL(returnTarget)
        const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(candidate.hostname)
        const octets = ipv4?.slice(1).map(Number)
        const privateAddress = candidate.hostname === 'localhost' ||
          candidate.hostname.endsWith('.lan') ||
          Boolean(octets && octets.every((octet) => octet <= 255) && (
            octets[0] === 10 ||
            (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
            (octets[0] === 192 && octets[1] === 168) ||
            (octets[0] === 169 && octets[1] === 254)
          ))
        if (candidate.protocol === 'http:' && privateAddress) setCaptiveLoginUrl(candidate.toString())
      } catch {
        setCaptiveLoginUrl('')
      }
    }
    fetch(`/api/hotspot/packages${tenantQuery}`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as HotspotPlan[] | ApiError
        if (!response.ok || !Array.isArray(result)) throw new Error(!Array.isArray(result) ? result.error || 'Unable to load hotspot plans.' : 'Unable to load hotspot plans.')
        if (active) setHotspotPlans(result)
      })
      .catch((error) => { if (active) setHotspotError(error instanceof Error ? error.message : 'Unable to load hotspot plans.') })
      .finally(() => { if (active) setHotspotLoading(false) })

    fetch(`/api/pppoe/packages${tenantQuery}`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as PppoePlan[] | ApiError
        if (!response.ok || !Array.isArray(result)) throw new Error(!Array.isArray(result) ? result.error || 'Unable to load PPPoE plans.' : 'Unable to load PPPoE plans.')
        if (active) setPppoePlans(result)
      })
      .catch((error) => { if (active) setPppoeError(error instanceof Error ? error.message : 'Unable to load PPPoE plans.') })
      .finally(() => { if (active) setPppoeLoading(false) })
    return () => { active = false }
  }, [])

  const choosePlan = (type: 'hotspot' | 'pppoe', packageId: string) => {
    if (type === 'pppoe') {
      window.location.assign(`/pppoe/signup?${new URLSearchParams({ package: packageId, ...(tenantQuery ? { tenant: new URLSearchParams(tenantQuery.slice(1)).get('tenant')! } : {}) })}`)
      return
    }

    const params = new URLSearchParams({ package: packageId })
    if (tenantQuery) params.set('tenant', new URLSearchParams(tenantQuery.slice(1)).get('tenant')!)
    const portalParams = new URLSearchParams(window.location.search)
    for (const key of ['mac', 'phone', 'return']) {
      const value = portalParams.get(key)
      if (value) params.set(key, value)
    }
    window.location.assign(`/hotspot/checkout?${params}`)
  }

  return (
    <main className="subscription-shell">
      <div className="subscription-orb subscription-orb-one" aria-hidden="true" />
      <div className="subscription-orb subscription-orb-two" aria-hidden="true" />
      <div className="subscription-content">
        <header className="subscription-topbar">
          <a className="subscription-brand" href="/"><span className="subscription-brand-mark">L</span><span>LKTECH <small>INTERNET</small></span></a>
          <span className="subscription-secure"><span /> SECURE CHECKOUT</span>
        </header>

        <section className="subscription-hero">
          <p className="subscription-eyebrow"><span /> CONNECT YOUR WAY</p>
          <h1>Good internet.<br /><span>Made simple.</span></h1>
          <p>Pick the connection that fits your day. Fast Wi-Fi on the go, or dependable internet at home.</p>
          <div className="subscription-trust"><span><b>01</b> Choose a plan</span><i /><span><b>02</b> Pay with M-Pesa</span><i /><span><b>03</b> Get connected</span></div>
        </section>

        <div className="subscription-sections">
          <section className="subscription-type subscription-type-hotspot" aria-labelledby="hotspot-plans-heading">
            <div className="subscription-type-heading">
              <span className="subscription-type-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M5 9.5a10.5 10.5 0 0 1 14 0M8 12.5a6 6 0 0 1 8 0M11 15.5a1.5 1.5 0 0 1 2 0M12 19h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </span>
              <div><span className="subscription-type-kicker">ON THE GO</span><h2 id="hotspot-plans-heading">Hotspot Wi-Fi</h2><p>Get online at our Wi-Fi hotspots. Great for browsing, work and streaming.</p></div>
              <span className="subscription-availability">INSTANT ACCESS</span>
            </div>
            {hotspotLoading ? <p className="subscription-state" role="status">Finding your hotspot plans<span className="subscription-loading-dots">...</span></p> : hotspotError ? <p className="subscription-state subscription-state-error" role="alert">{hotspotError}</p> : paidHotspotPlans.length === 0 ? <p className="subscription-state">No paid hotspot plans are available right now. Free hotspot offers can be activated from the Wi-Fi login page.</p> : <div className="subscription-grid">{paidHotspotPlans.map((plan, index) => <article className="subscription-plan subscription-plan-hotspot" key={plan.id}>
              <div className="subscription-plan-top"><span className="subscription-plan-number">WI-FI PLAN {String(index + 1).padStart(2, '0')}</span><span className="subscription-plan-signal"><i /><i /><i /></span></div>
              <h3>{plan.name}</h3>
              <p className="subscription-plan-speed">{plan.speedLabel}</p>
              <div className="subscription-plan-price"><strong>{plan.price.toLocaleString('en-KE')}</strong><span>KSh <small>/ plan</small></span></div>
              <div className="subscription-plan-duration"><span>PACKAGE VALIDITY</span><strong>{plan.durationLabel.replace(/^Valid for /, '')}</strong></div>
              <button type="button" className="subscription-plan-button" onClick={() => choosePlan('hotspot', plan.id)}>Choose hotspot <span aria-hidden="true">↗</span></button>
            </article>)}</div>}
          </section>

          <section className="subscription-type subscription-type-pppoe" aria-labelledby="pppoe-plans-heading">
            <div className="subscription-type-heading">
              <span className="subscription-type-icon pppoe-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M3 10.5 12 4l9 6.5M5.5 9.5V20h13V9.5M9 20v-6h6v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <div><span className="subscription-type-kicker">AT HOME</span><h2 id="pppoe-plans-heading">Home internet</h2><p>A dedicated PPPoE connection for your home. Reliable, all-day internet.</p></div>
              <span className="subscription-availability subscription-availability-home">YOUR OWN CONNECTION</span>
            </div>
            {pppoeLoading ? <p className="subscription-state" role="status">Finding your home plans<span className="subscription-loading-dots">...</span></p> : pppoeError ? <p className="subscription-state subscription-state-error" role="alert">{pppoeError}</p> : pppoePlans.length === 0 ? <p className="subscription-state">No home plans are available right now.</p> : <div className="subscription-grid">{pppoePlans.map((plan, index) => <article className="subscription-plan subscription-plan-pppoe" key={plan.id}>
              <div className="subscription-plan-top"><span className="subscription-plan-number">HOME PLAN {String(index + 1).padStart(2, '0')}</span><span className="subscription-home-glyph" aria-hidden="true">⌂</span></div>
              <h3>{plan.name}</h3>
              <p className="subscription-plan-speed">{plan.rateLimit} speed</p>
              <div className="subscription-plan-price"><strong>{plan.monthlyPrice.toLocaleString('en-KE')}</strong><span>KSh <small>/ plan</small></span></div>
              <div className="subscription-plan-duration"><span>PACKAGE VALIDITY</span><strong>{Math.ceil(plan.durationSeconds / 86400)} days</strong></div>
              <button type="button" className="subscription-plan-button" onClick={() => choosePlan('pppoe', plan.id)}>Choose home plan <span aria-hidden="true">↗</span></button>
            </article>)}</div>}
          </section>
        </div>

        <footer className="subscription-footer">
          <p><span className="subscription-lock" aria-hidden="true">✓</span><span><strong>Safe, simple M-Pesa payments</strong><small>Your PIN is entered only in Safaricom&apos;s official prompt. Never on this page.</small></span></p>
          <div className="subscription-footer-links">
            {captiveLoginUrl && <a href={captiveLoginUrl}>Have a voucher? <strong>Open Wi-Fi sign in</strong> <span aria-hidden="true">→</span></a>}
            <a href={`/hotspot/reconnect${tenantQuery}`}>Lost your login? <strong>Find it with M-Pesa</strong> <span aria-hidden="true">→</span></a>
          </div>
        </footer>
      </div>
    </main>
  )
}
