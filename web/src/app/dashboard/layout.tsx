'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Shield, Users, FileText, LogOut, CreditCard } from 'lucide-react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) router.push('/login')
    }
    checkUser()
  }, [supabase, router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const links = [
    { href: '/dashboard', label: 'Overview', icon: Shield },
    { href: '/dashboard/policies', label: 'Policies', icon: FileText },
    { href: '/dashboard/team', label: 'Team', icon: Users },
    { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  ]

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold text-blue-600">🛡️ ShadowAI</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {links.map(link => {
            const Icon = link.icon
            const isActive = pathname === link.href
            return (
              <Link key={link.href} href={link.href} className={`flex items-center gap-3 px-4 py-2 rounded-lg transition ${isActive ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>
                <Icon size={20} />
                {link.label}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t">
          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg w-full">
            <LogOut size={20} />
            Log Out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  )
}
