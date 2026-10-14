# Changes made while packaging the chat code into a project

The code comes from the "ShadowAI Guard MVP" chat. Files that were overwritten across
phases use their **latest** version. The following were added or fixed so the project
actually installs, passes tests and builds:

## Added (the chat relied on generators like create-next-app / create-vite)
- `pnpm-workspace.yaml`, `extension/package.json`, `extension/tsconfig.json`, `web/package.json`,
  `web/tsconfig.json`, `web/next.config.mjs`, Tailwind/PostCSS config, `globals.css`, ESLint config
- `.env.example` files for `web/` and `extension/` (real `.env` files are NOT included)
- `extension/manifest.json`: added `action.default_popup` (without it the login popup never opens)

## Bugs fixed
- **Detection:** `sk-proj-...` style OpenAI keys were not detected (hyphen not allowed in pattern); private-key block matching was also broken by a trailing `\b`. The original unit test failed because of this.
- **Billing:** `/api/checkout` and `/api/portal` imported a non-existent `createClient` from `@supabase/ssr` (crash at runtime). Added `web/src/lib/supabase-server.ts` and switched both routes to it, using `auth.getUser()` (validated) instead of `getSession()`.
- **Billing:** the Stripe webhook read `session.subscription_details` (doesn't exist on Checkout Sessions), so every customer would have got 25 seats. It now reads the real line item to choose 25 vs 100 seats.
- **Stripe:** removed hard-coded `apiVersion` that mismatched the installed SDK.
- **TypeScript:** fixed invalid `Policy` mapped type, `BLOCK_BYPASSED`/`WARN_BYPASSED` action typing, crxjs import (`{ crx }`), and chart data typing.
- **Database:** the webhook upserts subscriptions by `company_id` but the table had no unique constraint on it (every save would fail). Added in `supabase/migrations/002_seat_limit.sql`.
- Dashboard "Billing" link and team seat-limit check (given as snippets in the chat) were merged into the full files.
- `supabase/migrations/001_init.sql` = the "Master SQL Script"; `002_seat_limit.sql` = the later schema update.

## Second pass — service side completed and verified (2026-10-14)
Everything below was found by actually running the stack, not by reading the code.

**Blocking bugs**
- **RLS was unusable.** `001_init.sql` queried `public.profiles` from inside a policy on `public.profiles`, so Postgres rejected every request with `42P17: infinite recursion detected in policy for relation "profiles"`. The dashboard could never load a team, a policy or an event. `004_rls_recursion_fix.sql` adds `current_company_id()` / `is_company_admin()` SECURITY DEFINER helpers and rewrites every policy to call them.
- **Stale server reads.** Next persists supabase-js `fetch` responses to `.next/cache/fetch-cache`, so a redeemed invite still rendered as valid even after a server restart. Both server clients now force `cache: 'no-store'`.
- **CSP broke the app.** A nonce-based policy is only applied by Next on dynamically rendered routes, and this app prerenders them, so every script was blocked. The policy is now `'self' 'unsafe-inline'` with an explicit origin allowlist elsewhere.

**Missing product flows** (the MVP had no way to get a second user into a company)
- Signup: `POST /api/signup` + `/signup` — creates the auth user, company, admin profile, 25-seat trial and default policies, with rollback if any step fails.
- Invites: `POST/GET/DELETE /api/invites` — CSPRNG token minted server-side, seat limit re-checked on the server, optional Resend email, revocable.
- Acceptance: `/invite/<token>` + `POST /api/invites/accept` → `claim_invite()`, a single transaction that redeems the token exactly once and attaches the profile to the company.
- Auth gate: `web/src/middleware.ts` redirects unauthenticated `/dashboard` traffic and sets the security headers on every response.
- `requireAdmin()` helper: 401 without a session, 403 for non-admins, before any handler work.

**Hardening**
- Invite tokens were `Math.random().toString(36).substring(2, 15)` in the browser: 256-bit CSPRNG now, 7-day expiry, single use.
- Rate limiting was an in-memory `Map` (dead on Vercel): fixed-window counters in Postgres via `check_rate_limit()`, keyed by hashed IP, with an in-process fallback.
- Stripe webhook: signature verified first, every event id recorded in `stripe_events` so retries are no-ops, and `invoice.payment_failed` / `invoice.paid` / `customer.subscription.deleted` / `paused` / `resumed` / `charge.refunded` are handled.
- `/api/checkout` accepted any `price_*` id and built redirect URLs from the `Origin` header: both fixed (allowlist + `APP_URL`).
- Invite email can now actually be sent (`RESEND_API_KEY`), falling back to showing the link.
- Privacy policy and terms pages (`/privacy`, `/terms`) — required for the Chrome Web Store `<all_urls>` permission.
- "Send anyway" on a BLOCK dialog never existed (the dialog only renders it for WARN); the dead `BLOCK_BYPASSED` branch in the interceptor is gone so the metric cannot lie.

**Test coverage added**
- 46 unit tests: token entropy, link building, rate-limit fallback, plan mapping, plus 11 Stripe webhook tests that sign real payloads with `stripe.webhooks.generateTestHeaderString` and assert signature rejection, event-id idempotency, seat mapping (100 vs 25), cancellation → 0 seats, `invoice.payment_failed` → `past_due`, ignored events, and a 500 that never leaks internal error text. No Stripe account required.
- `pnpm test:rls` — 17 cross-tenant isolation checks with two real companies.
- `pnpm --filter extension e2e` — 16 tests, including a real login against Supabase proving the policy fetch and that a BLOCK event lands in `events` with metadata columns only.
- `pnpm test:e2e:web` — 20 browser tests over signup, middleware, policies, invites, acceptance, authorization, seat management and rate limiting.

## Third pass — the gaps that would have bitten the first paying customer (2026-10-14)
- **Seats could never be reclaimed.** Leaving staff held their seat until the subscription lapsed, and admins had no way to remove anyone. `GET /api/team`, `PATCH|DELETE /api/team/[userId]` now promote, demote and remove. Removal detaches the profile (`company_id = null`) instead of deleting the login, so the person can still join another company. An admin cannot change their own access, and the last admin cannot be demoted or removed — a workspace always keeps an admin.
- **No password recovery.** Anyone who forgot their password was locked out permanently. Added `/forgot-password` and `/reset-password` (Supabase recovery link, one-hour expiry, session checked before the form renders). The response is identical whether or not the address exists.
- **Email confirmation was hard-coded off.** Now driven by `SIGNUP_REQUIRES_EMAIL_CONFIRMATION`, defaulting to ON; the UI tells the user to check their inbox. Set to `false` only locally.
- **Silent non-enforcement.** A cancelled or unpaid subscription sets `seat_limit` to 0, which quietly stops protection. The dashboard now shows a red/amber banner for `canceled`, `past_due`, `unpaid` and `trialing`.
- **Operational gaps**: `error.tsx` (no stack traces in production), `not-found.tsx`, and `GET /api/health` that also checks the database, for uptime monitoring.
- **Extension polish**: the popup shows which account is signed in and links straight to the dashboard.
- **`DEPLOY.md`** — the account-side runbook: Supabase project and migrations, Stripe products/prices/webhook, Resend, Vercel env vars, Chrome Web Store listing, the pre-sale checklist, and the unconfirmed-signup cleanup.

## Known issues NOT changed (worth a security review before launch)
- The rate limiter trusts `X-Forwarded-For`. That is correct behind Vercel; behind another proxy, terminate it there or replace `getClientIp`.
- Detection is pattern matching. It will not catch unstructured sensitive text.
- Unconfirmed signups hold a company row until the cleanup job in `DEPLOY.md` §7 runs.
- A member who leaves the company keeps their login; that is deliberate (their data can be reassigned or deleted from Supabase separately).