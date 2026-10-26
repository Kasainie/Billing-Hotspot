'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { LoaderCircle, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'

type StaffMember = {
  id: string
  name: string
  email: string
  role: 'owner' | 'admin' | 'member'
  createdAt: string
}

type StaffResponse = { members?: StaffMember[]; error?: string }

async function getErrorMessage(response: Response, fallback: string) {
  try {
    const data: StaffResponse = await response.json()
    return data.error || fallback
  } catch {
    return fallback
  }
}

export function StaffManagement({ currentRole, currentEmail }: { currentRole: string; currentEmail: string }) {
  const [members, setMembers] = useState<StaffMember[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'owner' | 'admin' | 'member'>('member')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadMembers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/tenant/members', { cache: 'no-store' })
      if (!response.ok) throw new Error(await getErrorMessage(response, 'Unable to load workspace staff.'))
      const data: StaffResponse = await response.json()
      if (!Array.isArray(data.members)) throw new Error('The staff response was invalid. Refresh the page and try again.')
      setMembers(data.members)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load workspace staff.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/tenant/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role }),
      })
      if (!response.ok) throw new Error(await getErrorMessage(response, 'Unable to add this staff member.'))
      setEmail('')
      setRole('member')
      setNotice('Staff member added to this workspace.')
      await loadMembers()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to add this staff member.')
    } finally {
      setBusy(false)
    }
  }

  async function updateRole(member: StaffMember, nextRole: StaffMember['role']) {
    if (member.role === nextRole) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/tenant/members/${encodeURIComponent(member.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      })
      if (!response.ok) throw new Error(await getErrorMessage(response, 'Unable to update this staff role.'))
      setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role: nextRole } : item))
      setNotice(`${member.name}'s role updated.`)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Unable to update this staff role.'
      await loadMembers()
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(member: StaffMember) {
    if (!window.confirm(`Remove ${member.name} (${member.email}) from this workspace? They will lose access immediately.`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/tenant/members/${encodeURIComponent(member.id)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(await getErrorMessage(response, 'Unable to remove this staff member.'))
      setMembers((current) => current.filter((item) => item.id !== member.id))
      setNotice(`${member.name} was removed from this workspace.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to remove this staff member.')
    } finally {
      setBusy(false)
    }
  }

  const isOwner = currentRole === 'owner'
  const canManage = isOwner || currentRole === 'admin'

  return (
    <section className="staff-management">
      <div className="page-heading">
        <div>
          <div className="live-label"><Users size={14} /> WORKSPACE ACCESS</div>
          <h1>Staff</h1>
          <p>Manage who can access {`this workspace`} and what role they have.</p>
        </div>
      </div>

      {!canManage ? (
        <section className="panel staff-access-denied" role="status">
          <ShieldCheck size={20} />
          <div><h2>Staff management is restricted</h2><p>Ask a workspace owner or admin to manage staff access.</p></div>
        </section>
      ) : (
        <>
          <section className="panel staff-add-panel">
            <div className="staff-panel-heading">
              <div><h2>Add staff member</h2><p>Enter the email address on their verified LKTECH account.</p></div>
              <span>{members.length} {members.length === 1 ? 'member' : 'members'}</span>
            </div>
            <form className="staff-add-form" onSubmit={(event) => void addMember(event)}>
              <label>
                Account email
                <input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" disabled={busy} />
              </label>
              <label>
                Workspace role
                <select value={role} onChange={(event) => setRole(event.target.value as StaffMember['role'])} disabled={busy}>
                  <option value="member">Member</option>
                  <option value="admin" disabled={!isOwner}>Admin</option>
                  <option value="owner" disabled={!isOwner}>Owner</option>
                </select>
              </label>
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? <LoaderCircle className="staff-spinner" size={16} /> : <UserPlus size={16} />}
                Add staff
              </button>
            </form>
            <p className="staff-invite-note">They must sign up and verify their email before you can add them. Owner role changes are available to workspace owners only.</p>
          </section>

          {(error || notice) && <p className={`staff-feedback ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>{error || notice}</p>}

          <section className="panel staff-list-panel" aria-labelledby="staff-list-title">
            <div className="staff-panel-heading">
              <div><h2 id="staff-list-title">Workspace members</h2><p>Access is specific to the current workspace.</p></div>
              <button className="outline-button" type="button" onClick={() => void loadMembers()} disabled={loading || busy}>Refresh</button>
            </div>
            {loading ? (
              <p className="staff-empty"><LoaderCircle className="staff-spinner" size={16} /> Loading staff…</p>
            ) : members.length === 0 ? (
              <p className="staff-empty">No workspace members found.</p>
            ) : (
              <div className="staff-member-list">
                {members.map((member) => {
                  const isCurrentUser = member.email.toLowerCase() === currentEmail.toLowerCase()
                  const roleEditable = !busy && !isCurrentUser && isOwner
                  const removable = !busy && !isCurrentUser && (isOwner || member.role === 'member')
                  return (
                    <article className="staff-member-row" key={member.id}>
                      <div className="staff-member-avatar" aria-hidden="true">{member.name.slice(0, 1).toUpperCase()}</div>
                      <div className="staff-member-identity">
                        <strong>{member.name}{isCurrentUser ? ' (you)' : ''}</strong>
                        <span>{member.email}</span>
                      </div>
                      <label className="staff-role-control">
                        <select aria-label={`Role for ${member.email}`} value={member.role} disabled={!roleEditable} onChange={(event) => void updateRole(member, event.target.value as StaffMember['role'])}>
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                        </select>
                      </label>
                      <button className="staff-remove-button" type="button" disabled={!removable} onClick={() => void removeMember(member)} aria-label={`Remove ${member.email}`}>
                        <Trash2 size={15} /><span>Remove</span>
                      </button>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
          <p className="staff-security-note"><ShieldCheck size={15} /> Changes require your account password. You cannot remove yourself or demote the last workspace owner.</p>
        </>
      )}
    </section>
  )
}
