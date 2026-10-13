'use client'

import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { PasswordRequirement, PasswordRequirements } from '@/components/password-requirements'
import { getPasswordValidationErrors } from '@/lib/password-policy'

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
        <p className="auth-kicker">LKTECH · ISP OPERATIONS</p>
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
        {!verificationPending && !isSignup && <p className="auth-switch"><a href="/forgot-password">Forgot your password?</a></p>}
        {!verificationPending && <p className="auth-switch">{isSignup ? 'Already have an account?' : 'New to LKTECH?'} <a href={isSignup ? '/login' : '/signup'}>{isSignup ? 'Sign in' : 'Create an account'}</a></p>}
      </section>
    </main>
  )
}
