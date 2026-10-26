'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { requiresAdminPasswordConfirmation } from '@/lib/admin-password-confirmation'

type PasswordRequest = {
  resolve: (password: string | null) => void
}

function needsPasswordConfirmation(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : null
  const method = (init?.method || request?.method || 'GET').toUpperCase()

  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  try {
    const url = new URL(rawUrl, window.location.href)
    return url.origin === window.location.origin && requiresAdminPasswordConfirmation(url.pathname, method)
  } catch {
    return false
  }
}

export function AdminPasswordConfirmation() {
  const requests = useRef<PasswordRequest[]>([])
  const [activeRequest, setActiveRequest] = useState<PasswordRequest | null>(null)
  const [password, setPassword] = useState('')
  const [validationError, setValidationError] = useState('')

  const askForPassword = useCallback(() => new Promise<string | null>((resolve) => {
    const request = { resolve }
    requests.current.push(request)
    if (requests.current.length === 1) {
      setPassword('')
      setValidationError('')
      setActiveRequest(request)
    }
  }), [])

  const finishRequest = useCallback((value: string | null) => {
    const request = requests.current.shift()
    request?.resolve(value)
    setPassword('')
    setValidationError('')
    setActiveRequest(requests.current[0] ?? null)
  }, [])

  useEffect(() => {
    const originalFetch = window.fetch
    const guardedFetch: typeof window.fetch = async (input, init) => {
      if (!needsPasswordConfirmation(input, init)) return originalFetch.call(window, input, init)

      const confirmedPassword = await askForPassword()
      if (confirmedPassword === null) {
        return Response.json({
          error: 'Change cancelled. No changes were made.',
          code: 'password_confirmation_cancelled',
        }, { status: 409 })
      }

      const request = input instanceof Request ? input : null
      const headers = new Headers(request?.headers)
      new Headers(init?.headers).forEach((value, name) => headers.set(name, value))
      headers.set('x-admin-password-confirmation', confirmedPassword)
      return originalFetch.call(window, input, { ...init, headers })
    }
    window.fetch = guardedFetch

    return () => {
      if (window.fetch === guardedFetch) window.fetch = originalFetch
      for (const request of requests.current.splice(0)) request.resolve(null)
    }
  }, [askForPassword])

  if (!activeRequest) return null

  return (
    <div className="admin-password-confirmation-backdrop">
      <form
        className="admin-password-confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-password-confirmation-title"
        onSubmit={(event) => {
          event.preventDefault()
          if (!password) {
            setValidationError('Enter your account password to continue.')
            return
          }
          finishRequest(password)
        }}
      >
        <span className="section-eyebrow">CONFIRM ADMIN ACTION</span>
        <h2 id="admin-password-confirmation-title">Enter your password</h2>
        <p>Verify your account password to make this change. You’ll be asked again for the next change.</p>
        <label>
          Account password
          <input
            autoFocus
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setValidationError('')
            }}
          />
        </label>
        {validationError && <p className="admin-password-confirmation-error" role="alert">{validationError}</p>}
        <div className="admin-password-confirmation-actions">
          <button type="button" className="outline-button" onClick={() => finishRequest(null)}>Cancel</button>
          <button type="submit" className="primary-button">Confirm change</button>
        </div>
      </form>
    </div>
  )
}
