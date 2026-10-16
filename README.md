# ShadowAI Guard

Universal data-leak protection (DLP) for small and mid-size businesses. A Chrome
extension detects sensitive data **locally in the browser** (credit cards, Emirates ID,
IBAN, emails, phones, API keys, passwords, custom keywords) before it is pasted or sent
to AI tools, webmail, or any web form. Only metadata (type, action, hostname, count) is ever
sent to the backend. **Raw text never leaves the browser.**

## Structure

| Folder        | What it is                                                      |
|---------------|-----------------------------------------------------------------|
| `shared/`     | Detection library + unit tests (pure TypeScript)                |
| `extension/`  | Chrome extension (Manifest V3, Vite, React popup)               |
| `web/`        | Admin dashboard, auth, team and invites, Stripe billing, PDF report, public Risk Scanner (Next.js) |
| `supabase/`   | Database schema + row-level-security policies (run in Supabase) |

## Setup

Requires Node 18+ and pnpm (`npm install -g pnpm`).

```bash
pnpm install                 # install everything for all three packages
pnpm test                    # 46 unit tests (20 detection + 26 server-side)
```

**Going live?** Everything in [DEPLOY.md](DEPLOY.md) — Supabase project, Stripe
products and webhook, Vercel, Chrome Web Store — is account work you have to do
yourself; the runbook is step-by-step.

### 1. Environment variables
```bash
cp web/.env.example web/.env.local          # then fill in Supabase + Stripe + APP_URL
cp extension/.env.example extension/.env    # then fill in Supabase URL + anon key
```
Never commit these files (they are already in `.gitignore`).

### 2. Database
In the Supabase dashboard, open **SQL Editor** and run, in order:
1. `supabase/migrations/001_init.sql`
2. `supabase/migrations/002_seat_limit.sql`
3. `supabase/migrations/003_hardening.sql`  ← rate limits, invite claiming, Stripe ledger
4. `supabase/migrations/004_rls_recursion_fix.sql`  ← required, see below

> Migration 004 is not optional. 001 expressed "is this user an admin?" by querying
> `profiles` from inside a policy on `profiles`, which Postgres rejects with
> `42P17: infinite recursion detected in policy`. Every dashboard query failed until
> the policies were rewritten to call the `current_company_id()` / `is_company_admin()`
> SECURITY DEFINER helpers instead.

A local stack works too, and applies all four automatically:
```bash
supabase start          # needs Docker; then the API is on http://127.0.0.1:54321
supabase status         # prints the keys that belong in web/.env.local
supabase db reset       # re-apply every migration from scratch
```

`web/.env.local` and `extension/.env` currently hold the **local stack's shared
development defaults**, so the whole product can be run and tested end to end today.
Replace every value with your real Supabase project and Stripe account before you
onboard anyone.

### 3. Run
```bash
pnpm dev:web     # dashboard at http://localhost:3000
pnpm dev:ext     # builds the extension into extension/dist (watch mode)
```

Load the extension: Chrome -> `chrome://extensions` -> enable Developer mode ->
**Load unpacked** -> select `extension/dist`.

### 4. Stripe webhook (local testing)
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## How an account is created and a team is built

1. `/signup` → `POST /api/signup` creates the auth user, the company, an **admin**
   profile, a 25-seat trial subscription and a default policy set. If any step fails
   the whole thing is rolled back, so a company is never left without an admin.
2. An admin creates an invite in **Team** → `POST /api/invites` mints a 256-bit CSPRNG
   token on the server, re-checks the seat limit, and emails the link (if
   `RESEND_API_KEY` is set; otherwise the link is shown for manual sending).
3. `/invite/<token>` → `POST /api/invites/accept` → `claim_invite()` in Postgres runs as
   one transaction: lock the invite, reject if used or expired, re-check seats, mark it
   used, attach the profile to the company. A token is single-use and expires in 7 days.

## Verification

```bash
pnpm test            # 46 unit tests
pnpm typecheck       # all 3 packages
pnpm lint            # web
pnpm build:ext       # -> extension/dist
pnpm build:web       # production Next build
pnpm test:rls        # 17 cross-tenant isolation checks (needs the local stack)
pnpm --filter extension e2e        # 16 real-browser extension tests
pnpm build:web && pnpm test:e2e:web   # 20 web tests against a running server
```

The web e2e suite needs the app running on port 3000 (`pnpm dev:web`, or
`pnpm --filter web start` after a build) and a reachable Supabase stack.

The extension suite loads the **built** extension into a real browser and drives the
actual product paths: BLOCK on send-button click, WARN with *Send anyway* /
*Redact & send*, silent REDACT on paste and on submit, clean-text pass-through,
password inputs left alone, that `REPORT_EVENT` never carries raw text, and — when the
local Supabase stack is up — a real login, a policy fetched from the database, and a
BLOCK event landing in `events` with metadata columns only.

`pnpm test:rls` creates two throwaway companies with the service-role key, signs in as
each company's admin with the **anon** key, and asserts that each tenant can read its
own rows and cannot read, forge or edit anything belonging to the other — including
the rate-limit table and the Stripe event ledger. It deletes everything it created.

## Gotchas that cost real debugging time

| Symptom | Cause |
|---|---|
| An already-redeemed invite page still shows the accept form | Next persisted the supabase-js `fetch` response to `.next/cache/fetch-cache` and re-served it after a restart. Both server clients now pass `cache: 'no-store'`. Delete `.next/cache/fetch-cache` if you see stale server data. |
| Every dashboard query fails with `42P17 infinite recursion` | Migration 004 was not applied. |
| `admin.createUser` returns `{ user }` | `const { data } = await client.auth.admin.createUser(...)` gives you `{ user }`, so the id is `data.user.id`. Silently using `data.id` produces `undefined` and every provisioning write fails with a confusing constraint error. |
| A denied UPDATE under RLS looks like it succeeded | With no UPDATE policy the WHERE clause matches nothing, so PostgREST returns no error and 0 rows. Re-read the row to prove nothing changed. |
| Extension e2e fails with "Failed to fetch" on popup login | The reused `extension/e2e/.profile` holds a dead refresh token from an earlier run. The suite now logs out first. |

## Security model

| Layer | Behaviour |
|---|---|
| Detection | Runs in the page; the detected value never crosses the extension boundary |
| Extension background | Accepts **metadata only** from `REPORT_EVENT`; no `text`/`content` field exists |
| API routes | `requireAdmin()` runs before any handler work: 401 without a session, 403 for non-admins |
| `web/src/middleware.ts` | Redirects unauthenticated `/dashboard` traffic before any component runs, and sets CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` on every response |
| Rate limits | Fixed-window counters in Postgres (`check_rate_limit`), keyed by hashed IP; in-process fallback if the DB is unreachable |
| Invite tokens | 256-bit CSPRNG, single-use, 7-day expiry, redeemed by a `SECURITY DEFINER` function callable only by the service role |
| Seat accounting | Enforced on the server in three places (invite, claim, admin read) and seats are released the moment a member is removed |
| Stripe webhooks | Signature verified first, every event id recorded in `stripe_events` so a retry is a no-op |
| Passwords | Recovery links only; the reset response never reveals whether an address exists |
| Database | RLS enabled on every table; `rate_limits` and `stripe_events` have no policies at all (service-role only) |
| Redirects | Built from `APP_URL`, never from a request `Origin` header |
| Errors | API responses never contain stack traces, SQL text or library names |

## Verified status (2026-10-14)

Everything below was executed against a **local Supabase stack** (`supabase start`,
Docker) and a production Next build:

| Gate | Result |
|---|---|
| `pnpm test` | 46/46 (20 detection + 26 server-side, incl. 11 Stripe webhook tests) |
| `pnpm typecheck` | clean across all 3 packages |
| `pnpm lint` | clean |
| `pnpm build:ext` | builds, icons included |
| `pnpm build:web` | 21 routes |
| `pnpm --filter extension e2e` | 16/16, including a real login against Supabase |
| `pnpm test:e2e:web` | 20/20 against the running app |
| `pnpm test:rls` | 17/17 cross-tenant isolation checks |

Still outstanding, and all of it user-side: the credentials in `web/.env.local` and
`extension/.env` are the **local stack's shared defaults**, and every Stripe value is
still a placeholder. See [DEPLOY.md](DEPLOY.md) for the exact sequence.

## Production notes
- Build the extension with `pnpm build:ext`, zip the **contents** of `extension/dist`, and upload to the Chrome Web Store. `<all_urls>` requires a privacy policy URL — publish `/privacy` and point the listing at it.
- Set `APP_URL` so invitation links point at the real domain.
- For real invitation email, set `RESEND_API_KEY` and `INVITE_EMAIL_FROM`.
- Leave `EMAIL_VERIFICATION` unset. Accounts are then created already-confirmed, which is the correct default while no SMTP provider is configured — Supabase's built-in mailer only delivers to project team members, so requiring confirmation strands every signup behind an email that never arrives. Set it to `required` only after real SMTP is live (DEPLOY.md §3).
- Monitor `https://<domain>/api/health`; it returns 503 when the database is unreachable.
- Housekeeping: if you later enable `EMAIL_VERIFICATION`, companies whose only admin never confirmed their email still occupy a row. `DEPLOY.md` §7 has the cleanup query.