'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Building2, Check, ChevronDown, CircleAlert, Globe2, RefreshCw, Router, ShieldCheck, UserPlus, Users, Wifi } from 'lucide-react'

type PlatformTenant = {
  id: string
  name: string
  slug: string
  status: string
  createdAt: string
  memberCount: number
  siteCount: number
  subscriberCount: number
  routerCount: number
}

type PlatformMember = {
  id: string
  userId: string
  name: string
  email: string
  emailVerified: boolean
  role: string
  createdAt: string
}

type PlatformData = {
  tenants: PlatformTenant[]
  summary: {
    tenantCount: number
    activeTenantCount: number
    memberCount: number
    siteCount: number
    subscriberCount: number
    routerCount: number
  }
  selectedTenant: { tenant: PlatformTenant; members: PlatformMember[] } | null
}

const emptySummary = { tenantCount: 0, activeTenantCount: 0, memberCount: 0, siteCount: 0, subscriberCount: 0, routerCount: 0 }

async function readApiError(response: Response, fallback: string) {
  const result = await response.json().catch(() => ({})) as { error?: string }
  return result.error || fallback
}

function count(value: number) {
  return new Intl.NumberFormat().format(value)
}

function date(value: string) {
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString() : '—'
}

export function PlatformAdminDashboard({ adminEmail }: { adminEmail: string }) {
  const [data, setData] = useState<PlatformData>({ tenants: [], summary: emptySummary, selectedTenant: null })
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState('member')

  const load = useCallback(async (tenantId = '') => {
    setLoading(true)
    setError('')
    try {
      const queryString = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''
      const response = await fetch(`/api/platform-admin${queryString}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(await readApiError(response, 'Unable to load platform data.'))
      const result = await response.json() as PlatformData
      setData(result)
      if (tenantId && !result.selectedTenant) setSelectedTenantId('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load platform data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load('')
  }, [load])

  useEffect(() => {
    if (selectedTenantId) void load(selectedTenantId)
  }, [load, selectedTenantId])

  const filteredTenants = useMemo(() => {
    const term = query.trim().toLowerCase()
    return data.tenants.filter((tenant) => !term ||
      `${tenant.name} ${tenant.slug} ${tenant.status}`.toLowerCase().includes(term))
  }, [data.tenants, query])

  const selectedTenant = data.selectedTenant
  const refresh = () => void load(selectedTenantId)

  async function openWorkspace(tenant: PlatformTenant) {
    if (tenant.status !== 'active') {
      setError('Reactivate this workspace before opening it.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/auth/switch-tenant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant.id }),
      })
      if (!response.ok) throw new Error(await readApiError(response, 'Unable to open this workspace.'))
      window.location.assign('/')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to open this workspace.')
      setBusy(false)
    }
  }

  async function createTenant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/platform-admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, slug, ownerEmail }),
      })
      if (!response.ok) throw new Error(await readApiError(response, 'Unable to create workspace.'))
      const result = await response.json() as { id: string }
      setName('')
      setSlug('')
      setOwnerEmail('')
      setCreateOpen(false)
      setSelectedTenantId(result.id)
      setNotice('Workspace created and assigned to its verified owner.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create workspace.')
    } finally {
      setBusy(false)
    }
  }

  async function updateTenantStatus(tenant: PlatformTenant) {
    const status = tenant.status === 'active' ? 'suspended' : 'active'
    const action = status === 'suspended' ? 'suspend' : 'reactivate'
    if (!window.confirm(`${action === 'suspend' ? 'Suspend' : 'Reactivate'} ${tenant.name}? ${status === 'suspended' ? 'Users will no longer be able to access this workspace.' : 'Workspace members will be able to sign in again.'}`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/platform-admin/tenants/${encodeURIComponent(tenant.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) throw new Error(await readApiError(response, `Unable to ${action} workspace.`))
      setNotice(`Workspace ${status === 'active' ? 'reactivated' : 'suspended'}.`)
      await load(selectedTenantId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Unable to ${action} workspace.`)
    } finally {
      setBusy(false)
    }
  }

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTenant) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/platform-admin/tenants/${encodeURIComponent(selectedTenant.tenant.id)}/members`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: memberEmail, role: memberRole }),
      })
      if (!response.ok) throw new Error(await readApiError(response, 'Unable to add workspace member.'))
      setMemberEmail('')
      setNotice('Verified account added to the workspace.')
      await load(selectedTenant.tenant.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to add workspace member.')
    } finally {
      setBusy(false)
    }
  }

  async function updateMemberRole(member: PlatformMember, role: string) {
    if (!selectedTenant) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/platform-admin/tenants/${encodeURIComponent(selectedTenant.tenant.id)}/members/${encodeURIComponent(member.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!response.ok) throw new Error(await readApiError(response, 'Unable to update member role.'))
      setNotice(`Updated ${member.email} to ${role}.`)
      await load(selectedTenant.tenant.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update member role.')
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(member: PlatformMember) {
    if (!selectedTenant || !window.confirm(`Remove ${member.email} from ${selectedTenant.tenant.name}? Their sessions for this workspace will be revoked.`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/platform-admin/tenants/${encodeURIComponent(selectedTenant.tenant.id)}/members/${encodeURIComponent(member.id)}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(await readApiError(response, 'Unable to remove workspace member.'))
      setNotice('Member removed and workspace sessions revoked.')
      await load(selectedTenant.tenant.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to remove workspace member.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="platform-admin">
      <header className="platform-admin-header">
        <a className="platform-back-link" href="/"><ArrowLeft size={15} /> Workspace dashboard</a>
        <div className="platform-admin-identity"><ShieldCheck size={15} /> Platform owner <span>{adminEmail}</span></div>
      </header>
      <section className="platform-admin-body">
        <div className="platform-title-row">
          <div><div className="platform-eyebrow"><ShieldCheck size={14} /> PLATFORM CONTROL</div><h1>System administration</h1><p>Manage ISP workspaces, access, and platform health from one place.</p></div>
          <div className="platform-title-actions">
            <button type="button" className="platform-button secondary" onClick={refresh} disabled={loading}><RefreshCw size={15} className={loading ? 'platform-spin' : ''} /> Refresh</button>
            <button type="button" className="platform-button primary" onClick={() => setCreateOpen((open) => !open)}><Building2 size={15} /> New workspace</button>
          </div>
        </div>
        {error && <p className="platform-alert error" role="alert"><CircleAlert size={16} />{error}</p>}
        {notice && <p className="platform-alert success" role="status"><Check size={16} />{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></p>}
        {createOpen && <form className="platform-create panel" onSubmit={(event) => void createTenant(event)}>
          <div><h2>Create ISP workspace</h2><p>The initial owner must already have a verified account. No billing data is changed here.</p></div>
          <div className="platform-form-grid">
            <label>ISP / workspace name<input required minLength={2} maxLength={80} value={name} onChange={(event) => { const nextName = event.target.value; setName(nextName); if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) setSlug(nextName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63)) }} placeholder="Acme Internet" /></label>
            <label>Workspace slug<input required pattern="[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?" maxLength={63} value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} placeholder="acme-internet" /></label>
            <label className="platform-form-wide">Verified owner account email<input required type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} placeholder="owner@example.com" /><small>New owners must sign up and verify their account before you can assign them.</small></label>
          </div>
          <div className="platform-form-actions"><button type="button" className="platform-button secondary" onClick={() => setCreateOpen(false)}>Cancel</button><button type="submit" className="platform-button primary" disabled={busy}>{busy ? 'Creating…' : 'Create workspace'}</button></div>
        </form>}
        <div className="platform-metrics">
          <article><Building2 size={17} /><span>ISP workspaces</span><strong>{count(data.summary.tenantCount)}</strong><small>{count(data.summary.activeTenantCount)} active</small></article>
          <article><Users size={17} /><span>Workspace members</span><strong>{count(data.summary.memberCount)}</strong><small>Across active and suspended workspaces</small></article>
          <article><Globe2 size={17} /><span>ISP sites</span><strong>{count(data.summary.siteCount)}</strong><small>Aggregate count only</small></article>
          <article><Wifi size={17} /><span>Subscribers</span><strong>{count(data.summary.subscriberCount)}</strong><small>No subscriber records exposed</small></article>
          <article><Router size={17} /><span>Enabled routers</span><strong>{count(data.summary.routerCount)}</strong><small>Registered across workspaces</small></article>
        </div>
        <div className="platform-admin-columns">
          <section className="platform-panel panel">
            <div className="platform-panel-heading"><div><h2>ISP workspaces</h2><p>Workspace-level metadata and operational totals.</p></div><label className="platform-filter">Filter<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or slug" /></label></div>
            {loading && !data.tenants.length ? <p className="platform-empty">Loading workspaces…</p> : filteredTenants.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Workspace</th><th>Status</th><th>Members</th><th>Sites</th><th>Subscribers</th><th>Routers</th><th>Created</th><th></th></tr></thead><tbody>
              {filteredTenants.map((tenant) => <tr key={tenant.id} className={tenant.id === selectedTenantId ? 'selected' : ''}>
                <td><button type="button" className="platform-tenant-select" onClick={() => setSelectedTenantId(tenant.id)}><strong>{tenant.name}</strong><small>{tenant.slug}</small></button></td>
                <td><span className={`platform-status ${tenant.status === 'active' ? 'active' : 'suspended'}`}>{tenant.status}</span></td>
                <td>{count(tenant.memberCount)}</td><td>{count(tenant.siteCount)}</td><td>{count(tenant.subscriberCount)}</td><td>{count(tenant.routerCount)}</td><td>{date(tenant.createdAt)}</td>
                <td>
                  <button type="button" className="platform-inline-action" disabled={busy || tenant.status !== 'active'} onClick={() => void openWorkspace(tenant)}>Open</button>
                  {' '}
                  <button type="button" className={`platform-inline-action ${tenant.status === 'active' ? 'suspend' : ''}`} disabled={busy} onClick={() => void updateTenantStatus(tenant)}>{tenant.status === 'active' ? 'Suspend' : 'Reactivate'}</button>
                </td>
              </tr>)}
            </tbody></table></div> : <p className="platform-empty">{query ? 'No workspaces match this filter.' : 'No tenant workspaces yet.'}</p>}
          </section>
          <section className="platform-panel panel">
            {!selectedTenant ? <div className="platform-detail-empty"><Building2 size={22} /><h2>Tenant support view</h2><p>Select a workspace to review its metadata, members, subscriber totals, and operational controls. The system administrator can open any active workspace.</p><button className="platform-button secondary" type="button" onClick={() => { const first = data.tenants[0]; if (first) setSelectedTenantId(first.id) }}>Select a workspace <ChevronDown size={14} /></button></div> : <>
              <div className="platform-detail-heading"><div><span className={`platform-status ${selectedTenant.tenant.status === 'active' ? 'active' : 'suspended'}`}>{selectedTenant.tenant.status}</span><h2>{selectedTenant.tenant.name}</h2><p>{selectedTenant.tenant.slug} · created {date(selectedTenant.tenant.createdAt)}</p></div><div className="platform-detail-actions"><button type="button" className="platform-button primary" disabled={busy || selectedTenant.tenant.status !== 'active'} onClick={() => void openWorkspace(selectedTenant.tenant)}>Open workspace</button><button type="button" className="platform-button secondary" onClick={() => setSelectedTenantId('')} aria-label="Close tenant support view">Close</button></div></div>
              <div className="platform-tenant-stats"><span><strong>{count(selectedTenant.tenant.siteCount)}</strong> sites</span><span><strong>{count(selectedTenant.tenant.subscriberCount)}</strong> subscribers</span><span><strong>{count(selectedTenant.tenant.routerCount)}</strong> routers</span></div>
              <div className="platform-members-heading"><div><h3>Workspace access</h3><p>Verified accounts and assigned workspace roles.</p></div><span>{selectedTenant.members.length} members</span></div>
              <form className="platform-add-member" onSubmit={(event) => void addMember(event)}><label className="visually-hidden" htmlFor="platform-member-email">Verified account email</label><input id="platform-member-email" type="email" required value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="Verified account email" /><label className="visually-hidden" htmlFor="platform-member-role">Workspace role</label><select id="platform-member-role" value={memberRole} onChange={(event) => setMemberRole(event.target.value)}><option value="member">Member</option><option value="admin">Admin</option><option value="owner">Owner</option></select><button type="submit" className="platform-button primary" disabled={busy}><UserPlus size={14} /> Add</button></form>
              <div className="platform-member-list">{selectedTenant.members.map((member) => <article className="platform-member" key={member.id}><div className="platform-member-avatar">{member.name.slice(0, 1).toUpperCase()}</div><div className="platform-member-copy"><strong>{member.name}</strong><span>{member.email}{!member.emailVerified && ' · unverified'}</span></div><label className="visually-hidden" htmlFor={`role-${member.id}`}>Role for {member.email}</label><select id={`role-${member.id}`} value={member.role} disabled={busy || !member.emailVerified} onChange={(event) => void updateMemberRole(member, event.target.value)}><option value="owner">Owner</option><option value="admin">Admin</option><option value="member">Member</option></select><button type="button" className="platform-remove-member" disabled={busy} onClick={() => void removeMember(member)} aria-label={`Remove ${member.email}`}>Remove</button></article>)}
                {!selectedTenant.members.length && <p className="platform-empty">No members assigned.</p>}
              </div>
            </>}
          </section>
        </div>
        <p className="platform-privacy-note"><ShieldCheck size={14} /> Platform access is limited to approved owner emails. This support view shows workspace metadata and counts only; it does not expose ISP subscriber or payment records.</p>
      </section>
    </main>
  )
}
