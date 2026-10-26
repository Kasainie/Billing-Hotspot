'use client'

import { useEffect, useState } from 'react'
import { BrandWordmark } from '@/components/brand-wordmark'
import { KENYAN_MOBILE_PHONE_PATTERN } from '@/lib/kenyan-phone'

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

type PaymentMethod = { provider: string; name: string }

export function PppoeCheckout() {
  const [packages, setPackages] = useState<PppoePackage[]>([])
  const [packageId, setPackageId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [paymentId, setPaymentId] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountNumberCopied, setAccountNumberCopied] = useState(false)
  const [status, setStatus] = useState<'idle' | 'starting' | 'pending' | 'complete' | 'failed'>('idle')
  const [message, setMessage] = useState('')
  const [credentials, setCredentials] = useState<{ username: string; password: string; accountNumber: string; receipt?: string | null } | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [tenantQuery, setTenantQuery] = useState('')
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false)
  const [paymentProvider, setPaymentProvider] = useState('')
  const [hostedCheckoutUrl, setHostedCheckoutUrl] = useState('')

  useEffect(() => {
    let active = true
    const tenant = new URLSearchParams(window.location.search).get('tenant')
    const tenantQuery = tenant ? `?${new URLSearchParams({ tenant })}` : ''
    setTenantQuery(tenantQuery)
    const pendingPayment = new URLSearchParams(window.location.search).get('payment')
    if (pendingPayment && /^[0-9a-f-]{36}$/i.test(pendingPayment)) {
      setPaymentId(pendingPayment)
      setStatus('pending')
      setMessage('Confirming your payment with the provider. Keep this page open.')
    }
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
    let active = true
    fetch(`/api/payment-methods${tenantQuery}`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as { methods?: PaymentMethod[]; error?: string }
        if (!response.ok || !Array.isArray(result.methods)) throw new Error(result.error || 'Unable to load payment methods.')
        if (active) {
          setPaymentMethods(result.methods)
          setPaymentProvider(result.methods[0]?.provider || '')
          setPaymentMethodsLoaded(true)
        }
      })
      .catch((error) => {
        if (active) {
          setCatalogError(error instanceof Error ? error.message : 'Unable to load payment methods.')
          setPaymentMethodsLoaded(true)
        }
      })
    return () => { active = false }
  }, [tenantQuery])

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
    setHostedCheckoutUrl('')
    const selectedMethod = paymentMethods.find((item) => item.provider === paymentProvider)
    setMessage(paymentProvider === 'daraja' ? 'Sending a secure payment request to your phone...' : `Starting secure ${selectedMethod?.name || 'payment'} checkout...`)
    try {
      const response = await fetch(`/api/pppoe/payments${tenantQuery}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, phone, packageId, provider: paymentProvider }),
      })
      const result = await response.json() as { id?: string; accountNumber?: string; message?: string; error?: string; checkoutUrl?: string }
      if (!response.ok || !result.id || !result.accountNumber) throw new Error(result.error || 'Unable to start M-Pesa payment.')
      setPaymentId(result.id)
      setAccountNumber(result.accountNumber)
      setHostedCheckoutUrl(result.checkoutUrl || '')
      setStatus('pending')
      setMessage(result.message || (paymentProvider === 'daraja' ? 'Check your phone and approve the M-Pesa prompt.' : 'Continue to the secure payment page.'))
    } catch (error) {
      setStatus('failed')
      setMessage(error instanceof Error ? error.message : 'Unable to start M-Pesa payment.')
    }
  }

  const selectedPackage = packages.find((plan) => plan.id === packageId)
  const copyAccountNumber = async () => {
    try {
      await navigator.clipboard.writeText(accountNumber || credentials?.accountNumber || '')
      setAccountNumberCopied(true)
      window.setTimeout(() => setAccountNumberCopied(false), 2000)
    } catch {
      setMessage('Unable to copy the account number. Please select and copy it manually.')
    }
  }

  return (
    <main className="checkout-shell">
      <section className="checkout-panel">
        <a className="checkout-brand" href={`/hotspot/login${tenantQuery}`}><span className="checkout-mark">L</span><span><BrandWordmark primary="LKTECH" accent="." /><small className="checkout-brand-subtitle">HOME INTERNET</small></span></a>
        {credentials ? <>
          <div className="checkout-success-mark" aria-hidden="true">✓</div>
          <p className="checkout-eyebrow success-eyebrow">PAYMENT CONFIRMED</p>
          <h1>Your PPPoE account is ready.</h1>
          <p className="checkout-copy">{message}</p>
          <div className="credential-box">
            <div><span>Subscriber account number · M-Pesa PayBill</span><strong>{credentials.accountNumber}</strong></div>
            <div><span>PPPoE username</span><strong>{credentials.username}</strong></div>
            <div><span>Password</span><strong>{credentials.password}</strong></div>
            {credentials.receipt && <div><span>Payment receipt</span><strong>{credentials.receipt}</strong></div>}
          </div>
          <p className="checkout-hint">Use the PayBill account number for future payments. Enter the PPPoE username and password in your router. Keep them private.</p>
        </> : <>
          <p className="checkout-eyebrow">PPPoE ACCOUNT SIGNUP</p>
          <h1>Get connected at home.</h1>
          <p className="checkout-copy">Choose a PPPoE plan and pay securely with an available payment method. Your PPPoE login is created after payment is confirmed.</p>
          <div className="checkout-steps" aria-label="Signup steps"><span className="checkout-step-active"><b>1</b> Your details</span><i /><span><b>2</b> M-Pesa payment</span><i /><span><b>3</b> Get connected</span></div>
          <p className="pppoe-account-number-note">Your subscriber account number is assigned when you start checkout. It will appear here to save for future M-Pesa payments.</p>
          {catalogError && <p className="checkout-message is-error" role="alert">{catalogError}</p>}
          {paymentMethodsLoaded && paymentMethods.length === 0 && !catalogError && <p className="checkout-message" role="status">No online payment methods are enabled for this workspace yet.</p>}
          {!catalogError && packages.length === 0 && <p className="checkout-message" role="status">There are no live PPPoE packages available right now. Contact customer care.</p>}
          {selectedPackage && <div className="selected-package"><span className="selected-package-label">YOUR HOME PLAN</span><span className="selected-package-name">{selectedPackage.name}</span><strong>KSh {selectedPackage.monthlyPrice.toLocaleString('en-KE')}</strong><small>{selectedPackage.rateLimit} speed <i /> {Math.ceil(selectedPackage.durationSeconds / 86400)} days</small></div>}
          <form className="checkout-form" onSubmit={startPayment}>
            <label>Full name<input autoComplete="name" minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} required disabled={status === 'pending'} /></label>
            <label>Email address<input type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} required disabled={status === 'pending'} /></label>
            <label>Mobile phone number<input type="tel" inputMode="tel" pattern={KENYAN_MOBILE_PHONE_PATTERN} title="Enter 07 followed by 8 digits or +254 followed by 9 digits." autoComplete="tel" maxLength={13} placeholder="0712345678 or +254712345678" value={phone} onChange={(event) => setPhone(event.target.value)} required disabled={status === 'pending'} /></label>
            {packages.length > 1 && <label>Change package<select value={packageId} onChange={(event) => setPackageId(event.target.value)} required disabled={status === 'pending'}>{packages.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — KSh {plan.monthlyPrice.toLocaleString('en-KE')}</option>)}</select></label>}
            <label>Payment method
              <select value={paymentProvider} onChange={(event) => setPaymentProvider(event.target.value)} disabled={status === 'pending' || paymentMethods.length === 0} required>
                {paymentMethods.map((method) => <option key={method.provider} value={method.provider}>{method.name}</option>)}
              </select>
            </label>
            <button className="checkout-submit" type="submit" disabled={status === 'starting' || status === 'pending' || !selectedPackage || !paymentProvider || Boolean(catalogError)}>{status === 'pending' ? 'Waiting for payment...' : paymentProvider === 'daraja' ? 'Pay with M-Pesa' : 'Continue to checkout'}</button>
          </form>
          {hostedCheckoutUrl && status === 'pending' && <a className="checkout-submit" href={hostedCheckoutUrl} target="_blank" rel="noopener noreferrer">Open secure checkout <span aria-hidden="true">&#8599;</span></a>}
          {accountNumber && status === 'pending' && <section className="pppoe-account-number-card" aria-label="Subscriber account number">
            <div><span>YOUR SUBSCRIBER ACCOUNT NUMBER</span><small>Keep this number for future payments and support enquiries.</small></div>
            <strong>{accountNumber}</strong>
            <button type="button" onClick={() => void copyAccountNumber()}>{accountNumberCopied ? 'Copied' : 'Copy number'}</button>
          </section>}
          {message && <p className={`checkout-message ${status === 'failed' ? 'is-error' : ''}`} role="status">{message}</p>}
          {status === 'failed' && <button className="checkout-retry" type="button" onClick={() => { setStatus('idle'); setMessage('') }}>Try payment again</button>}
          <p className="checkout-hint">Payments are confirmed directly with the provider before your PPPoE access is issued. This page never asks for your M-Pesa PIN.</p>
        </>}
      </section>
    </main>
  )
}
