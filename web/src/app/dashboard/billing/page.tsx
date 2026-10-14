'use client'
import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'

const PLANS = [
  {
    name: 'Starter',
    price: '$99',
    seats: 25,
    key: 'starter',
    features: ['25 User Seats', 'All AI Tools', 'Email Support'],
  },
  {
    name: 'Business',
    price: '$249',
    seats: 100,
    key: 'business',
    features: ['100 User Seats', 'All AI Tools', 'Priority Support', 'Custom Keywords'],
  },
]

export default function BillingPage() {
  const [subscription, setSubscription] = useState<any>(null)
  const [mode, setMode] = useState<'stripe' | 'manual'>('manual')
  const [supportEmail, setSupportEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyPlan, setBusyPlan] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [prices, setPrices] = useState<{ starter?: string; business?: string }>({})

  useEffect(() => {
    // Everything is read through the API rather than straight from Supabase, so
    // the browser never depends on the RLS policy for billing state.
    fetch('/api/billing')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return
        setMode(data.mode)
        setSubscription(data.subscription)
        setSupportEmail(data.supportEmail || '')
        setPrices(data.prices || {})
      })
      .catch(() => undefined)
  }, [])

  const handleCheckout = async (plan: (typeof PLANS)[number]) => {
    setBusyPlan(plan.key)
    setNotice('')

    if (mode === 'manual') {
      // No payment provider configured: the plan is activated by invoice, and the
      // workspace keeps working on its trial seats in the meantime.
      setNotice(
        `To activate ${plan.name} (${plan.price}/month, ${plan.seats} seats), email ${supportEmail} and we will send an invoice. ` +
          `Your ${subscription?.seat_limit ?? 25} trial seats stay active until it is paid.`
      )
      setBusyPlan(null)
      return
    }

    setLoading(true)
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: prices[plan.key as keyof typeof prices] }),
    })
    const { url } = await res.json().catch(() => ({}))
    setLoading(false)
    setBusyPlan(null)
    if (url) window.location.href = url
    else if (res.status === 400) {
      setNotice('Card checkout is not available on this deployment. Please email us to activate the plan.')
    }
  }

  const handlePortal = async () => {
    setLoading(true)
    const res = await fetch('/api/portal', { method: 'POST' })
    const { url } = await res.json().catch(() => ({}))
    if (url) window.location.href = url
    setLoading(false)
  }

  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing'

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Billing &amp; Subscription</h2>

      {isActive ? (
        <div className="bg-white p-6 rounded-xl shadow mb-8">
          <h3 className="font-semibold mb-2">Current Plan</h3>
          <p className="text-gray-600 mb-4">
            You are on the <strong>{subscription.plan}</strong> plan with{' '}
            <strong>{subscription.seat_limit}</strong> seats.
          </p>
          {mode === 'stripe' && (
            <button
              onClick={handlePortal}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700 transition disabled:opacity-50"
            >
              Manage Subscription
            </button>
          )}
        </div>
      ) : (
        <div className="bg-blue-50 p-6 rounded-xl shadow mb-8 border border-blue-200">
          <h3 className="font-semibold mb-2 text-blue-800">No Active Subscription</h3>
          <p className="text-blue-600">
            Choose a plan below to activate ShadowAI Guard for your team.
          </p>
        </div>
      )}

      {notice && (
        <div className="mb-8 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className="bg-white p-8 rounded-xl shadow border-2 border-transparent hover:border-blue-500 transition"
          >
            <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
            <p className="text-3xl font-bold mb-4">
              {plan.price}
              <span className="text-sm font-normal text-gray-500">/mo</span>
            </p>
            <ul className="space-y-2 mb-6">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-gray-600">
                  <Check size={16} className="text-green-500" /> {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleCheckout(plan)}
              disabled={loading || busyPlan === plan.key}
              className="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700 transition disabled:opacity-50"
            >
              {busyPlan === plan.key
                ? '…'
                : mode === 'manual'
                ? 'Activate by invoice'
                : isActive
                ? 'Switch Plan'
                : 'Subscribe'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}