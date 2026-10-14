import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Page not found</h1>
        <p className="text-gray-600 mb-6">
          This link is invalid or has expired. If you were opening an invitation, ask your admin to send
          a new one.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/" className="bg-blue-600 text-white px-5 py-2 rounded font-semibold hover:bg-blue-700">
            Go home
          </Link>
          <Link href="/login" className="border border-gray-300 px-5 py-2 rounded font-semibold hover:bg-gray-50">
            Log in
          </Link>
        </div>
      </div>
    </div>
  )
}