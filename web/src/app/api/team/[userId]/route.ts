import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rateLimit'

const roleSchema = z.object({
  role: z.enum(['admin', 'member']),
})

type Params = { params: { userId: string } }

interface TargetProfile {
  id: string
  company_id: string | null
  role: string
}

// Guards that apply to both operations below: an admin may not edit themselves,
// and the company may never be left without an admin (that would orphan every
// policy, invoice and invite in the workspace).
type GuardResult =
  | { failure: NextResponse }
  | { failure?: undefined; target: TargetProfile; adminCount: number }

async function guard(callerId: string, targetId: string, companyId: string): Promise<GuardResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
    return { failure: NextResponse.json({ error: 'Invalid user id.' }, { status: 400 }) }
  }
  if (callerId === targetId) {
    return { failure: NextResponse.json({ error: 'You cannot change your own access.' }, { status: 400 }) }
  }

  const { data: target } = await supabaseAdmin
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', targetId)
    .maybeSingle()

  if (!target) {
    return { failure: NextResponse.json({ error: 'That user no longer exists.' }, { status: 404 }) }
  }
  // Scope by company: an id from another tenant must be indistinguishable from
  // one that does not exist.
  if (target.company_id !== companyId) {
    return { failure: NextResponse.json({ error: 'That user is not in your workspace.' }, { status: 404 }) }
  }

  const { count: adminCount } = await supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('role', 'admin')

  return { target: target as TargetProfile, adminCount: adminCount ?? 0 }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { user: caller } = auth.context
  const companyId = auth.context.profile.company_id!

  if (!(await checkRateLimit(`team_role_${caller.id}`, 30, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'Too many role changes. Try again later.' }, { status: 429 })
  }

  const { userId } = params
  const guarded = await guard(caller.id, userId, companyId)
  if (guarded.failure) return guarded.failure

  let role: 'admin' | 'member'
  try {
    role = roleSchema.parse(await req.json()).role
  } catch {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }

  if (guarded.target.role === 'admin' && role === 'member' && guarded.adminCount <= 1) {
    return NextResponse.json(
      { error: 'Promote another admin first — a workspace must keep at least one admin.' },
      { status: 409 }
    )
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ role })
    .eq('id', userId)
    .eq('company_id', companyId)

  if (error) {
    console.error('Role change failed:', error.message)
    return NextResponse.json({ error: 'Could not change that role.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, role })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { user: caller } = auth.context
  const companyId = auth.context.profile.company_id!

  if (!(await checkRateLimit(`team_remove_${caller.id}`, 30, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'Too many removals. Try again later.' }, { status: 429 })
  }

  const { userId } = params
  const guarded = await guard(caller.id, userId, companyId)
  if (guarded.failure) return guarded.failure

  if (guarded.target.role === 'admin' && guarded.adminCount <= 1) {
    return NextResponse.json(
      { error: 'Promote another admin first — a workspace must keep at least one admin.' },
      { status: 409 }
    )
  }

  // Detach rather than delete the auth account: the seat is released
  // immediately, and the person can still accept an invitation elsewhere
  // instead of losing their login.
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ company_id: null })
    .eq('id', userId)
    .eq('company_id', companyId)

  if (error) {
    console.error('Member removal failed:', error.message)
    return NextResponse.json({ error: 'Could not remove that member.' }, { status: 500 })
  }

  const { count: remaining } = await supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)

  return NextResponse.json({ ok: true, seatsUsed: remaining ?? 0 })
}