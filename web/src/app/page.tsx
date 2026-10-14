import Link from 'next/link'
import { Shield, Zap, Lock, Eye, ArrowRight } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <nav className="border-b px-6 py-4 flex justify-between items-center max-w-6xl mx-auto">
        <div className="flex items-center gap-2 text-xl font-bold text-blue-600">
          <Shield size={24} /> ShadowAI Guard
        </div>
        <div className="flex gap-4">
          <Link href="/scanner" className="text-gray-600 hover:text-blue-600 font-medium">Risk Scanner</Link>
          <Link href="/login" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700">Login</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Stop employees from leaking <br/>
          <span className="text-blue-600">sensitive data</span> to AI.
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
          ShadowAI Guard is a universal, privacy-first Data Loss Prevention (DLP) tool that protects your business across ChatGPT, Claude, Gmail, and every web form. 100% local detection. Zero data sent to our servers.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/signup" className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 flex items-center gap-2">
            Start Free Trial <ArrowRight size={18} />
          </Link>
          <Link href="/scanner" className="border border-gray-300 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50 flex items-center gap-2">
            Take AI Risk Scanner
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-3 gap-8">
        <div className="p-6 rounded-xl border hover:shadow-lg transition">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4"><Lock size={24} /></div>
          <h3 className="text-xl font-bold mb-2">100% Local Detection</h3>
          <p className="text-gray-600">Sensitive text never leaves the browser. We only report metadata (counts and types) to your dashboard, ensuring strict UAE PDPL and GDPR compliance.</p>
        </div>
        <div className="p-6 rounded-xl border hover:shadow-lg transition">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4"><Zap size={24} /></div>
          <h3 className="text-xl font-bold mb-2">Universal Protection</h3>
          <p className="text-gray-600">Not just for AI. Protect data across ChatGPT, Claude, Copilot, Gmail, Slack, Jira, and any web form your team uses.</p>
        </div>
        <div className="p-6 rounded-xl border hover:shadow-lg transition">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4"><Eye size={24} /></div>
          <h3 className="text-xl font-bold mb-2">Instant Redact & Block</h3>
          <p className="text-gray-600">Automatically redact emails and phone numbers, or block API keys and passwords before they ever reach the AI model.</p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-50 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">How exposed is your company?</h2>
        <p className="text-gray-600 mb-8">Take our 1-minute AI Leak Risk Scanner to find out your score.</p>
        <Link href="/scanner" className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 inline-flex items-center gap-2">
          Launch Risk Scanner <ArrowRight size={18} />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-sm text-gray-500">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <span>© 2026 ShadowAI Guard. Built for the UAE &amp; Europe.</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-blue-600">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-blue-600">Terms of Service</Link>
            <Link href="/scanner" className="hover:text-blue-600">Risk Scanner</Link>
            <Link href="/login" className="hover:text-blue-600">Login</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
