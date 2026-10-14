import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth'

// Full member list for admins. The Team page reads this instead of querying
// Supabase directly, so authorization lives in one place and the UI never has to
// guess whether a member id is complete.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const companyId = auth.context.profile.company_id!

  const [{ data: members, error: membersError }, { data: subscription }] = await Promise.all([
    getSupabaseAdmin()
      .from('profiles')
      .select('id, role, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true }),
    getSupabaseAdmin()
      .from('subscriptions')
      .select('seat_limit')
      .eq('company_id', companyId)
      .maybeSingle(),
  ])

  if (membersError) {
    console.error('Team list failed:', membersError.message)
    return NextResponse.json({ error: 'Could not load your team.' }, { status: 500 })
  }

  return NextResponse.json({
    members: members ?? [],
    selfId: auth.context.user.id,
    seatsUsed: members?.length ?? 0,
    seatLimit: subscription?.seat_limit ?? null,
  })
}