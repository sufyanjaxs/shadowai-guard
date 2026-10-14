// How the product charges. Stripe is optional: it is simply not available in
// every country (notably Pakistan), and a first customer rarely needs
// self-serve card checkout. With BILLING_PROVIDER=manual a workspace is
// activated by invoice (bank transfer) and `web/scripts/set-plan.mjs` writes the
// subscription row — no payment provider, no fees, no country restriction.
export type BillingMode = 'stripe' | 'manual'

export function getBillingMode(): BillingMode {
  const configured = (process.env.BILLING_PROVIDER || '').toLowerCase()
  if (configured === 'manual') return 'manual'
  if (configured === 'stripe') return 'stripe'
  // Default to manual unless Stripe is actually configured, so a deployment with
  // placeholder keys never shows a checkout button that cannot work.
  return process.env.STRIPE_SECRET_KEY ? 'stripe' : 'manual'
}

export function isBillingConfigured(mode: BillingMode = getBillingMode()): boolean {
  if (mode === 'manual') return true
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_PRICE_STARTER &&
      process.env.STRIPE_PRICE_BUSINESS
  )
}

export function supportEmail(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'sales@yourdomain.com'
}