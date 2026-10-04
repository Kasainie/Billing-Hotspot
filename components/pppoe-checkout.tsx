'use client'

import { useEffect, useState } from 'react'

type PppoePackage = {
  id: string
  name: string
  rateLimit: string
  monthlyPrice: number
  durationSeconds: number
}

type PaymentStatus = {
  status: string
  productName?: string
  failureReason?: string | null
  accountNumber?: string
  username?: string | null
  password?: string | null
  receipt?: string | null
  error?: string
}

export function PppoeCheckout() {
  const [packages, setPackages] = useState<PppoePackage[]>([])
  const [packageId, setPackageId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [paymentId, setPaymentId] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [status, setStatus] = useState<'idle' | 'starting' | 'pending' | 'complete' | 'failed'>('idle')
  const [message, setMessage] = useState('')
  const [credentials, setCredentials] = useState<{ username: string; password: string; accountNumber: string; receipt?: string | null } | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [tenantQuery, setTenantQuery] = useState('')

  useEffect(() => {
    let active = true
    const tenant = new URLSearchParams(window.location.search).get('tenant')
    const tenantQuery = tenant ? `?${new URLSearchParams({ tenant })}` : ''
    setTenantQuery(tenantQuery)
    fetch(`/api/pppoe/packages${tenantQuery}`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as PppoePackage[] | { error?: string }
        if (!response.ok || !Array.isArray(result)) throw new Error(!Array.isArray(result) ? result.error || 'Unable to load packages.' : 'Unable to load packages.')
        if (active) {
          setPackages(result)
          const requestedPackage = new URLSearchParams(window.location.search).get('package')
          setPackageId(result.some((plan) => plan.id === requestedPackage) ? requestedPackage! : result[0]?.id || '')
        }
      })
      .catch((error) => { if (active) setCatalogError(error instanceof Error ? error.message : 'Unable to load packages.') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (status !== 'pending' || !paymentId) return
    let active = true
    let timer: number
    const poll = async () => {
      try {
        const response = await fetch(`/api/pppoe/payments/${encodeURIComponent(paymentId)}${tenantQuery}`, { cache: 'no-store' })
        const result = await response.json() as PaymentStatus
        if (!active) return
        if (!response.ok) throw new Error(result.error || 'Unable to check payment.')
        if (result.status === 'completed') {
          if (result.username && result.password && result.accountNumber) {
            setCredentials({ username: result.username, password: result.password, accountNumber: result.accountNumber, receipt: result.receipt })
            setStatus('complete')
            setMessage('Payment received. Your PPPoE account is ready.')
          } else {
            setStatus('failed')
            setMessage('Payment was confirmed, but we could not retrieve your PPPoE login. Contact customer care with your M-Pesa receipt.')
          }
        } else if (result.status === 'failed') {
          setStatus('failed')
          setMessage(result.failureReason || 'Payment was not completed. Your account number is still reserved.')
        } else {
          timer = window.setTimeout(poll, 3000)
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : 'Unable to check payment status.')
          timer = window.setTimeout(poll, 5000)
        }
      }
    }
    timer = window.setTimeout(poll, 1500)
    return () => { active = false; window.clearTimeout(timer) }
  }, [paymentId, status, tenantQuery])

  const startPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!packages.some((plan) => plan.id === packageId)) {
      setStatus('failed')
      setMessage('Choose an available PPPoE package.')
      return
    }
    setStatus('starting')
    setMessage('Sending a secure payment request to your phone...')
    try {
      const response = await fetch(`/api/pppoe/payments${tenantQuery}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, phone, packageId }),
      })
      const result = await response.json() as { id?: string; accountNumber?: string; message?: string; error?: string }
      if (!response.ok || !result.id || !result.accountNumber) throw new Error(result.error || 'Unable to start M-Pesa payment.')
      setPaymentId(result.id)
      setAccountNumber(result.accountNumber)
      setStatus('pending')
      setMessage(result.message || 'Check your phone and approve the M-Pesa prompt.')
    } catch (error) {
      setStatus('failed')
      setMessage(error instanceof Error ? error.message : 'Unable to start M-Pesa payment.')
    }
  }

  const selectedPackage = packages.find((plan) => plan.id === packageId)

  return (
    <main className="checkout-shell">
      <section className="checkout-panel">
        <a className="checkout-brand" href={`/subscribe${tenantQuery}`}><span className="checkout-mark">L</span><span>LKTECH <small className="checkout-brand-subtitle">HOME INTERNET</small></span></a>
        {credentials ? <>
          <div className="checkout-success-mark" aria-hidden="true">✓</div>
          <p className="checkout-eyebrow success-eyebrow">PAYMENT CONFIRMED</p>
          <h1>Your PPPoE account is ready.</h1>
          <p className="checkout-copy">{message}</p>
          <div className="credential-box">
            <div><span>M-Pesa PayBill account</span><strong>{credentials.accountNumber}</strong></div>
            <div><span>PPPoE username</span><strong>{credentials.username}</strong></div>
            <div><span>Password</span><strong>{credentials.password}</strong></div>
            {credentials.receipt && <div><span>M-Pesa receipt</span><strong>{credentials.receipt}</strong></div>}
          </div>
          <p className="checkout-hint">Use the PayBill account number for future payments. Enter the PPPoE username and password in your router. Keep them private.</p>
        </> : <>
          <p className="checkout-eyebrow">PPPoE ACCOUNT SIGNUP</p>
          <h1>Get connected at home.</h1>
          <p className="checkout-copy">Choose a PPPoE plan and pay securely with M-Pesa. Your PPPoE login is created after payment is confirmed.</p>
          <div className="checkout-steps" aria-label="Signup steps"><span className="checkout-step-active"><b>1</b> Your details</span><i /><span><b>2</b> M-Pesa payment</span><i /><span><b>3</b> Get connected</span></div>
          {catalogError && <p className="checkout-message is-error" role="alert">{catalogError}</p>}
          {!catalogError && packages.length === 0 && <p className="checkout-message" role="status">There are no live PPPoE packages available right now. Contact customer care.</p>}
          {selectedPackage && <div className="selected-package"><span className="selected-package-label">YOUR HOME PLAN</span><span className="selected-package-name">{selectedPackage.name}</span><strong>KSh {selectedPackage.monthlyPrice.toLocaleString('en-KE')}</strong><small>{selectedPackage.rateLimit} speed <i /> {Math.ceil(selectedPackage.durationSeconds / 86400)} days</small></div>}
          <form className="checkout-form" onSubmit={startPayment}>
            <label>Full name<input autoComplete="name" minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} required disabled={status === 'pending'} /></label>
            <label>Email address<input type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} required disabled={status === 'pending'} /></label>
            <label>M-Pesa phone number<input type="tel" inputMode="tel" autoComplete="tel" placeholder="07XX XXX XXX" value={phone} onChange={(event) => setPhone(event.target.value)} required disabled={status === 'pending'} /></label>
            {packages.length > 1 && <label>Change package<select value={packageId} onChange={(event) => setPackageId(event.target.value)} required disabled={status === 'pending'}>{packages.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — KSh {plan.monthlyPrice.toLocaleString('en-KE')}</option>)}</select></label>}
            <button className="checkout-submit" type="submit" disabled={status === 'starting' || status === 'pending' || !selectedPackage || Boolean(catalogError)}>{status === 'pending' ? 'Waiting for M-Pesa approval...' : 'Pay with M-Pesa'}</button>
          </form>
          {accountNumber && status === 'pending' && <p className="checkout-message" role="status">Your PPPoE PayBill account number is <strong>{accountNumber}</strong>. Save it for future payments.</p>}
          {message && <p className={`checkout-message ${status === 'failed' ? 'is-error' : ''}`} role="status">{message}</p>}
          {status === 'failed' && <button className="checkout-retry" type="button" onClick={() => { setStatus('idle'); setMessage('') }}>Try payment again</button>}
          <p className="checkout-hint">M-Pesa PINs are entered only in the Safaricom prompt. This page never asks for your PIN.</p>
          <a className="checkout-plans-link" href={`/subscribe${tenantQuery}`}>← Browse all internet plans</a>
        </>}
      </section>
    </main>
  )
}
