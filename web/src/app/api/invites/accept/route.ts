import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabase } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/auth'
import { isValidInviteToken } from '@/lib/inviteToken'

const bodySchema = z.object({
  token: z.string().min(1).max(200),
  // Only needed when redeeming an invite for an account that does not exist yet.
  password: z.string().min(8).max(200).optional(),
})

const REASON_STATUS: Record<string, number> = {
  invalid: 404,
  used: 409,
  expired: 410,
  no_seats: 409,
}

const REASON_MESSAGE: Record<string, string> = {
  invalid: 'This invitation link is not valid.',
  used: 'This invitation has already been used.',
  expired: 'This invitation has expired. Ask your admin to send a new one.',
  no_seats: 'Your company has no free seats left. Ask your admin to upgrade the plan.',
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!(await checkRateLimit(`invite_accept_${ip}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { token, password } = parsed
  if (!isValidInviteToken(token)) {
    return NextResponse.json({ error: REASON_MESSAGE.invalid }, { status: 404 })
  }

  const { data: invite } = await supabaseAdmin
    .from('invites')
    .select('id, email, company_id, role, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ error: REASON_MESSAGE.invalid }, { status: 404 })
  }
  if (invite.accepted_at) {
    return NextResponse.json({ error: REASON_MESSAGE.used }, { status: 409 })
  }
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: REASON_MESSAGE.expired }, { status: 410 })
  }

  // Path A: the invitee already has a session (they logged in first).
  const supabase = createServerSupabase()
  const { data: { user: sessionUser } } = await supabase.auth.getUser()

  let userId = sessionUser?.id ?? null
  let createdUser = false

  if (userId) {
    if ((sessionUser!.email || '').toLowerCase() !== invite.email.toLowerCase()) {
      return NextResponse.json(
        { error: `This invitation was sent to ${invite.email}. Log in with that address.` },
        { status: 403 }
      )
    }
  } else {
    // Path B: first time here, so create the account for the invited address.
    if (!password) {
      return NextResponse.json({ error: 'Choose a password to finish joining.' }, { status: 400 })
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
    })

    if (createError || !created?.user) {
      if (/already|registered|exists/i.test(createError?.message || '')) {
        return NextResponse.json(
          {
            error: 'This address already has an account. Log in, then reopen this link to finish joining.',
            code: 'account_exists',
          },
          { status: 409 }
        )
      }
      console.error('Invite signup failed:', createError?.message)
      return NextResponse.json({ error: 'Could not create the account. Please try again.' }, { status: 400 })
    }

    userId = created.user.id
    createdUser = true
  }

  const { data: result, error: claimError } = await supabaseAdmin.rpc('claim_invite', {
    p_token: token,
    p_user_id: userId,
  })

  if (claimError) {
    if (createdUser && userId) await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {})
    console.error('claim_invite failed:', claimError.message)
    return NextResponse.json({ error: 'Could not join the workspace. Please try again.' }, { status: 500 })
  }

  const outcome = result as { ok: boolean; reason?: string } | null

  if (!outcome?.ok) {
    if (createdUser && userId) await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {})
    const reason = outcome?.reason || 'invalid'
    return NextResponse.json(
      { error: REASON_MESSAGE[reason] || REASON_MESSAGE.invalid },
      { status: REASON_STATUS[reason] || 400 }
    )
  }

  // A brand-new account still has to authenticate; an existing session is already in.
  return NextResponse.json({ ok: true, needsLogin: createdUser, email: invite.email })
}