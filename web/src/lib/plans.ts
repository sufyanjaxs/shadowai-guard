// Single source of truth for what a Stripe price means. Kept out of the webhook
// so both the checkout allowlist and the webhook's seat mapping cannot drift.

export const SEATS_STARTER = 25
export const SEATS_BUSINESS = 100
// Seats a brand-new workspace starts with, before any payment.
export const TRIAL_SEATS = SEATS_STARTER

export function businessPriceId(): string | undefined {
  return process.env.STRIPE_PRICE_BUSINESS
}

export function starterPriceId(): string | undefined {
  return process.env.STRIPE_PRICE_STARTER
}

export function seatLimitForPrice(priceId?: string | null): number {
  if (priceId && businessPriceId() && priceId === businessPriceId()) return SEATS_BUSINESS
  return SEATS_STARTER
}

export function planForPrice(priceId?: string | null): string {
  if (priceId && businessPriceId() && priceId === businessPriceId()) return 'business'
  return 'starter'
}

// Checkout only accepts the prices configured for this deployment, so a caller
// cannot hand us an arbitrary price id.
export function isAllowedPrice(priceId?: string | null): boolean {
  const allowed = [starterPriceId(), businessPriceId()].filter((p): p is string => Boolean(p))
  return allowed.length > 0 && allowed.includes(priceId ?? '')
}