'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Check } from 'lucide-react'

export default function BillingPage() {
  const [subscription, setSubscription] = useState<any>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const fetchSub = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
      if (!profile?.company_id) return
      setCompanyId(profile.company_id)

      const { data } = await supabase.from('subscriptions').select('*').eq('company_id', profile.company_id).single()
      if (data) setSubscription(data)
    }
    fetchSub()
  }, [supabase])

  const handleCheckout = async (priceId: string) => {
    setLoading(true)
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId })
    })
    const { url } = await res.json()
    if (url) window.location.href = url
    setLoading(false)
  }

  const handlePortal = async () => {
    setLoading(true)
    const res = await fetch('/api/portal', { method: 'POST' })
    const { url } = await res.json()
    if (url) window.location.href = url
    setLoading(false)
  }

  const plans = [
    { name: 'Starter', price: '$99', seats: 25, priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER || 'price_starter_placeholder', features: ['25 User Seats', 'All AI Tools', 'Email Support'] },
    { name: 'Business', price: '$249', seats: 100, priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS || 'price_business_placeholder', features: ['100 User Seats', 'All AI Tools', 'Priority Support', 'Custom Keywords'] }
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Billing & Subscription</h2>
      
      {subscription?.status === 'active' ? (
        <div className="bg-white p-6 rounded-xl shadow mb-8">
          <h3 className="font-semibold mb-2">Current Plan</h3>
          <p className="text-gray-600 mb-4">You are currently on the <strong>{subscription.plan}</strong> plan with <strong>{subscription.seat_limit}</strong> seats.</p>
          <button onClick={handlePortal} disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700 transition disabled:opacity-50">
            Manage Subscription
          </button>
        </div>
      ) : (
        <div className="bg-blue-50 p-6 rounded-xl shadow mb-8 border border-blue-200">
          <h3 className="font-semibold mb-2 text-blue-800">No Active Subscription</h3>
          <p className="text-blue-600">Choose a plan below to activate ShadowAI Guard for your team.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {plans.map(plan => (
          <div key={plan.name} className="bg-white p-8 rounded-xl shadow border-2 border-transparent hover:border-blue-500 transition">
            <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
            <p className="text-3xl font-bold mb-4">{plan.price}<span className="text-sm font-normal text-gray-500">/mo</span></p>
            <ul className="space-y-2 mb-6">
              {plan.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-gray-600"><Check size={16} className="text-green-500" /> {f}</li>
              ))}
            </ul>
            <button 
              onClick={() => handleCheckout(plan.priceId)} 
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700 transition disabled:opacity-50"
            >
              {subscription?.status === 'active' ? 'Switch Plan' : 'Subscribe'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
