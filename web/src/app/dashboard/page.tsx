'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { FileText } from 'lucide-react'
import { generateComplianceReport } from '@/lib/pdfGenerator'

export default function OverviewPage() {
  const [events, setEvents] = useState<any[]>([])
  const [companyName, setCompanyName] = useState('Your Company')
  const [subscription, setSubscription] = useState<{ status?: string; plan?: string; seat_limit?: number } | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
      if (!profile?.company_id) return

      // Fetch company name for the report
      const { data: company } = await supabase.from('companies').select('name').eq('id', profile.company_id).single()
      if (company) setCompanyName(company.name)

      // Fetch events
      const { data } = await supabase.from('events').select('*').eq('company_id', profile.company_id).order('created_at', { ascending: false }).limit(500)
      if (data) setEvents(data)

      // Surfaced so a customer is never silently unenforced: a cancelled or
      // unpaid subscription drops seat_limit to 0, which stops enforcement.
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status, plan, seat_limit')
        .eq('company_id', profile.company_id)
        .maybeSingle()
      if (sub) setSubscription(sub)
    }
    fetchData()
  }, [supabase])

  const typeCounts = events.reduce((acc, e) => {
    acc[e.data_type] = (acc[e.data_type] || 0) + Number(e.count)
    return acc
  }, {} as Record<string, number>)
  const typeData = (Object.entries(typeCounts) as [string, number][]).map(([name, value]) => ({ name, value, count: value }))
  const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']

  const toolCounts = events.reduce((acc, e) => {
    acc[e.ai_tool] = (acc[e.ai_tool] || 0) + Number(e.count)
    return acc
  }, {} as Record<string, number>)
  const toolData = (Object.entries(toolCounts) as [string, number][]).map(([name, count]) => ({ name, count }))

  // 'BYPASSED' folds BLOCK_BYPASSED and WARN_BYPASSED together: both mean a user
  // chose "Send anyway" and the sensitive value really left the browser.
  const sum = (bucket: 'all' | 'BLOCK' | 'WARN' | 'BYPASSED') =>
    events
      .filter((e) => {
        if (bucket === 'all') return true
        if (bucket === 'BYPASSED') return e.action === 'BLOCK_BYPASSED' || e.action === 'WARN_BYPASSED'
        return e.action === bucket
      })
      .reduce((total, e) => total + Number(e.count), 0)

  const handleDownloadReport = () => {
    generateComplianceReport({
      companyName,
      totalEvents: sum('all'),
      blockedCount: sum('BLOCK'),
      warnedCount: sum('WARN'),
      typeBreakdown: typeData,
      toolBreakdown: toolData
    })
  }

  return (
    <div>
      {subscription?.status === 'canceled' && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Your subscription has ended.</strong> Enforcement is paused for every member until you
          reactivate a plan on the <a href="/dashboard/billing" className="underline font-semibold">Billing</a> page.
        </div>
      )}
      {(subscription?.status === 'past_due' || subscription?.status === 'unpaid') && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Payment failed.</strong> We could not charge the card on file. Update it on the{' '}
          <a href="/dashboard/billing" className="underline font-semibold">Billing</a> page to keep protection active.
        </div>
      )}
      {subscription?.status === 'trialing' && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <strong>Trial workspace.</strong> You have {subscription.seat_limit} seats. Pick a plan whenever you
          are ready on the <a href="/dashboard/billing" className="underline font-semibold">Billing</a> page.
        </div>
      )}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Security Overview</h2>
        <button onClick={handleDownloadReport} className="bg-blue-600 text-white px-4 py-2 rounded font-semibold hover:bg-blue-700 transition flex items-center gap-2">
          <FileText size={18} />
          Download Compliance Report
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow">
          <p className="text-gray-500">Total Events</p>
          <p className="text-3xl font-bold">{sum('all')}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow">
          <p className="text-gray-500">Blocked</p>
          <p className="text-3xl font-bold text-red-500">{sum('BLOCK')}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow">
          <p className="text-gray-500">Warned</p>
          <p className="text-3xl font-bold text-yellow-500">{sum('WARN')}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow">
          <p className="text-gray-500">Bypassed by user</p>
          <p className="text-3xl font-bold text-purple-500">{sum('BYPASSED')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="font-semibold mb-4">Events by Data Type</h3>
          {typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                  {typeData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-center py-12">No events yet</p>}
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="font-semibold mb-4">Top Websites</h3>
          {toolData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={toolData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-center py-12">No events yet</p>}
        </div>
      </div>
    </div>
  )
}
