'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Invite {
  id: string
  email: string
  role: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export default function TeamPage() {
  const [members, setMembers] = useState<any[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [selfId, setSelfId] = useState<string>('')
  const [seatLimit, setSeatLimit] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastLink, setLastLink] = useState('')
  const supabase = createClient()

  const loadInvites = useCallback(async () => {
    const res = await fetch('/api/invites')
    if (res.ok) {
      const data = await res.json()
      setInvites(data.invites ?? [])
    }
  }, [])

  useEffect(() => {
    const fetchTeam = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id, role')
        .eq('id', session.user.id)
        .single()
      if (!profile?.company_id) return
      setCompanyId(profile.company_id)
      setRole(profile.role)

      // Members, seats and "who am I" all come from the admin-authorised route, so
      // the table and the management controls cannot disagree.
      const res = await fetch('/api/team')
      if (res.ok) {
        const data = await res.json()
        setMembers(data.members ?? [])
        setSelfId(data.selfId ?? session.user.id)
        setSeatLimit(data.seatLimit ?? null)
      } else {
        const { data } = await supabase
          .from('profiles')
          .select('id, role, created_at')
          .eq('company_id', profile.company_id)
        if (data) {
          setMembers(data)
          setSelfId(session.user.id)
        }
      }
    }
    fetchTeam()
    loadInvites()
  }, [supabase, loadInvites])

  const handleInvite = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    setLastLink('')

    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || 'Could not create the invitation.')
        setBusy(false)
        return
      }

      setInviteEmail('')
      setLastLink(data.link ?? '')
      setNotice(
        data.emailed
          ? `Invitation sent to ${inviteEmail}.`
          : 'Email is not configured on this deployment — copy the link below and send it yourself.'
      )
      loadInvites()
    } catch {
      setError('Network error. Please try again.')
    }

    setBusy(false)
  }

  const handleRevoke = async (id: string) => {
    setError('')
    const res = await fetch(`/api/invites?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Could not revoke the invitation.')
      return
    }
    loadInvites()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(lastLink)
      setNotice('Link copied to clipboard.')
    } catch {
      setError('Could not copy automatically — select the link and copy it manually.')
    }
  }

  const changeRole = async (userId: string, role: 'admin' | 'member') => {
    setError('')
    setNotice('')
    const res = await fetch(`/api/team/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Could not change that role.')
      return
    }
    setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, role } : m)))
    setNotice('Role updated.')
  }

  const removeMember = async (userId: string) => {
    setError('')
    setNotice('')
    if (!window.confirm('Remove this person from the workspace? Their seat is released immediately and they lose access to your policies and event history.')) {
      return
    }
    const res = await fetch(`/api/team/${userId}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Could not remove that member.')
      return
    }
    setMembers((prev) => prev.filter((m) => m.id !== userId))
    setNotice('Member removed and seat released.')
  }

  const isAdmin = role === 'admin'
  const pendingInvites = invites.filter((i) => !i.accepted_at)

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="text-2xl font-bold">Team Management</h2>
        <p className="text-sm text-gray-500">
          {members.length} member{members.length === 1 ? '' : 's'}
          {seatLimit ? ` of ${seatLimit} seats used` : ''}
        </p>
      </div>

      {isAdmin ? (
        <div className="bg-white p-6 rounded-xl shadow mb-8">
          <h3 className="font-semibold mb-4">Invite Team Member</h3>
          <div className="flex gap-3">
            <input
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 border rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
              className="border rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={handleInvite}
              disabled={busy || !inviteEmail}
              className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700 transition disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create Invite'}
            </button>
          </div>

          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          {notice && <p className="text-green-600 text-sm mt-3">{notice}</p>}

          {lastLink && (
            <div className="mt-4 flex gap-2">
              <input
                readOnly
                value={lastLink}
                className="flex-1 border rounded p-2 bg-gray-50 text-xs font-mono"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button onClick={copyLink} className="border rounded px-4 py-2 text-sm font-semibold hover:bg-gray-50">
                Copy
              </button>
            </div>
          )}

          {pendingInvites.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2">Pending invitations</h4>
              <ul className="divide-y divide-gray-100">
                {pendingInvites.map((invite) => (
                  <li key={invite.id} className="py-2 flex items-center justify-between text-sm">
                    <span>
                      {invite.email}{' '}
                      <span className="text-gray-400">({invite.role})</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-gray-400 text-xs">
                        expires {new Date(invite.expires_at).toLocaleDateString()}
                      </span>
                      <button onClick={() => handleRevoke(invite.id)} className="text-red-500 hover:text-red-700 text-xs font-semibold">
                        Revoke
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500 mb-8">Only admins can invite teammates.</p>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
              {isAdmin && (
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Manage</th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                  {m.id.substring(0, 8)}...
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      m.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {m.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(m.created_at).toLocaleDateString()}
                </td>
                {isAdmin && (
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    {m.id === selfId ? (
                      <span className="text-xs text-gray-400">You</span>
                    ) : (
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => changeRole(m.id, m.role === 'admin' ? 'member' : 'admin')}
                          className="text-blue-600 hover:text-blue-800 text-xs font-semibold"
                        >
                          Make {m.role === 'admin' ? 'member' : 'admin'}
                        </button>
                        <button
                          onClick={() => removeMember(m.id)}
                          className="text-red-500 hover:text-red-700 text-xs font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}