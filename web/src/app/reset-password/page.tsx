'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function ResetForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [done, setDone] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Supabase parses the recovery link's tokens out of the URL and starts a
    // session; give it a moment before deciding the link is dead.
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setHasSession(Boolean(session))
      setReady(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session))
      setReady(true)
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  if (!ready) {
    return <p className="text-center text-gray-500 text-sm">Checking your reset link…</p>
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="text-green-600 font-semibold mb-2">Password updated.</p>
        <p className="text-gray-600 text-sm">Taking you to your dashboard…</p>
      </div>
    )
  }

  if (!hasSession) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-bold mb-2">This link is no longer valid</h2>
        <p className="text-gray-600 text-sm mb-6">
          Reset links expire after an hour and can only be used once.
        </p>
        <Link href="/forgot-password" className="text-blue-600 font-semibold">
          Request a new link
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="password"
        placeholder="New password (8+ characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
        required
        minLength={8}
        autoComplete="new-password"
      />
      <input
        type="password"
        placeholder="Confirm new password"
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
        {busy ? 'Updating…' : 'Update password'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md">
        <h1 className="text-2xl font-bold text-center mb-1 text-blue-600">🛡️ ShadowAI Guard</h1>
        <p className="text-center text-gray-500 text-sm mb-6">Choose a new password</p>
        <Suspense fallback={<p className="text-center text-gray-500 text-sm">Loading…</p>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  )
}