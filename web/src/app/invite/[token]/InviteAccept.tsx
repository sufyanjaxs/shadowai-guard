'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface Props {
  token: string
  email: string
  companyName: string
  status: 'valid' | 'used' | 'expired'
}

export default function InviteAccept({ token, email, companyName, status }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionEmail(session?.user?.email?.toLowerCase() ?? null)
    })
  }, [supabase])

  // Already signed in as the invited address: offer the one-click join instead of
  // asking for a password that would be thrown away.
  const canJoinWithSession = sessionEmail !== null && sessionEmail === email.toLowerCase()

  const join = async (withPassword: boolean) => {
    if (withPassword) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
      if (password !== confirm) {
        setError('Passwords do not match.')
        return
      }
    }

    setBusy(true)
    setError('')

    try {
      const res = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: withPassword ? password : undefined }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || 'Could not complete the invitation.')
        setBusy(false)
        return
      }

      if (data.needsLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) {
          setError('Account created. Please log in to finish.')
          setBusy(false)
          return
        }
      }

      router.push('/dashboard')
    } catch {
      setError('Network error. Please try again.')
      setBusy(false)
    }
  }

  if (status === 'used') {
    return (
      <div className="text-center">
        <h2 className="text-xl font-bold mb-2">This invitation was already used</h2>
        <p className="text-gray-600 text-sm">Ask your admin to send a new one if you still need access.</p>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="text-center">
        <h2 className="text-xl font-bold mb-2">This invitation expired</h2>
        <p className="text-gray-600 text-sm">Invitations are valid for 7 days. Ask your admin for a new link.</p>
      </div>
    )
  }

  if (canJoinWithSession) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-bold mb-2">Join {companyName}</h2>
        <p className="text-gray-600 text-sm mb-6">You are signed in as {email}.</p>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <button
          onClick={() => join(false)}
          disabled={busy}
          className="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Joining…' : 'Join workspace'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1 text-center">Join {companyName}</h2>
      <p className="text-gray-600 text-sm text-center mb-6">{email} was invited.</p>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          join(true)
        }}
      >
        <input
          type="password"
          placeholder="Choose a password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
          required
          minLength={8}
          autoComplete="new-password"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Creating your account…' : 'Accept invitation'}
        </button>
      </form>
    </div>
  )
}