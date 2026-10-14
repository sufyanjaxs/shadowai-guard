# Going live with ShadowAI Guard

Everything in this document is account work that only you can do (identity, payment
provider, app stores). The code is finished and verified — see the "Verified status"
table in `README.md`.

> **No budget?** Read §0 first. You can launch and take your first customer with
> $0 — the Stripe and Chrome Web Store steps are both optional.

---

## 0. The zero-cost path (start here)

| Piece | Cost | Required? |
|---|---|---|
| Supabase free tier (2 projects, 500 MB, plenty for dozens of companies) | $0 | yes |
| Vercel hobby tier (import the private GitHub repo, zero config) | $0 | yes |
| Resend free tier (3,000 emails/month) — optional, invites fall back to a copyable link | $0 | no |
| **Microsoft Edge Add-ons** — free to register and submit, same Chromium extension | $0 | recommended |
| Unpacked install for Chrome (customer loads the folder once, no store) | $0 | works now |
| Stripe | no monthly fee, **but Stripe does not operate in Pakistan** | skip |
| Chrome Web Store | $5 one-time developer registration fee | when revenue exists |

**Selling without Stripe.** `BILLING_PROVIDER=manual` (the default when Stripe is not
configured) shows "Activate by invoice" instead of a card button. When the customer's
bank transfer lands:

```bash
cd web
node scripts/set-plan.mjs --list                              # see every workspace
node scripts/set-plan.mjs admin@customer.com starter          # 25 seats
node scripts/set-plan.mjs admin@customer.com business 150     # custom seat count
```

That writes the subscription row; the extension picks the new seat limit up on its
next policy sync. No payment provider, no country restriction, no percentage fees.

**Shipping the extension with no store at all** (fine for B2B — the customer's IT
admin installs it once for the whole team):

1. `pnpm build:ext`
2. Zip the **contents** of `extension/dist`.
3. Send the zip plus these instructions:

```
1. Unzip to a permanent folder (e.g. C:\ShadowAI-Guard)
2. chrome://extensions → enable "Developer mode" (top right)
3. "Load unpacked" → select that folder
4. Click the extension icon → Log In with the work email the admin invited
```

**Edge Add-ons** (free, proper auto-updating install, same package): register at
<https://partnercenter.microsoft.com> → Edge Add-ons, upload the same zip. Chromium
extensions port over with no code changes. Many businesses run Edge, and Chrome users
can add Edge Add-ons as a source too.

---

## 1. Supabase project (10 min)

1. Create a project at <https://supabase.com/dashboard> (pick the region closest to
   your customers — Frankfurt for EU, Singapore for UAE/Asia).
2. **Settings → API** → copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**never** in the extension or
     anything client-side)
3. **Settings → Auth → URL Configuration**
   - Site URL: `https://<your-vercel-domain>`
   - Redirect URLs, add all of:
     - `https://<your-vercel-domain>/reset-password`
     - `https://<your-vercel-domain>/dashboard/**`
     - `http://localhost:3000/**` (keep during development)
4. **Settings → Auth → Email**: keep "Confirm email" ON (the app reads
   `SIGNUP_REQUIRES_EMAIL_CONFIRMATION`, which defaults to on).
   Configure SMTP (Supabase's built-in SMTP is rate-limited and only for team use —
   use Resend or another provider).
5. **SQL Editor** → run, in order:
   - `supabase/migrations/001_init.sql`
   - `supabase/migrations/002_seat_limit.sql`
   - `supabase/migrations/003_hardening.sql`
   - `supabase/migrations/004_rls_recursion_fix.sql`
6. Put the three Supabase values into `web/.env.local` and the two `VITE_` values
   into `extension/.env`.

Check it worked:

```bash
pnpm test:rls      # must print "17 checks passed"
```

## 2. Stripe (15 min) — **skip entirely unless you are in a Stripe-supported country**

Stripe is not available in Pakistan (or most of South Asia). If you are in a supported
country and want self-serve card checkout, do this; otherwise leave
`BILLING_PROVIDER=manual` and use `scripts/set-plan.mjs`.

1. Create an account at <https://dashboard.stripe.com> and activate it (needs your
   business details and bank account — this is the step that makes you money).
2. **Products → Create product**: "ShadowAI Guard Starter" (25 seats) and
   "ShadowAI Guard Business" (100 seats). Add a **recurring monthly price** to each.
3. Copy the two `price_…` ids → `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_BUSINESS`.
4. **Developers → API keys** → secret key → `STRIPE_SECRET_KEY`, publishable key →
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
5. **Developers → Webhooks → Add endpoint**
   - URL: `https://<your-vercel-domain>/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `customer.subscription.paused`,
     `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`,
     `charge.refunded`
   - Signing secret → `STRIPE_WEBHOOK_SECRET`
6. **Settings → Billing → Customer portal** → enable it (the Billing page links there).
7. Local testing without touching live mode:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
   Put the printed `whsec_…` into `web/.env.local` and run one test checkout. Confirm
   a row appears in `subscriptions` with the right `seat_limit`, and that
   `stripe_events` recorded the event id exactly once.

## 3. Resend (5 min, optional but recommended)

1. Account at <https://resend.com>, verify your domain.
2. API key → `RESEND_API_KEY`.
3. Sender address → `INVITE_EMAIL_FROM` (e.g. `ShadowAI Guard <noreply@yourdomain.com>`).

Without it, invite links are shown in the dashboard instead of emailed — that works,
it is just manual.

## 4. Deploy the dashboard to Vercel (10 min)

1. Push this folder to a private GitHub repo, then import it in Vercel
   (Framework: Next.js, root directory: `web`).
2. Environment variables (Production + Preview):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `BILLING_PROVIDER`,
   `SIGNUP_REQUIRES_EMAIL_CONFIRMATION=true`, `NEXT_PUBLIC_SUPPORT_EMAIL`,
   plus the Stripe set and the Resend pair if you are using them.
   `APP_URL` **must** equal the public origin — invitation links are built from it.
3. Deploy, then set `APP_URL` to the real domain and redeploy.
4. Verify: `https://<domain>/api/health` returns `{"status":"ok","database":"reachable"}`.
   Point an uptime monitor at it.

## 5. Publish the extension (10 min + review)

The $5 Chrome Web Store fee is the only part of this runbook that costs money, so it
is optional for the first customers — see §0. When you are ready to pay it:

1. `pnpm build:ext`, then zip the **contents** of `extension/dist` (not the folder).
2. Developer mode is **off** for store uploads — the zip must contain `manifest.json`
   at the root.
3. <https://chrome.google.com/webstore/devconsole> → "Upload new item".
   - Description, category, and support email.
   - Privacy practices: declare that **no user data is collected or transmitted
     except anonymised event metadata**, and point the privacy policy URL at the
     deployed `/privacy` page. `<all_urls>` triggers a review, so answer every
     justification prompt honestly — the automated reviewers check this.
   - Include a screenshot of the blocked-submission dialog.
4. Optional but strongly recommended: publish the listing as **unlisted** first,
   install it from the store, and test the whole flow once against production.

## 6. Before you take a customer's money

```bash
pnpm test                    # unit tests
pnpm typecheck && pnpm lint
pnpm test:rls                # 17/17 against the REAL project
pnpm --filter extension e2e  # with production keys in extension/.env
pnpm build:web && pnpm test:e2e:web
```

Then, in the browser, once by hand:
- Sign up a real company → confirm the email → land in the dashboard.
- Change a policy in the dashboard, click "Sync Policy" in the extension, and confirm
  the popup shows the new action.
- Paste a credit card into ChatGPT → the dialog appears.
- Run one real Stripe checkout (then refund it from the dashboard) and confirm the
  seat count changes.
- Invite a colleague from a second browser, accept, and confirm they see the policies
  but cannot invite anyone.

## 7. Operations

- **Unconfirmed signups**: companies created with email confirmation ON but never
  confirmed still occupy a company row. Add a Supabase scheduled function (or a daily
  cron hitting your own endpoint) that deletes companies whose only admin has
  `email_confirmed_at IS NULL` and `created_at < now() - interval '1 day'`.
- **Backups**: Supabase daily backups + PITR are on the free tier for a week of
  history; enable them and set a retention you can afford.
- **Logs**: Vercel function logs for the API routes; the extension's console messages
  never include user content by design.