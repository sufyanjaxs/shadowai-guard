import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Next persists `fetch` responses to .next/cache/fetch-cache, keyed by URL and
// headers. Without `cache: 'no-store'` a request through supabase-js can be
// answered from that cache after a redeploy — which showed up as an invite that
// was already redeemed still looking valid. Every server-side Supabase read must
// see live rows.
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' })

let client: SupabaseClient | null = null

// Lazily constructed: building the client at module scope threw
// "supabaseKey is required" during `next build` whenever the environment
// variables were absent, so a deploy with one missing key failed at build time
// instead of at request time. Now the build always succeeds and only a request
// that genuinely needs the database fails.
export function getSupabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { global: { fetch: noStoreFetch } }
    )
  }
  return client
}