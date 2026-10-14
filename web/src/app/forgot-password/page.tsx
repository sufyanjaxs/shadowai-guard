'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')

    // The redirect origin comes from the browser, not from configuration, so the
    // link always points back at the deployment the user is actually on.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (resetError) {
      // Never reveal whether an address exists; show the same outcome either way.
      console.error('Password reset request failed:', resetError.message)
      setSent(true)
      setBusy(false)
      return
    }

    setSent(true)
    setBusy(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md">
        <h1 className="text-2xl font-bold text-center mb-1 text-blue-600">🛡️ ShadowAI Guard</h1>
        <p className="text-center text-gray-500 text-sm mb-6">Reset your password</p>

        {sent ? (
          <div className="text-center">
            <p className="text-gray-700 leading-relaxed">
              If an account exists for <span className="font-semibold">{email}</span>, a reset link is on its
              way. The link expires in one hour.
            </p>
            <Link href="/login" className="inline-block mt-6 text-blue-600 font-semibold">
              ← Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="Work email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
              required
              autoComplete="email"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          Remembered it?{' '}
          <Link href="/login" className="text-blue-600 font-semibold">Log in</Link>
        </p>
      </div>
    </div>
  )
}