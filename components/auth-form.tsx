'use client'

import { useEffect, useRef, useState } from 'react'
import { Fingerprint, Eye, EyeOff } from 'lucide-react'
import { startAuthentication } from '@simplewebauthn/browser'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { PasswordRequirement, PasswordRequirements } from '@/components/password-requirements'
import { BrandWordmark } from '@/components/brand-wordmark'
import { getPasswordValidationErrors } from '@/lib/password-policy'
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server'

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [verificationPending, setVerificationPending] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [notice, setNotice] = useState('')
  const handoffInProgress = useRef(false)
  const isSignup = mode === 'signup'

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error')
    if (!code) return
    const messages: Record<string, string> = {
      google_cancelled: 'Google sign-in was cancelled.',
      google_invalid_state: 'Google sign-in expired. Please try again.',
      google_identity_unavailable: 'Google did not return an account identity.',
      google_identity_invalid: 'Google could not verify this account. Please try again.',
      google_account_conflict: 'This Google account could not be linked. Try signing in with your existing method.',
      default_workspace_missing: 'The default workspace is unavailable. Contact your administrator.',
      database_unavailable: 'The account database is unavailable.',
      google_signin_failed: 'Google sign-in failed. Please try again.',
    }
    setError(messages[code] || 'Sign-in failed. Please try again.')
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let active = true
    let listener: { remove: () => Promise<void> } | undefined

    const handleAppUrl = async (url: string) => {
      let callback: URL
      try {
        callback = new URL(url)
      } catch {
        return
      }
      if (callback.protocol !== 'life.lktech.billing:' ||
          callback.hostname !== 'auth' ||
          callback.pathname !== '/passkey') return
      const token = callback.searchParams.get('token')
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token) || handoffInProgress.current) return
      const codeVerifier = window.localStorage.getItem('lktech_passkey_code_verifier')
      if (!codeVerifier) {
        setError('Passkey sign-in could not be securely linked to this app. Please try again.')
        return
      }

      handoffInProgress.current = true
      setBusy(true)
      setError('')
      try {
        const response = await fetch('/api/auth/passkey/mobile-handoff', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token, codeVerifier }),
        })
        const result = await response.json() as { error?: string }
        if (!response.ok) throw new Error(result.error || 'Unable to finish passkey sign-in.')
        window.localStorage.removeItem('lktech_passkey_code_verifier')
        try {
          await Browser.close()
        } catch (closeError) {
          console.warn('Unable to close passkey browser tab', closeError)
        }
        window.location.assign('/')
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : 'Unable to finish passkey sign-in.'
        setError(message)
        setBusy(false)
        handoffInProgress.current = false
        try {
          await Browser.close()
        } catch (closeError) {
          console.warn('Unable to close passkey browser tab', closeError)
        }
      }
    }

    void App.addListener('appUrlOpen', ({ url }) => handleAppUrl(url)).then((handle) => {
      if (active) listener = handle
      else void handle.remove()
    }).catch((error: unknown) => {
      console.error('Unable to register passkey app link handler', error)
    })
    void App.getLaunchUrl().then((launchUrl) => {
      if (launchUrl?.url) return handleAppUrl(launchUrl.url)
    }).catch((error: unknown) => {
      console.error('Unable to read passkey app launch URL', error)
    })

    return () => {
      active = false
      void listener?.remove()
    }
  }, [])

  async function submit(formData: FormData) {
    if (isSignup) {
      const passwordErrors = getPasswordValidationErrors(password)
      if (passwordErrors.length) {
        setError(`Password must have ${passwordErrors.join(', ').toLowerCase()}.`)
        return
      }
      if (password !== passwordConfirmation) {
        setError('The passwords do not match.')
        return
      }
    }
    setBusy(true)
    setError('')
    const payload = Object.fromEntries(formData.entries())
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json() as {
        error?: string
        verificationRequired?: boolean
        emailVerificationRequired?: boolean
        user?: { email?: string }
        diagnostic?: string
      }
      if (result.verificationRequired || result.emailVerificationRequired) {
        setVerificationEmail(result.user?.email || String(payload.email || ''))
        setVerificationPending(true)
        setVerificationCode('')
        setError(result.error || '')
        setNotice(response.ok ? 'Check your inbox for a six-digit verification code.' : '')
        return
      }
      if (!response.ok) {
        setError([result.error || 'Unable to continue. Please try again.', result.diagnostic].filter(Boolean).join(' '))
        return
      }
      window.location.assign('/')
    } catch {
      setError('Unable to reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function signInWithPasskey() {
    setBusy(true)
    setError('')
    try {
      if (Capacitor.isNativePlatform()) {
        const random = crypto.getRandomValues(new Uint8Array(32))
        const codeVerifier = btoa(Array.from(random, (byte) => String.fromCharCode(byte)).join(''))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/g, '')
        const challengeDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
        const codeChallenge = btoa(Array.from(new Uint8Array(challengeDigest), (byte) => String.fromCharCode(byte)).join(''))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/g, '')
        window.localStorage.setItem('lktech_passkey_code_verifier', codeVerifier)
        const browserUrl = new URL('/login', window.location.origin)
        browserUrl.searchParams.set('mobilePasskey', '1')
        browserUrl.searchParams.set('codeChallenge', codeChallenge)
        await Browser.open({ url: browserUrl.toString() })
        return
      }
      if (!window.isSecureContext || !('PublicKeyCredential' in window)) {
        throw new Error('Passkey sign-in requires a supported browser and a secure HTTPS connection.')
      }
      const optionsResponse = await fetch('/api/auth/passkey/login-options', { method: 'POST' })
      const optionsResult = await optionsResponse.json() as { options?: PublicKeyCredentialRequestOptionsJSON; error?: string }
      if (!optionsResponse.ok || !optionsResult.options) throw new Error(optionsResult.error || 'Unable to start passkey sign-in.')
      const credential = await startAuthentication({ optionsJSON: optionsResult.options })
      const mobileHandoff = new URLSearchParams(window.location.search).get('mobilePasskey') === '1'
      const response = await fetch('/api/auth/passkey/login-verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          response: credential,
          mobileHandoff,
          ...(mobileHandoff ? {
            mobileCodeChallenge: new URLSearchParams(window.location.search).get('codeChallenge'),
          } : {}),
        }),
      })
      const result = await response.json() as { error?: string; mobileRedirectUrl?: string }
      if (!response.ok) throw new Error(result.error || 'Passkey sign-in failed.')
      if (result.mobileRedirectUrl) {
        window.location.assign(result.mobileRedirectUrl)
        return
      }
      window.location.assign('/')
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error('Passkey sign-in failed.')
      setError(error.name === 'NotAllowedError'
        ? 'Passkey sign-in was cancelled or timed out. Try again or use your password.'
        : error.message)
    } finally {
      setBusy(false)
    }
  }

  async function verifyEmail(formData: FormData) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail, code: formData.get('code') }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) {
        setError(result.error || 'Unable to verify your email. Please try again.')
        return
      }
      window.location.assign('/get-started')
    } catch {
      setError('Unable to reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function resendVerificationCode() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail, action: 'resend' }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) {
        setError(result.error || 'Unable to send another code. Please try again.')
        return
      }
      setNotice(result.message || 'If your account is waiting for verification, a new code will be sent shortly.')
    } catch {
      setError('Unable to reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-mark" aria-hidden="true">LK</div>
        <BrandWordmark primary="LKTECH" accent="· ISP OPERATIONS" className="auth-kicker" />
        <h1>{verificationPending ? 'Verify your email' : isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-description">{verificationPending
          ? <>We sent a six-digit code to <strong>{verificationEmail}</strong>. Enter it below to finish creating your account.</>
          : isSignup
            ? 'Create your owner account, then follow guided setup for your ISP workspace, first site, payments, and router.'
            : 'Sign in to manage your provider workspace.'}</p>
        {verificationPending ? <form action={verifyEmail} className="auth-form">
          <label htmlFor="auth-verification-code">Email verification code</label>
          <input
            id="auth-verification-code"
            className="auth-code-input"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            value={verificationCode}
            onChange={(event) => { setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); setNotice('') }}
            placeholder="000000"
            aria-describedby="auth-verification-help"
            required
          />
          <span className="auth-hint" id="auth-verification-help">The code expires after 10 minutes. You have five attempts.</span>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {notice && <p className="auth-success" role="status">{notice}</p>}
          <button type="submit" className="auth-submit" disabled={busy || verificationCode.length !== 6}>{busy ? 'Please wait…' : 'Verify email'}</button>
          <button type="button" className="auth-text-button" onClick={() => void resendVerificationCode()} disabled={busy}>Resend code</button>
          <button type="button" className="auth-text-button" onClick={() => { setVerificationPending(false); setError(''); setNotice('') }} disabled={busy}>Back to {isSignup ? 'sign up' : 'sign in'}</button>
        </form> : <form action={submit} className="auth-form">
          {isSignup && <>
            <label htmlFor="auth-name">Your name</label>
            <input id="auth-name" name="name" autoComplete="name" minLength={2} maxLength={120} required />
          </>}
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" name="email" type="email" autoComplete="email" maxLength={254} required />
          <label htmlFor="auth-password">Password</label>
          <div className="password-input-wrap">
            <input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={isSignup ? 'new-password' : 'current-password'} minLength={isSignup ? 6 : 1} maxLength={128} value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} required />
            <button type="button" className="password-visibility-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          {isSignup && <PasswordRequirements password={password} />}
          {isSignup && <>
            <label htmlFor="auth-password-confirmation">Confirm password</label>
            <div className="password-input-wrap">
              <input id="auth-password-confirmation" name="confirmPassword" type={showPasswordConfirmation ? 'text' : 'password'} autoComplete="new-password" minLength={6} maxLength={128} value={passwordConfirmation} onChange={(event) => { setPasswordConfirmation(event.target.value); setError('') }} required />
              <button type="button" className="password-visibility-toggle" aria-label={showPasswordConfirmation ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={showPasswordConfirmation} onClick={() => setShowPasswordConfirmation((visible) => !visible)}>{showPasswordConfirmation ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            {passwordConfirmation.length > 0 && <ul className="password-rules" aria-label="Password confirmation">
              <PasswordRequirement met={passwordConfirmation === password}>Passwords match</PasswordRequirement>
            </ul>}
          </>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}</button>
        </form>}
        {!verificationPending && !isSignup && <button type="button" className="auth-passkey-button" onClick={() => void signInWithPasskey()} disabled={busy}><Fingerprint size={17} />{busy ? (Capacitor.isNativePlatform() ? 'Opening secure browser…' : 'Waiting for passkey…') : 'Sign in with a passkey'}</button>}
        {!verificationPending && !isSignup && <p className="auth-switch"><a href="/forgot-password">Forgot your password?</a></p>}
        {!verificationPending && isSignup && <p className="auth-terms">By creating an account, you agree to the <a href="/terms#platform-terms">LKTECH Platform Terms</a>.</p>}
        {!verificationPending && <p className="auth-switch">{isSignup ? 'Already have an account?' : 'New to LKTECH?'} <a href={isSignup ? '/login' : '/signup'}>{isSignup ? 'Sign in' : 'Create an account'}</a></p>}
      </section>
    </main>
  )
}
