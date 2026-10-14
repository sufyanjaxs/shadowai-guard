import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// Unauthenticated liveness/readiness probe for uptime monitoring. It checks the
// database too, because an app that cannot reach Supabase is not healthy even
// when the process is alive. No secrets are returned.
export async function GET() {
  const startedAt = Date.now()

  try {
    const { error } = await getSupabaseAdmin().from('companies').select('id', { count: 'exact', head: true })
    if (error) throw error

    return NextResponse.json(
      { status: 'ok', database: 'reachable', latencyMs: Date.now() - startedAt },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    console.error('Health check failed:', err)
    return NextResponse.json(
      { status: 'degraded', database: 'unreachable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}