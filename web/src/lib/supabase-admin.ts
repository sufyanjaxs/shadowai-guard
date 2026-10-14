import { createClient } from '@supabase/supabase-js'

// Next persists `fetch` responses to .next/cache/fetch-cache, keyed by URL and
// headers. Without `cache: 'no-store'` a request through supabase-js can be
// answered from that cache after a redeploy — which showed up as an invite that
// was already redeemed still looking valid. Every server-side Supabase read must
// see live rows.
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' })

// This client uses the service_role key to bypass RLS.
// ONLY use this in secure server-side API routes and webhooks.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: noStoreFetch } }
)