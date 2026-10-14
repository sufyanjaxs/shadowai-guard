import Stripe from 'stripe'

let client: Stripe | null = null

// Lazy for the same reason as the Supabase admin client: constructing Stripe at
// module scope throws when STRIPE_SECRET_KEY is unset, which broke `next build`
// in any environment that did not have credentials injected.
export function getStripe(): Stripe {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      // apiVersion omitted on purpose: the SDK pins its own matching API version.
      typescript: true,
    })
  }
  return client
}