#!/usr/bin/env node
// Proves the row-level-security claims with two real companies and two real
// logged-in users. Dashboard pages query Supabase straight from the browser, so
// the policies ARE the access control: this script is the test for them.
//
//   cd web && node scripts/rls-check.mjs
//
// It reads web/.env.local, creates two throwaway tenants with the service-role
// key, checks what each tenant's *user* session can and cannot reach, then
// deletes everything it created.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))

function loadEnv(file) {
  try {
    const text = readFileSync(file, 'utf8')
    const env = {}
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
    return env
  } catch {
    return {}
  }
}

const env = { ...loadEnv(join(here, '..', '.env.local')), ...process.env }
const url = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anonKey || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}
if (url.includes('placeholder')) {
  console.error('web/.env.local still holds placeholder credentials — there is nothing to test against.')
  process.exit(2)
}

const service = createClient(url, serviceKey, { auth: { persistSession: false } })
const results = []
let failures = 0

function check(name, condition, detail = '') {
  const ok = Boolean(condition)
  if (!ok) failures++
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function randomEmail(prefix) {
  return `rls-${prefix}-${randomBytes(4).toString('hex')}@example.com`
}

const password = `Rls!${randomBytes(9).toString('base64url')}9z`

async function provisionTenant(label) {
  const email = randomEmail(label)
  // admin.createUser resolves to { user }, not the user itself.
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  const user = data?.user
  if (error || !user?.id) throw new Error(`could not create ${label} user: ${error?.message ?? 'no user returned'}`)

  const { data: company, error: companyError } = await service
    .from('companies')
    .insert({ name: `RLS Test ${label}` })
    .select('id')
    .single()
  if (companyError) throw new Error(`could not create ${label} company: ${companyError.message}`)

  // Every provisioning write is checked: a silently failed upsert here would
  // look exactly like a broken RLS policy and send you hunting in the wrong place.
  const { error: profileError } = await service
    .from('profiles')
    .upsert({ id: user.id, company_id: company.id, role: 'admin' })
  if (profileError) throw new Error(`could not create ${label} profile: ${profileError.message}`)

  const { error: subError } = await service
    .from('subscriptions')
    .upsert(
      { company_id: company.id, plan: 'trial', status: 'trialing', seat_limit: 25 },
      { onConflict: 'company_id' }
    )
  if (subError) throw new Error(`could not create ${label} subscription: ${subError.message}`)

  const { error: policyError } = await service.from('policies').upsert(
    [
      { company_id: company.id, data_type: 'CREDIT_CARD', action: 'WARN' },
      { company_id: company.id, data_type: 'API_KEY', action: 'BLOCK' },
    ],
    { onConflict: 'company_id,data_type' }
  )
  if (policyError) throw new Error(`could not seed ${label} policies: ${policyError.message}`)

  const { error: eventError } = await service.from('events').insert({
    company_id: company.id,
    user_id: user.id,
    ai_tool: `${label}.example.com`,
    data_type: 'API_KEY',
    action: 'BLOCK',
    count: 1,
  })
  if (eventError) throw new Error(`could not seed ${label} event: ${eventError.message}`)

  return { label, email, password, userId: user.id, companyId: company.id }
}

async function tenantClient(tenant) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({
    email: tenant.email,
    password: tenant.password,
  })
  if (error) throw new Error(`could not sign in as ${tenant.label}: ${error.message}`)
  return { client, session: data.session }
}

async function main() {
  console.log('Provisioning two throwaway companies…\n')
  const alpha = await provisionTenant('alpha')
  const beta = await provisionTenant('beta')
  const created = [alpha, beta]

  try {
    const a = await tenantClient(alpha)
    const b = await tenantClient(beta)

    // --- own tenant: everything works ---
    const { data: ownProfile } = await a.client
      .from('profiles')
      .select('company_id, role')
      .eq('id', alpha.userId)
      .single()
    check('alpha reads its own profile', ownProfile?.company_id === alpha.companyId)

    const { data: ownEvents } = await a.client.from('events').select('*').eq('company_id', alpha.companyId)
    check('alpha reads its own events', (ownEvents ?? []).length === 1, `got ${ownEvents?.length ?? 0}`)

    const { data: ownPolicies } = await a.client.from('policies').select('*').eq('company_id', alpha.companyId)
    check('alpha reads its own policies', (ownPolicies ?? []).length === 2, `got ${ownPolicies?.length ?? 0}`)

    // --- other tenant: everything is invisible or refused ---
    const { data: foreignEvents, error: foreignEventsError } = await a.client
      .from('events')
      .select('*')
      .eq('company_id', beta.companyId)
    check(
      'alpha cannot read beta events',
      (foreignEvents ?? []).length === 0 || foreignEventsError,
      foreignEventsError?.message
    )

    const { data: foreignPolicies } = await a.client
      .from('policies')
      .select('*')
      .eq('company_id', beta.companyId)
    check('alpha cannot read beta policies', (foreignPolicies ?? []).length === 0, `got ${foreignPolicies?.length ?? 0}`)

    const { data: foreignCompany } = await a.client.from('companies').select('*').eq('id', beta.companyId)
    check('alpha cannot read the beta company row', (foreignCompany ?? []).length === 0)

    const { data: foreignProfiles } = await a.client
      .from('profiles')
      .select('id, role')
      .eq('company_id', beta.companyId)
    check('alpha cannot read beta team members', (foreignProfiles ?? []).length === 0)

    const { error: forgedEvent } = await a.client.from('events').insert({
      company_id: beta.companyId,
      user_id: alpha.userId,
      ai_tool: 'forged.example.com',
      data_type: 'API_KEY',
      action: 'BLOCK',
      count: 1,
    })
    check('alpha cannot forge an event into beta', Boolean(forgedEvent), forgedEvent?.message)

    const { error: forgedPolicy } = await a.client
      .from('policies')
      .upsert(
        { company_id: beta.companyId, data_type: 'PASSWORD', action: 'REDACT' },
        { onConflict: 'company_id,data_type' }
      )
    check('alpha cannot change beta policies', Boolean(forgedPolicy), forgedPolicy?.message)

    // A denied UPDATE under RLS is silent: no policy means the WHERE clause matches
// nothing, so the row must be re-read to prove nothing changed.
    await a.client
      .from('profiles')
      .update({ company_id: beta.companyId })
      .eq('id', alpha.userId)

    const { data: movedProfile } = await a.client
      .from('profiles')
      .select('company_id')
      .eq('id', alpha.userId)
      .single()
    check('alpha cannot move itself into beta', movedProfile?.company_id === alpha.companyId, `company_id = ${movedProfile?.company_id}`)

    // --- server-only tables must not be reachable at all ---
    const { data: rates, error: ratesError } = await a.client.from('rate_limits').select('*')
    check('alpha cannot read rate_limits', (rates ?? []).length === 0 || Boolean(ratesError), ratesError?.message)

    const { data: stripeEvents, error: stripeError } = await a.client.from('stripe_events').select('*')
    check('alpha cannot read the Stripe ledger', (stripeEvents ?? []).length === 0 || Boolean(stripeError), stripeError?.message)

    // --- a member (non-admin) must not manage policies ---
    const memberEmail = randomEmail('member')
    const { data: memberData, error: memberError } = await service.auth.admin.createUser({
      email: memberEmail,
      password,
      email_confirm: true,
    })
    const memberUser = memberData?.user
    if (memberError || !memberUser?.id) {
      check('member tenant provisioned', false, memberError?.message ?? 'no user returned')
    } else {
      created.push({
        label: 'member',
        email: memberEmail,
        password,
        userId: memberUser.id,
        companyId: alpha.companyId,
      })
      await service
        .from('profiles')
        .upsert({ id: memberUser.id, company_id: alpha.companyId, role: 'member' })

      const memberClient = createClient(url, anonKey, { auth: { persistSession: false } })
      const { error: signInError } = await memberClient.auth.signInWithPassword({
        email: memberEmail,
        password,
      })
      check('member can sign in', !signInError, signInError?.message)

      if (!signInError) {
        const { data: memberEvents } = await memberClient
          .from('events')
          .select('*')
          .eq('company_id', alpha.companyId)
        check('member cannot read company events (admins only)', (memberEvents ?? []).length === 0, `got ${memberEvents?.length ?? 0}`)

        const { error: memberPolicyWrite } = await memberClient
          .from('policies')
          .upsert(
            { company_id: alpha.companyId, data_type: 'API_KEY', action: 'REDACT' },
            { onConflict: 'company_id,data_type' }
          )
        check('member cannot edit policies (admins only)', Boolean(memberPolicyWrite), memberPolicyWrite?.message)

        const { error: memberEventWrite } = await memberClient.from('events').insert({
          company_id: alpha.companyId,
          user_id: memberUser.id,
          ai_tool: 'chatgpt.com',
          data_type: 'EMAIL',
          action: 'REDACT',
          count: 1,
        })
        check('member can still report their own events', !memberEventWrite, memberEventWrite?.message)
      }
    }

    // Both directions, for completeness.
    const { data: reverse } = await b.client.from('events').select('*').eq('company_id', alpha.companyId)
    check('beta cannot read alpha events', (reverse ?? []).length === 0, `got ${reverse?.length ?? 0}`)
  } finally {
    console.log('\nCleaning up throwaway data…')
    for (const tenant of created) {
      await service.from('companies').delete().eq('id', tenant.companyId)
      await service.auth.admin.deleteUser(tenant.userId).catch(() => {})
    }
  }

  console.log('')
  console.log(results.join('\n'))
  console.log('')
  console.log(failures === 0 ? `${results.length} checks passed` : `${failures} of ${results.length} checks FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('rls-check failed:', err.message)
  process.exit(1)
})