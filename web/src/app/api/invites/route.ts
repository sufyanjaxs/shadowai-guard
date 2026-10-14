import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rateLimit'
import { getClientIp, requireAdmin } from '@/lib/auth'
import { createInviteToken, buildInviteLink, getAppUrl, inviteExpiry } from '@/lib/inviteToken'
import { sendInviteEmail } from '@/lib/email'

const createSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(['admin', 'member']).default('member'),
})

// Admins only. Tokens are minted here (CSPRNG) instead of in the browser.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { company_id: companyId } = auth.context.profile
  const ip = getClientIp(req)

  if (!(await checkRateLimit(`invite_ip_${ip}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'Too many invites from this network. Try again later.' }, { status: 429 })
  }
  if (!(await checkRateLimit(`invite_company_${companyId}`, 50, 24 * 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'Daily invite limit reached for your workspace.' }, { status: 429 })
  }

  let parsed: z.infer<typeof createSchema>
  try {
    parsed = createSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const email = parsed.email.toLowerCase()
  const role = parsed.role

  const [{ data: sub }, { count: usedSeats }] = await Promise.all([
    supabaseAdmin.from('subscriptions').select('seat_limit').eq('company_id', companyId).single(),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
  ])

  const seatLimit = sub?.seat_limit ?? 0
  if (seatLimit > 0 && usedSeats !== null && usedSeats >= seatLimit) {
    return NextResponse.json(
      { error: `Seat limit reached (${seatLimit}). Upgrade the plan to invite more people.` },
      { status: 409 }
    )
  }

  // One live invite per address: re-sending replaces the old token rather than
  // leaving a second valid link in someone's inbox.
  await supabaseAdmin
    .from('invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('email', email)
    .is('accepted_at', null)

  const token = createInviteToken()
  const { error } = await supabaseAdmin.from('invites').insert({
    company_id: companyId,
    email,
    role,
    token,
    invited_by: auth.context.user.id,
    expires_at: inviteExpiry(),
  })

  if (error) {
    console.error('Invite insert failed:', error.message)
    return NextResponse.json({ error: 'Could not create the invitation. Please try again.' }, { status: 500 })
  }

  const link = buildInviteLink(token)
  const { data: company } = await supabaseAdmin.from('companies').select('name').eq('id', companyId).single()
  const emailResult = await sendInviteEmail({
    to: email,
    companyName: company?.name || 'Your company',
    inviteUrl: link,
    appUrl: getAppUrl(),
  })

  return NextResponse.json(
    { ok: true, link, emailed: emailResult.sent, emailNotice: emailResult.reason },
    { status: 201 }
  )
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { company_id: companyId } = auth.context.profile

  const { data, error } = await supabaseAdmin
    .from('invites')
    .select('id, email, role, expires_at, accepted_at, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('Invite list failed:', error.message)
    return NextResponse.json({ error: 'Could not load invitations.' }, { status: 500 })
  }

  return NextResponse.json({ invites: data ?? [], selfId: auth.context.user.id })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { company_id: companyId } = auth.context.profile
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing invitation id.' }, { status: 400 })

  // Scope the delete by company_id so an id from another tenant cannot be revoked.
  const { error } = await supabaseAdmin
    .from('invites')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) {
    console.error('Invite revoke failed:', error.message)
    return NextResponse.json({ error: 'Could not revoke the invitation.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}