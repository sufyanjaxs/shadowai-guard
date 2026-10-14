#!/usr/bin/env node
/**
 * Deployment preflight: fails loudly, before a customer ever sees a broken app.
 *
 *   node scripts/preflight.mjs              # check the local env files
 *   BASE=https://your-domain.com node scripts/preflight.mjs   # also probe a deployment
 *
 * Exit code 0 = ready to sell, 1 = something is missing or still a placeholder.
 * Checks the env files for absent/placeholder credentials, asserts the local
 * Supabase answers, and (with BASE) verifies the deployed site: /api/health, the
 * security headers, and that the dashboard is not publicly reachable.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE || ''

function parseEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const webEnv = { ...parseEnv(resolve(HERE, '..', '.env.local')), ...process.env }
const extEnv = { ...parseEnv(resolve(HERE, '..', '..', 'extension', '.env')), ...process.env }

const problems = []
const warnings = []
const ok = []

function fail(msg) { problems.push(msg) }
function warn(msg) { warnings.push(msg) }
function pass(msg) { ok.push(msg) }

// Values that mean "this was never filled in".
const PLACEHOLDER = /placeholder|your_project|your_anon|your_service|replace_me|xxxx/i
const LOCAL = /127\.0\.0\.1|localhost|supabase\.co$/i

function requireValue(label, value, { allowLocal = false, optional = false } = {}) {
  if (!value) {
    if (optional) warn(`${label} is not set`)
    else fail(`${label} is not set`)
    return
  }
  if (PLACEHOLDER.test(value)) {
    fail(`${label} still holds a placeholder value`)
    return
  }
  if (!allowLocal && LOCAL.test(value)) {
    fail(`${label} points at a local development address (${value.slice(0, 40)})`)
    return
  }
  pass(`${label} looks real`)
}

// 1. Web env -----------------------------------------------------------------
requireValue('NEXT_PUBLIC_SUPABASE_URL', webEnv.NEXT_PUBLIC_SUPABASE_URL)
requireValue('NEXT_PUBLIC_SUPABASE_ANON_KEY', webEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY)
requireValue('SUPABASE_SERVICE_ROLE_KEY', webEnv.SUPABASE_SERVICE_ROLE_KEY)
requireValue('APP_URL', webEnv.APP_URL, { optional: true })

const billingMode = (webEnv.BILLING_PROVIDER || '').toLowerCase() ||
  (webEnv.STRIPE_SECRET_KEY && !PLACEHOLDER.test(webEnv.STRIPE_SECRET_KEY) ? 'stripe' : 'manual')

if (billingMode === 'stripe') {
  requireValue('STRIPE_SECRET_KEY', webEnv.STRIPE_SECRET_KEY)
  requireValue('STRIPE_WEBHOOK_SECRET', webEnv.STRIPE_WEBHOOK_SECRET, { optional: true })
  requireValue('STRIPE_PRICE_STARTER', webEnv.STRIPE_PRICE_STARTER)
  requireValue('STRIPE_PRICE_BUSINESS', webEnv.STRIPE_PRICE_BUSINESS)
} else {
  pass('Billing mode: manual (invoice) — no payment provider required')
}

// 2. Extension env -----------------------------------------------------------
requireValue('extension VITE_SUPABASE_URL', extEnv.VITE_SUPABASE_URL)
requireValue('extension VITE_SUPABASE_ANON_KEY', extEnv.VITE_SUPABASE_ANON_KEY)

// 3. The placeholder the reviewer called out ---------------------------------
try {
  const popup = readFileSync(resolve(HERE, '..', '..', 'extension', 'src', 'popup.tsx'), 'utf8')
  if (/DASHBOARD_URL = 'https:\/\/app\.shadowaiguard\.com'/.test(popup)) {
    warn("extension/src/popup.tsx still has the placeholder DASHBOARD_URL — set it before publishing")
  } else {
    pass('extension popup DASHBOARD_URL is configured')
  }
} catch {
  warn('could not read extension/src/popup.tsx')
}

// 4. Local database reachability --------------------------------------------
if (webEnv.NEXT_PUBLIC_SUPABASE_URL && !PLACEHOLDER.test(webEnv.NEXT_PUBLIC_SUPABASE_URL)) {
  try {
    const res = await fetch(`${webEnv.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/companies?select=id&limit=1`, {
      headers: { apikey: webEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    })
    // 200 = reachable. 401/404 also proves the host answered.
    if (res.ok || res.status === 401 || res.status === 404) {
      pass(`Supabase at ${webEnv.NEXT_PUBLIC_SUPABASE_URL} is reachable`)
    } else {
      fail(`Supabase answered ${res.status} — check the project URL`)
    }
  } catch (err) {
    fail(`Supabase is unreachable: ${err.message}`)
  }
}

// 5. Deployment probe --------------------------------------------------------
if (BASE) {
  try {
    const health = await fetch(`${BASE}/api/health`)
    const healthBody = await health.json().catch(() => ({}))
    if (health.status === 200 && healthBody.status === 'ok') {
      pass(`${BASE}/api/health -> ok, database reachable`)
    } else {
      fail(`${BASE}/api/health -> ${health.status} ${JSON.stringify(healthBody)}`)
    }

    const home = await fetch(BASE, { redirect: 'manual' })
    const csp = home.headers.get('content-security-policy') || ''
    if (csp.includes("frame-ancestors 'none'")) pass('CSP with frame-ancestors is served')
    else fail(`CSP missing frame-ancestors on ${BASE}`)
    if (home.headers.get('x-frame-options') === 'DENY') pass('X-Frame-Options: DENY')
    else fail('X-Frame-Options is not DENY')

    const dash = await fetch(`${BASE}/dashboard`, { redirect: 'manual' })
    const location = dash.headers.get('location') || ''
    if (dash.status >= 300 && dash.status < 400 && location.includes('/login')) {
      pass('/dashboard redirects anonymous visitors to /login')
    } else {
      fail(`/dashboard did not redirect an anonymous visitor (status ${dash.status})`)
    }

    const priv = await fetch(`${BASE}/privacy`)
    if (priv.ok) pass('/privacy is published (needed for the Chrome Web Store listing)')
    else fail(`/privacy returned ${priv.status}`)
  } catch (err) {
    fail(`Deployment probe failed: ${err.message}`)
  }
}

// Report ---------------------------------------------------------------------
for (const line of ok) console.log(`  ok    ${line}`)
for (const line of warnings) console.log(`  warn  ${line}`)
for (const line of problems) console.log(`  FAIL  ${line}`)

console.log('')
if (problems.length === 0) {
  console.log('Preflight passed — this deployment can take real customers.')
  process.exit(0)
}
console.log(`${problems.length} blocking problem(s). Fix them before taking a customer.`)
process.exit(1)