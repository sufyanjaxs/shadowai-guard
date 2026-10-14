#!/usr/bin/env node
/**
 * Activates or changes a workspace plan without a payment provider.
 *
 *   node scripts/set-plan.mjs <admin-email> starter|business [seats]
 *   node scripts/set-plan.mjs --list
 *
 * Used when a customer pays by bank transfer / invoice: the operator runs one
 * command instead of touching the database by hand. Reads web/.env.local for the
 * service-role key.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SEATS = { starter: 25, business: 100 }

function parseEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...parseEnv(resolve(HERE, '..', '.env.local')), ...process.env }
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey || url.includes('placeholder')) {
  console.error('web/.env.local needs a real NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(2)
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

async function listCompanies() {
  const { data: companies, error } = await db
    .from('companies')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error

  // One page of users is enough to label workspaces with their admin's email.
  const { data: userPage } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const emailById = new Map((userPage?.users ?? []).map((u) => [u.id, u.email]))

  for (const company of companies ?? []) {
    const { data: admins } = await db
      .from('profiles')
      .select('id')
      .eq('company_id', company.id)
      .eq('role', 'admin')

    const { data: sub } = await db
      .from('subscriptions')
      .select('plan, status, seat_limit')
      .eq('company_id', company.id)
      .maybeSingle()

    const adminEmail = (admins ?? []).map((a) => emailById.get(a.id)).filter(Boolean).join(', ') || '-'
    console.log(
      `${company.id}  ${String(company.name).padEnd(24)}  ${adminEmail.padEnd(34)}  ${sub?.plan ?? '-'} / ${sub?.status ?? '-'} / ${sub?.seat_limit ?? 0} seats`
    )
  }
}

async function setPlan(email, plan, seatsOverride) {
  const planKey = plan.toLowerCase()
  if (!SEATS[planKey]) {
    console.error(`Unknown plan "${plan}". Use starter or business.`)
    process.exit(2)
  }

  // The admin's profile is the link from an auth user to a company.
  const { data: list, error: listError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) throw listError
  const user = (list?.users ?? []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
  if (!user) {
    console.error(`No account found for ${email}.`)
    process.exit(1)
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single()
  if (profileError || !profile?.company_id) {
    console.error(`${email} is not attached to a company.`)
    process.exit(1)
  }

  const seatLimit = Number(seatsOverride) || SEATS[planKey]
  const { error } = await db.from('subscriptions').upsert(
    {
      company_id: profile.company_id,
      plan: planKey,
      status: 'active',
      seat_limit: seatLimit,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: 'company_id' }
  )
  if (error) throw error

  console.log(
    `Activated ${planKey} (${seatLimit} seats) for ${email} → company ${profile.company_id}.`
  )
}

const [first, second, third] = process.argv.slice(2)

try {
  if (!first || first === '--list') {
    await listCompanies();
  } else {
    await setPlan(first, second || 'starter', third);
  }
} catch (err) {
  console.error('Failed:', err.message);
  process.exit(1);
}