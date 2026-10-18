'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Activity, Bell, Cable, Check, CreditCard, FileText, Globe2, Mail, MessageCircle,
  Network, Palette, Search, Settings2, ShieldCheck, Smartphone, UserRound, Wifi,
  type LucideIcon,
} from 'lucide-react'
import { PaymentSettings } from '@/components/payment-settings'
import { SmsSettings } from '@/components/sms-settings'
import { tenantSettingSections, type TenantSettingField, type TenantSettingSection } from '@/lib/tenant-settings'

type SavedSettings = Record<string, Record<string, string | number | boolean>>
type Profile = { id: string; name: string; email: string; tenant: { id: string; name: string; slug: string; role: string } }
type SettingsItem = (TenantSettingSection & { icon: LucideIcon }) | { id: string; group: string; label: string; description: string; status: string; icon: LucideIcon; fields: [] }

const extraSections: SettingsItem[] = [
  { id: 'payments', group: 'BILLING & MESSAGING', label: 'Payments', description: 'Configure M-Pesa and Daraja payment processing.', status: 'Provider credentials are encrypted and used for payment requests.', icon: CreditCard, fields: [] },
  { id: 'communications', group: 'BILLING & MESSAGING', label: 'Communications', description: 'Configure SMS delivery and review delivery reports.', status: 'Africa’s Talking credentials are encrypted and used by the SMS queue.', icon: MessageCircle, fields: [] },
  { id: 'profile', group: 'ACCOUNT', label: 'Profile', description: 'Update your account name and view your account details.', status: 'Your name is used across your workspace.', icon: UserRound, fields: [] },
  { id: 'security', group: 'ACCOUNT', label: 'Password & 2FA', description: 'Change your password and review additional sign-in security.', status: 'Password changes revoke other active sign-in sessions. Two-factor authentication is not yet available.', icon: ShieldCheck, fields: [] },
]

const icons: Record<string, LucideIcon> = {
  branding: Palette, domain: Globe2, pppoe: Network, hotspot: Wifi, email: Mail,
  whatsapp: Smartphone, templates: FileText, loyalty: CreditCard, alerts: Bell,
  ai: Activity, accounting: CreditCard, developer: Cable,
}
const allSections: SettingsItem[] = [...tenantSettingSections.map((section) => ({ ...section, icon: icons[section.id] || Settings2 })), ...extraSections]

function defaultSection(sectionId: string) {
  return tenantSettingSections.find((section) => section.id === sectionId)
}

function SettingInput({ field, value, onChange, configured }: {
  field: TenantSettingField
  value: string | number | boolean | undefined
  onChange: (value: string | number | boolean) => void
  configured: boolean
}) {
  if (field.type === 'toggle') return <label className="settings-toggle-row">
    <span><strong>{field.label}</strong><small>{field.help}</small></span>
    <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
  </label>

  return <label className="settings-field">
    <span>{field.label}{field.secret && configured && <small className="settings-configured-tag"><Check size={12} /> Saved</small>}</span>
    {field.type === 'textarea'
      ? <textarea value={String(value ?? '')} maxLength={field.maxLength} onChange={(event) => onChange(event.target.value)} rows={4} />
      : field.type === 'select'
        ? <select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}><option value="">Select…</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        : <input type={field.type === 'password' ? 'password' : field.type} value={String(value ?? '')} maxLength={field.maxLength} placeholder={field.secret && configured ? 'Leave blank to keep saved secret' : undefined} onChange={(event) => onChange(event.target.value)} autoComplete={field.secret ? 'new-password' : 'off'} />}
    <small>{field.help}</small>
  </label>
}

export function SettingsCenter({ onNavigate, onProfileNameChange }: { onNavigate: (page: string) => void; onProfileNameChange: (name: string) => void }) {
  const [selected, setSelected] = useState('branding')
  const [search, setSearch] = useState('')
  const [settings, setSettings] = useState<SavedSettings>({})
  const [configuredSecrets, setConfiguredSecrets] = useState<Record<string, string[]>>({})
  const [profile, setProfile] = useState<Profile | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [settingsResponse, sessionResponse, portalResponse] = await Promise.all([
          fetch('/api/tenant/settings', { cache: 'no-store' }),
          fetch('/api/auth/session', { cache: 'no-store' }),
          fetch('/api/hotspot/portal-template', { cache: 'no-store' }),
        ])
        const settingsResult = await settingsResponse.json() as { settings?: SavedSettings; configured?: Record<string, string[]>; error?: string }
        if (!settingsResponse.ok) throw new Error(settingsResult.error || 'Unable to load workspace settings.')
        const sessionResult = await sessionResponse.json() as { user?: { id: string; name: string; email: string }; tenant?: Profile['tenant']; error?: string }
        if (!sessionResponse.ok) throw new Error(sessionResult.error || 'Unable to load account profile.')
        if (!sessionResult.user || !sessionResult.tenant) throw new Error('Unable to load account profile.')
        const portalResult = await portalResponse.json() as { companyName?: string; welcomeHeadline?: string; welcomeMessage?: string; supportMessage?: string; error?: string }
        if (!portalResponse.ok) throw new Error(portalResult.error || 'Unable to load portal branding.')
        const loadedSettings = settingsResult.settings || {}
        const portalDefaults = {
          companyName: portalResult.companyName || '',
          welcomeHeadline: portalResult.welcomeHeadline || '',
          welcomeMessage: portalResult.welcomeMessage || '',
          supportMessage: portalResult.supportMessage || '',
        }
        if (active) {
          setSettings({
            ...loadedSettings,
            branding: { ...portalDefaults, ...loadedSettings.branding },
            hotspot: { ...portalDefaults, ...loadedSettings.hotspot },
            domain: { workspaceSlug: sessionResult.tenant.slug, ...loadedSettings.domain },
          })
          setConfiguredSecrets(settingsResult.configured || {})
          setProfile({ ...sessionResult.user, tenant: sessionResult.tenant })
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load settings.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  const matchingSections = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term
      ? allSections.filter((section) => `${section.label} ${section.group} ${section.description} ${section.fields.map((field) => `${field.label} ${field.help}`).join(' ')}`.toLowerCase().includes(term))
      : allSections
  }, [search])
  const selectedSection = allSections.find((section) => section.id === selected) || allSections[0]
  const settingsSection = defaultSection(selected)
  const groups = [...new Set(matchingSections.map((section) => section.group))]

  function updateField(sectionId: string, key: string, value: string | number | boolean) {
    setSettings((current) => ({ ...current, [sectionId]: { ...current[sectionId], [key]: value } }))
  }

  async function saveGenericSettings() {
    if (!settingsSection) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const values = { ...(settings[selected] || {}) }
      if (selected === 'branding' || selected === 'hotspot') {
        const existingResponse = await fetch('/api/hotspot/portal-template', { cache: 'no-store' })
        const existing = await existingResponse.json() as Record<string, unknown> & { error?: string }
        if (!existingResponse.ok) throw new Error(existing.error || 'Unable to load captive portal branding.')
        const response = await fetch('/api/hotspot/portal-template', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            template: existing.activeTemplate,
            companyName: values.companyName ?? existing.companyName,
            welcomeHeadline: values.welcomeHeadline ?? existing.welcomeHeadline,
            welcomeMessage: values.welcomeMessage ?? existing.welcomeMessage,
            supportMessage: values.supportMessage ?? existing.supportMessage,
          }),
        })
        const result = await response.json() as { error?: string; companyName?: string; welcomeHeadline?: string; welcomeMessage?: string; supportMessage?: string }
        if (!response.ok) throw new Error(result.error || 'Unable to update portal branding.')
        values.companyName = result.companyName || ''
        values.welcomeHeadline = result.welcomeHeadline || ''
        values.welcomeMessage = result.welcomeMessage || ''
        values.supportMessage = result.supportMessage || ''
      }

      if (selected === 'domain' && profile && typeof values.workspaceSlug === 'string' && values.workspaceSlug !== profile.tenant.slug) {
        const portalResponse = await fetch('/api/hotspot/portal-template', { cache: 'no-store' })
        const portal = await portalResponse.json() as { companyName?: string; error?: string }
        if (!portalResponse.ok) throw new Error(portal.error || 'Unable to load portal branding.')
        const response = await fetch('/api/tenants/current', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: profile.tenant.name, slug: values.workspaceSlug, portalName: portal.companyName || profile.tenant.name }),
        })
        const result = await response.json() as { error?: string; slug?: string }
        if (!response.ok) throw new Error(result.error || 'Unable to update workspace address.')
        values.workspaceSlug = result.slug || values.workspaceSlug
        setProfile((current) => current ? { ...current, tenant: { ...current.tenant, slug: values.workspaceSlug as string } } : current)
      }

      const response = await fetch('/api/tenant/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ section: selected, values }),
      })
      const result = await response.json() as { settings?: Record<string, string | number | boolean>; configured?: string[]; error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to save settings.')
      setSettings((current) => ({ ...current, [selected]: result.settings || values }))
      setConfiguredSecrets((current) => ({ ...current, [selected]: result.configured || current[selected] || [] }))
      setNotice(`${selectedSection.label} settings saved.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save settings.')
    } finally {
      setSaving(false)
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: profile.name }),
      })
      const result = await response.json() as { name?: string; error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to update account profile.')
      setProfile((current) => current ? { ...current, name: result.name || current.name } : current)
      onProfileNameChange(result.name || profile.name)
      setNotice('Profile updated.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update profile.')
    } finally {
      setSaving(false)
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const result = await response.json() as { message?: string; error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to change password.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNotice(result.message || 'Password updated.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to change password.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="settings-center">
    <div className="settings-topbar"><div className="settings-breadcrumb">Settings <span>/</span> <strong>{selectedSection.label}</strong></div><button type="button" className="settings-top-search" onClick={() => document.getElementById('settings-search')?.focus()}><Search size={14} /><span>Find a setting…</span><kbd>Ctrl K</kbd></button></div>
    <div className="settings-layout">
      <aside className="settings-nav">
        <label className="settings-search"><Search size={15} /><input id="settings-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a setting…" /></label>
        <nav aria-label="Settings sections">{groups.map((group) => <div className="settings-nav-group" key={group}><span>{group}</span>{matchingSections.filter((section) => section.group === group).map((section) => {
          const Icon = section.icon
          return <button key={section.id} type="button" className={selected === section.id ? 'selected' : ''} onClick={() => { setSelected(section.id); setError(''); setNotice('') }}><i><Icon size={15} /></i><span><strong>{section.label}</strong><small>{section.description}</small></span></button>
        })}</div>)}</nav>
        <button type="button" className="settings-back-button" onClick={() => onNavigate('Overview')}>Back to workspace</button>
      </aside>
      <main className="settings-main">
        <div className="settings-heading"><span>SETTINGS</span><h1>{selectedSection.label === 'Branding' ? <>Your <em>brand.</em></> : selectedSection.label}</h1><p>{selectedSection.description}</p></div>
        {loading ? <div className="settings-card"><p>Loading workspace settings…</p></div> : selected === 'payments' ? <PaymentSettings /> : selected === 'communications' ? <SmsSettings /> : selected === 'profile' ? <section className="settings-card"><h2>Account profile</h2><p>Your personal account identity and workspace membership.</p><form className="settings-form" onSubmit={saveProfile}><label className="settings-field"><span>Full name</span><input required minLength={2} maxLength={120} value={profile?.name || ''} onChange={(event) => setProfile((current) => current ? { ...current, name: event.target.value } : current)} /></label><label className="settings-field"><span>Email address</span><input readOnly value={profile?.email || ''} /><small>Contact support if you need to change the account email address.</small></label><label className="settings-field"><span>Workspace</span><input readOnly value={`${profile?.tenant.name || ''} · ${profile?.tenant.role || ''}`} /></label><button type="submit" className="settings-save-button" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></form></section> : selected === 'security' ? <><section className="settings-card"><h2>Change password</h2><p>Choose a unique password that you do not use on other sites.</p><form className="settings-form" onSubmit={changePassword}><label className="settings-field"><span>Current password</span><input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label className="settings-field"><span>New password</span><input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><small>At least 12 characters and must satisfy the account password policy.</small></label><label className="settings-field"><span>Confirm new password</span><input type="password" autoComplete="new-password" minLength={12} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label><button type="submit" className="settings-save-button" disabled={saving}>{saving ? 'Updating…' : 'Change password'}</button></form></section><section className="settings-card settings-unavailable"><ShieldCheck size={17} /><div><h2>Two-factor authentication</h2><p>Two-factor authentication is not enabled for this account provider. Password changes are available above; no 2FA setting is shown as active.</p></div></section></> : selected === 'domain' && settingsSection ? <><SettingsFields section={settingsSection} values={settings[selected] || { workspaceSlug: profile?.tenant.slug || '' }} configured={configuredSecrets[selected] || []} updateField={updateField} /><section className="settings-info-card"><Globe2 size={17} /><div><strong>Custom domain setup</strong><p>Point your DNS record to the hosting target provided by your deployment platform, then configure the custom hostname and TLS certificate there. This app does not automatically change DNS or issue certificates.</p>{settings[selected]?.customDomain && <span>Saved hostname status: Awaiting DNS and TLS setup.</span>}</div></section><button type="button" className="settings-save-button" disabled={saving} onClick={() => void saveGenericSettings()}>{saving ? 'Saving…' : 'Save domain settings'}</button></> : settingsSection ? <><SettingsFields section={settingsSection} values={settings[selected] || {}} configured={configuredSecrets[selected] || []} updateField={updateField} /><div className="settings-status-note"><Activity size={15} /><span>{selectedSection.status}</span></div><button type="button" className="settings-save-button" disabled={saving} onClick={() => void saveGenericSettings()}>{saving ? 'Saving…' : `Save ${selectedSection.label.toLowerCase()} settings`}</button></> : null}
        {error && <p className="settings-feedback is-error" role="alert">{error}</p>}
        {notice && <p className="settings-feedback" role="status"><Check size={14} />{notice}</p>}
      </main>
    </div>
  </section>
}

function SettingsFields({ section, values, configured, updateField }: {
  section: TenantSettingSection
  values: Record<string, string | number | boolean>
  configured: string[]
  updateField: (section: string, key: string, value: string | number | boolean) => void
}) {
  const fields = section.fields
  const termsField = section.id === 'hotspot' ? fields.find((field) => field.key === 'termsRequired') : undefined
  const regularFields = termsField ? fields.filter((field) => field !== termsField && field.key !== 'termsText') : fields
  return <>
    <section className="settings-card"><h2>{section.label === 'Branding' ? 'Identity' : section.label === 'Hotspot' ? 'Portal experience' : 'Configuration'}</h2><p>{section.status}</p><div className="settings-form">{regularFields.map((field) => <SettingInput key={field.key} field={field} value={values[field.key]} configured={configured.includes(field.key)} onChange={(value) => updateField(section.id, field.key, value)} />)}</div></section>
    {termsField && <section className="settings-card"><h2>Terms &amp; conditions</h2><p>When enabled, subscribers must accept your terms before signing in.</p><SettingInput field={termsField} value={values[termsField.key]} configured={false} onChange={(value) => updateField(section.id, termsField.key, value)} />{fields.filter((field) => field.key === 'termsText').map((field) => <SettingInput key={field.key} field={field} value={values[field.key]} configured={configured.includes(field.key)} onChange={(value) => updateField(section.id, field.key, value)} />)}</section>}
  </>
}
