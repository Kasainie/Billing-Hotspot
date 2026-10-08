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
      const result = await response.json() as { error?: string }
      if (!response.ok) {
        setError(result.error || 'Unable to continue. Please try again.')
        return
      }
      window.location.assign(isSignup ? '/get-started' : '/dashboard')
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
        <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-description">{isSignup ? 'Create your account first. We’ll help you name your ISP, connect payments, and set up your router next.' : 'Sign in to manage your provider workspace.'}</p>
        <form action={submit} className="auth-form">
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
        </form>
        {!isSignup && <p className="auth-switch"><a href="/forgot-password">Forgot your password?</a></p>}
        <p className="auth-switch">{isSignup ? 'Already have an account?' : 'New to LKTECH?'} <a href={isSignup ? '/login' : '/signup'}>{isSignup ? 'Sign in' : 'Create an account'}</a></p>
      </section>
    </main>
  )
}
