'use client'

import { useEffect, useState } from 'react'

type PortalPackage = {
  id: string
  name: string
  price: number
  durationLabel: string
  speedLabel: string
}

type PurchaseResult = {
  status: string
  productName?: string
  failureReason?: string | null
  username?: string | null
  password?: string | null
  receipt?: string | null
  message?: string
  error?: string
}

export function HotspotCheckout({ mode = 'purchase' }: { mode?: 'purchase' | 'reconnect' }) {
  const [products, setProducts] = useState<PortalPackage[]>([])
  const [catalogError, setCatalogError] = useState('')
  const [productId, setProductId] = useState('')
  const [clientMac, setClientMac] = useState('')
  const [returnUrl, setReturnUrl] = useState('')
  const [phone, setPhone] = useState('')
  const [receipt, setReceipt] = useState('')
  const [purchaseId, setPurchaseId] = useState('')
  const [status, setStatus] = useState<'idle' | 'starting' | 'pending' | 'complete' | 'failed'>('idle')
  const [message, setMessage] = useState('')
  const [credentials, setCredentials] = useState<{ username: string; password: string; receipt?: string | null } | null>(null)
  const [tenantQuery, setTenantQuery] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setTenantQuery(params.get('tenant') ? `?${new URLSearchParams({ tenant: params.get('tenant')! })}` : '')
    setProductId(params.get('package') || '')
    setClientMac(params.get('mac') || '')
    setPhone(params.get('phone') || '')
    setReceipt(params.get('receipt') || '')
    const candidateReturnUrl = params.get('return') || ''
    try {
      const returnUrl = new URL(candidateReturnUrl)
      if (returnUrl.protocol === 'http:' && isPrivateRouterAddress(returnUrl.hostname)) setReturnUrl(returnUrl.toString())
    } catch {
      setReturnUrl('')
    }
  }, [])

  useEffect(() => {
    if (mode !== 'purchase') return
    let active = true
    fetch(`/api/hotspot/packages${tenantQuery}`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as PortalPackage[] | { error?: string }
        if (!response.ok || !Array.isArray(result)) throw new Error(!Array.isArray(result) ? result.error || 'Unable to load packages.' : 'Unable to load packages.')
        if (active) setProducts(result)
      })
      .catch((error) => { if (active) setCatalogError(error instanceof Error ? error.message : 'Unable to load packages.') })
    return () => { active = false }
  }, [mode, tenantQuery])

  useEffect(() => {
    if (status !== 'pending' || !purchaseId) return
    let active = true
    let timer: number
    const poll = async () => {
      try {
        const response = await fetch(`/api/hotspot/purchases/${encodeURIComponent(purchaseId)}${tenantQuery}`, { cache: 'no-store' })
        const result = await response.json() as PurchaseResult
        if (!active) return
        if (!response.ok) throw new Error(result.error || 'Unable to check payment.')
        if (result.status === 'completed' && result.username && result.password) {
          setCredentials({ username: result.username, password: result.password, receipt: result.receipt })
          setStatus('complete')
          setMessage('Payment received. Your Wi-Fi account is ready.')
        } else if (result.status === 'failed') {
          setStatus('failed')
          setMessage(result.failureReason || 'Payment was not completed. You can try again.')
        } else {
          setMessage('Approve the M-Pesa request on your phone. Keep this page open while we confirm payment.')
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
  }, [purchaseId, status, tenantQuery])

  const startPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!products.some((product) => product.id === productId)) {
      setStatus('failed')
      setMessage('Choose a valid internet package from the hotspot page.')
      return
    }
    setStatus('starting')
    setMessage('Sending a secure payment request to your phone...')
    try {
      const response = await fetch(`/api/hotspot/purchases${tenantQuery}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packageId: productId, phone, mac: clientMac }),
      })
      const result = await response.json() as { id?: string; message?: string; error?: string }
      if (!response.ok || !result.id) throw new Error(result.error || 'Unable to start M-Pesa payment.')
      setPurchaseId(result.id)
      setStatus('pending')
      setMessage(result.message || 'Check your phone and approve the M-Pesa prompt.')
    } catch (error) {
      setStatus('failed')
      setMessage(error instanceof Error ? error.message : 'Unable to start M-Pesa payment.')
    }
  }

  const findByReceipt = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('starting')
    setMessage('Looking up your paid package...')
    try {
      const params = new URLSearchParams({ phone, receipt })
      const response = await fetch(`/api/hotspot/reconnect?${params.toString()}${tenantQuery ? `&${new URLSearchParams(tenantQuery.slice(1))}` : ''}`, { cache: 'no-store' })
      const result = await response.json() as PurchaseResult
      if (!response.ok || !result.username || !result.password) throw new Error(result.error || 'No completed package matches those details.')
      setCredentials({ username: result.username, password: result.password, receipt: result.receipt })
      setStatus('complete')
      setMessage('Your Wi-Fi account is ready.')
    } catch (error) {
      setStatus('failed')
      setMessage(error instanceof Error ? error.message : 'Unable to find that payment.')
    }
  }

  const selectedProduct = products.find((product) => product.id === productId)
  const returnToPortal = () => {
    if (returnUrl) window.location.assign(returnUrl)
    else window.history.back()
  }

  return (
    <main className="checkout-shell">
      <section className="checkout-panel">
        <button className="checkout-brand" type="button" onClick={returnToPortal}><span className="checkout-mark">L</span>LKTECH HOTSPOT</button>
        {status === 'complete' && credentials ? <>
          <p className="checkout-eyebrow success-eyebrow">PAYMENT CONFIRMED</p>
          <h1>You&apos;re ready to connect.</h1>
          <p className="checkout-copy">{message}</p>
          <div className="credential-box"><div><span>Username</span><strong>{credentials.username}</strong></div><div><span>Password</span><strong>{credentials.password}</strong></div>{credentials.receipt && <div><span>M-Pesa receipt</span><strong>{credentials.receipt}</strong></div>}</div>
          <p className="checkout-hint">Return to the hotspot sign-in page and enter these details. Keep them private.</p>
          <button className="checkout-submit" type="button" onClick={returnToPortal}>Return to hotspot <span aria-hidden="true">&#8594;</span></button>
        </> : <>
          <p className="checkout-eyebrow">{mode === 'purchase' ? 'SECURE M-PESA CHECKOUT' : 'ACCOUNT RECOVERY'}</p>
          <h1>{mode === 'purchase' ? 'Connect in a few steps.' : 'Find your hotspot login.'}</h1>
          <p className="checkout-copy">{mode === 'purchase' ? 'We’ll send an STK Push to your Safaricom phone. Approve it in the official M-Pesa prompt; never enter your M-Pesa PIN on this page.' : 'Use the phone number and M-Pesa receipt from your package payment.'}</p>
          {mode === 'purchase' && selectedProduct && <div className="selected-package"><span>{selectedProduct.name}</span><strong>KSh {selectedProduct.price}</strong><small>{selectedProduct.speedLabel} · {selectedProduct.durationLabel}</small></div>}
          {mode === 'purchase' && catalogError && <p className="checkout-message is-error" role="alert">{catalogError}</p>}
          {mode === 'purchase' && !selectedProduct && !catalogError && <p className="checkout-message" role="status">Return to the hotspot page and choose an available package.</p>}
          <form className="checkout-form" onSubmit={mode === 'purchase' ? startPayment : findByReceipt}>
            <label>Safaricom phone number<input type="tel" inputMode="tel" autoComplete="tel" placeholder="07XX XXX XXX" value={phone} onChange={(event) => setPhone(event.target.value)} required disabled={status === 'pending'} /></label>
            {mode === 'reconnect' && <label>M-Pesa receipt code<input type="text" autoCapitalize="characters" placeholder="e.g. RTA12ABC34" value={receipt} onChange={(event) => setReceipt(event.target.value.toUpperCase())} required /></label>}
            <button className="checkout-submit" type="submit" disabled={status === 'starting' || status === 'pending' || (mode === 'purchase' && (!selectedProduct || Boolean(catalogError)))}>{mode === 'purchase' ? status === 'pending' ? 'Waiting for M-Pesa approval...' : 'Send M-Pesa prompt' : 'Find my account'}</button>
          </form>
          {message && <p className={`checkout-message ${status === 'failed' ? 'is-error' : ''}`} role="status">{message}</p>}
          {status === 'failed' && mode === 'purchase' && <button className="checkout-retry" type="button" onClick={() => { setStatus('idle'); setMessage('') }}>Try payment again</button>}
          <p className="checkout-hint">M-Pesa PINs are entered only in the Safaricom prompt. This page never asks for your PIN.</p>
        </>}
      </section>
      <button className="checkout-back" type="button" onClick={returnToPortal}>Back to hotspot</button>
    </main>
  )
}

function isPrivateRouterAddress(hostname: string) {
  const ipv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.exec(hostname)
  if (!ipv4) return hostname === 'localhost' || hostname.endsWith('.lan')
  const octets = hostname.split('.').map(Number)
  if (octets.some((octet) => octet > 255)) return false
  return octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 169 && octets[1] === 254)
}