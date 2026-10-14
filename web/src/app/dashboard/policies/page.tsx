'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const DATA_TYPES = ['CREDIT_CARD', 'EMIRATES_ID', 'IBAN', 'EMAIL', 'PHONE', 'API_KEY', 'PASSWORD', 'CUSTOM_KEYWORD']
const ACTIONS = ['WARN', 'REDACT', 'BLOCK']

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Record<string, string>>({})
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const fetchPolicies = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
      if (!profile?.company_id) return
      setCompanyId(profile.company_id)

      const { data } = await supabase.from('policies').select('data_type, action').eq('company_id', profile.company_id)
      if (data) {
        const map: Record<string, string> = {}
        data.forEach(p => map[p.data_type] = p.action)
        setPolicies(map)
      }
    }
    fetchPolicies()
  }, [supabase])

  const handleSave = async () => {
    if (!companyId) return
    const rows = Object.entries(policies).map(([data_type, action]) => ({
      company_id: companyId,
      data_type,
      action
    }))
    
    const { error } = await supabase.from('policies').upsert(rows, { onConflict: 'company_id,data_type' })
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Security Policies</h2>
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {DATA_TYPES.map(type => (
              <tr key={type}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{type.replace('_', ' ')}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <select 
                    value={policies[type] || 'WARN'} 
                    onChange={e => setPolicies({...policies, [type]: e.target.value})}
                    className="border rounded p-1 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 flex items-center gap-4">
        <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700 transition">Save Policies</button>
        {saved && <span className="text-green-600 font-semibold">Saved! Click "Sync Policy" in the extension to apply.</span>}
      </div>
    </div>
  )
}
