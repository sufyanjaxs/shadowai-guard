'use client'
import { useEffect } from 'react'

// Production error pages must not leak stack traces, so nothing from the error
// object is rendered here — only a reference id that is printed to the server log.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Unhandled application error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-gray-600 mb-6">
          The page could not be loaded. Your data and your extension settings are unaffected.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 font-mono mb-6">Reference: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="bg-blue-600 text-white px-5 py-2 rounded font-semibold hover:bg-blue-700"
          >
            Try again
          </button>
          <a href="/" className="border border-gray-300 px-5 py-2 rounded font-semibold hover:bg-gray-50">
            Go home
          </a>
        </div>
      </div>
    </div>
  )
}