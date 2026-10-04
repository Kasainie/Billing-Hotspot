'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { PasswordRequirement, PasswordRequirements } from '@/components/password-requirements'
import { getPasswordValidationErrors } from '@/lib/password-policy'

function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-mark" aria-hidden="true">R4</div>
        <p className="auth-kicker">LKTECH · ISP OPERATIONS</p>
        <h1>{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
      </section>
    </main>
  )
}

export function ForgotPasswordForm() {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(formData: FormData) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: formData.get('email') }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) {
        setError(result.error || 'Unable to request a reset link. Please try again.')
        return
      }
      setMessage(result.message || 'If an account exists for that email, a password reset link will be sent shortly.')
    } catch {
      setError('Unable to reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Forgot your password?" description="Enter your account email and we’ll send you a password reset link.">
      <form action={submit} className="auth-form">
        <label htmlFor="reset-email">Email</label>
        <input id="reset-email" name="email" type="email" autoComplete="email" maxLength={254} required />
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="auth-success" role="status">{message}</p>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
      </form>
      <p className="auth-switch"><a href="/login">Back to sign in</a></p>
    </AuthCard>
  )
}

export function ResetPasswordForm() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('token') || ''
    setToken(value)
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
      setError('This reset link is invalid or has expired. Request a new one.')
    }
  }, [])

  async function submit(formData: FormData) {
    const passwordErrors = getPasswordValidationErrors(password)
    if (passwordErrors.length) {
      setError(`Password must have ${passwordErrors.join(', ').toLowerCase()}.`)
      return
    }
    if (password !== confirmation) {
      setError('The passwords do not match.')
      return
    }

    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) {
        setError(result.error || 'Unable to reset your password. Request a new link and try again.')
        return
      }
      setMessage(result.message || 'Your password has been reset. You can now sign in.')
    } catch {
      setError('Unable to reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Set a new password" description="Choose a new password for your account.">
      {message ? <>
        <p className="auth-success" role="status">{message}</p>
        <p className="auth-switch"><a href="/login">Go to sign in</a></p>
      </> : <>
        <form action={submit} className="auth-form">
          <label htmlFor="new-password">New password</label>
          <div className="password-input-wrap">
            <input id="new-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={6} maxLength={128} value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} required disabled={!token || busy} />
            <button type="button" className="password-visibility-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} disabled={!token || busy}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          <PasswordRequirements password={password} />
          <label htmlFor="confirm-password">Confirm new password</label>
          <div className="password-input-wrap">
            <input id="confirm-password" name="confirmPassword" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" minLength={6} maxLength={128} value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError('') }} required disabled={!token || busy} />
            <button type="button" className="password-visibility-toggle" aria-label={showConfirmation ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={showConfirmation} onClick={() => setShowConfirmation((visible) => !visible)} disabled={!token || busy}>{showConfirmation ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          {confirmation.length > 0 && <ul className="password-rules" aria-label="Password confirmation">
            <PasswordRequirement met={confirmation === password}>Passwords match</PasswordRequirement>
          </ul>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="auth-submit" disabled={!token || busy}>{busy ? 'Saving…' : 'Reset password'}</button>
        </form>
        <p className="auth-switch"><a href="/forgot-password">Request a new reset link</a></p>
      </>}
    </AuthCard>
  )
}
