'use client'

import { useCallback, useEffect, useState } from 'react'
import { startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/server'

type PasskeyCredential = { credentialId: string; createdAt: string }
type PasskeyApiResponse = { error?: string; credentials?: PasskeyCredential[]; options?: PublicKeyCredentialCreationOptionsJSON }

async function readResponse(response: Response) {
  const result = await response.json() as PasskeyApiResponse
  if (!response.ok) throw new Error(result.error || 'Unable to manage passkeys.')
  return result
}

export function PasskeySettings() {
  const [credentials, setCredentials] = useState<PasskeyCredential[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadCredentials = useCallback(async () => {
    const result = await readResponse(await fetch('/api/auth/passkey/credentials', { cache: 'no-store' }))
    setCredentials(result.credentials || [])
  }, [])

  useEffect(() => {
    let active = true
    fetch('/api/auth/passkey/credentials', { cache: 'no-store' })
      .then(readResponse)
      .then((result) => { if (active) setCredentials(result.credentials || []) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load passkeys.') })
    return () => { active = false }
  }, [])

  async function addPasskey() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (!window.isSecureContext || !('PublicKeyCredential' in window)) {
        throw new Error('Passkeys require a supported browser and a secure HTTPS connection.')
      }
      if (process.env.NODE_ENV === 'development' && window.location.hostname === '127.0.0.1') {
        throw new Error('For local passkey setup, open this app at http://localhost:3000 instead of 127.0.0.1.')
      }
      const optionsResult = await readResponse(await fetch('/api/auth/passkey/register-options', { method: 'POST' }))
      const optionsJSON = optionsResult.options
      if (!optionsJSON) throw new Error('Unable to start passkey setup.')
      const credential = await startRegistration({ optionsJSON })
      await readResponse(await fetch('/api/auth/passkey/register-verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: credential }),
      }))
      await loadCredentials()
      setNotice('Passkey added. You can use it to sign in to LKTECH.')
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'NotAllowedError') {
        setError('The browser or Windows could not save the passkey. If prompted, use your Windows Hello PIN or biometrics; for local development, open the app at http://localhost:3000.')
      } else if (reason instanceof DOMException && reason.name === 'SecurityError') {
        setError('The passkey host does not match its configured security domain. Check the address and PASSKEY_RP_ID.')
      } else {
        setError(reason instanceof Error ? reason.message : 'Unable to add a passkey.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function removePasskey(credentialId: string) {
    if (!window.confirm('Remove this passkey from your LKTECH account?')) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/auth/passkey/credentials', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credentialId }),
      })
      await readResponse(response)
      await loadCredentials()
      setNotice('Passkey removed.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to remove this passkey.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-card">
      <h2>Passkeys</h2>
      <p>Sign in securely with a device screen lock, fingerprint, face recognition, or a security key. Your biometric data stays on your device.</p>
      {credentials.length > 0
        ? <ul className="passkey-list">{credentials.map((credential) => (
          <li key={credential.credentialId}>
            <span><strong>Passkey</strong><small>Added {new Date(credential.createdAt).toLocaleDateString()}</small></span>
            <button type="button" className="outline-button" disabled={busy} onClick={() => void removePasskey(credential.credentialId)}>Remove</button>
          </li>
        ))}</ul>
        : <p className="passkey-empty">No passkeys are registered for this account yet.</p>}
      {error && <p className="settings-feedback is-error" role="alert">{error}</p>}
      {notice && <p className="settings-feedback" role="status">{notice}</p>}
      <button type="button" className="settings-save-button" disabled={busy} onClick={() => void addPasskey()}>{busy ? 'Please wait…' : 'Add a passkey'}</button>
    </section>
  )
}
