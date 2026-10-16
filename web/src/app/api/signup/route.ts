import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/auth'
import { TRIAL_SEATS } from '@/lib/plans'
import { requiresEmailConfirmation } from '@/lib/emailVerification'

const bodySchema = z.object({
  email: z.string().email().max(320),
  // Supabase hashes this; the length floor is ours so nobody signs up with "123".
  password: z.string().min(8).max(200),
  companyName: z.string().trim().min(2).max(80),
})

// Policies seeded for every new company so the extension has something to fetch
// and the dashboard is never empty on day one.
const DEFAULT_POLICIES: [string, 'WARN' | 'REDACT' | 'BLOCK'][] = [
  ['CREDIT_CARD', 'WARN'],
  ['EMIRATES_ID', 'WARN'],
  ['IBAN', 'WARN'],
  ['EMAIL', 'REDACT'],
  ['PHONE', 'REDACT'],
  ['API_KEY', 'BLOCK'],
  ['PASSWORD', 'BLOCK'],
  ['CUSTOM_KEYWORD', 'WARN'],
]

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!(await checkRateLimit(`signup_${ip}`, 5, 15 * 60 * 1000))) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Enter a valid email, a password of 8+ characters, and a company name.' }, { status: 400 })
  }

  const { email, password, companyName } = parsed
  const needsConfirmation = requiresEmailConfirmation()

  const { data: authData, error: authError } = await getSupabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: !needsConfirmation,
  })

  if (authError || !authData.user) {
    const alreadyRegistered = /already|registered|exists/i.test(authError?.message || '')
    if (alreadyRegistered) {
      return NextResponse.json({ error: 'That email already has an account. Log in instead.' }, { status: 409 })
    }
    console.error('Signup auth error:', authError?.message)
    return NextResponse.json({ error: 'Could not create the account. Please try again.' }, { status: 400 })
  }

  const userId = authData.user.id
  let companyId: string | null = null

  try {
    const { data: company, error: companyError } = await getSupabaseAdmin()
      .from('companies')
      .insert({ name: companyName })
      .select('id')
      .single()
    if (companyError) throw companyError
    companyId = company.id

    // The auth.users trigger already inserted a profile with role 'member' and
    // no company; this promotes the first user of a new company to its admin.
    const { error: profileError } = await getSupabaseAdmin()
      .from('profiles')
      .upsert({ id: userId, company_id: companyId, role: 'admin' }, { onConflict: 'id' })
    if (profileError) throw profileError

    const { error: subError } = await getSupabaseAdmin()
      .from('subscriptions')
      .upsert(
        { company_id: companyId, plan: 'trial', status: 'trialing', seat_limit: TRIAL_SEATS },
        { onConflict: 'company_id' }
      )
    if (subError) throw subError

    const { error: policyError } = await getSupabaseAdmin()
      .from('policies')
      .upsert(
        DEFAULT_POLICIES.map(([data_type, action]) => ({ company_id: companyId!, data_type, action })),
        { onConflict: 'company_id,data_type' }
      )
    if (policyError) throw policyError
  } catch (err) {
    // Roll back so we never leave a company with no admin, or a user with no company.
    console.error('Signup provisioning failed:', err)
    if (companyId) await getSupabaseAdmin().from('companies').delete().eq('id', companyId)
    await getSupabaseAdmin().auth.admin.deleteUser(userId).catch(() => {})
    return NextResponse.json({ error: 'Could not finish setting up the workspace. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, email, requiresConfirmation: needsConfirmation }, { status: 201 })
}