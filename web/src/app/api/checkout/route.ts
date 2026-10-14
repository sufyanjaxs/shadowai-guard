import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { requireAdmin } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rateLimit'
import { getAppUrl } from '@/lib/inviteToken'
import { isAllowedPrice } from '@/lib/plans'
import { z } from 'zod'

const bodySchema = z.object({
  priceId: z.string().startsWith('price_'),
})

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  // 5 checkout attempts per minute per user.
  if (!(await checkRateLimit(`checkout_${auth.context.user.id}`, 5, 60_000))) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  let priceId: string
  try {
    const body = bodySchema.parse(await req.json())
    priceId = body.priceId
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // Only the two prices configured for this deployment may be charged. Without
  // this check a caller could hand us any Stripe price id in their own account.
  if (!isAllowedPrice(priceId)) {
    return NextResponse.json({ error: 'Unknown plan.' }, { status: 400 })
  }

  try {
    const companyId = auth.context.profile.company_id!
    const appUrl = getAppUrl()

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      // Redirects are built from configuration, never from a request header:
      // a forged Origin would otherwise bounce customers to an attacker's page.
      success_url: `${appUrl}/dashboard/billing?success=true`,
      cancel_url: `${appUrl}/dashboard/billing?canceled=true`,
      customer_email: auth.context.user.email,
      client_reference_id: companyId,
      // Mirrored onto the subscription so later webhooks (invoice.paid,
      // subscription.updated) can find the company without a lookup chain.
      metadata: { company_id: companyId },
      subscription_data: { metadata: { company_id: companyId } },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    console.error('Checkout session creation failed:', err)
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
  }
}