import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rateLimit'
import { getAppUrl } from '@/lib/inviteToken'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  if (!(await checkRateLimit(`portal_${auth.context.user.id}`, 10, 60_000))) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  try {
    // Scoped to the caller's own company, so one company can never open the
    // billing portal of another.
    const { data: subscription } = await getSupabaseAdmin()
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('company_id', auth.context.profile.company_id!)
      .maybeSingle()

    if (!subscription?.stripe_customer_id) {
      return NextResponse.json({ error: 'No active subscription found.' }, { status: 400 })
    }

    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      // Configured origin, not the request Origin header.
      return_url: `${getAppUrl()}/dashboard/billing`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (err) {
    console.error('Billing portal session creation failed:', err)
    return NextResponse.json({ error: 'Could not open the billing portal. Please try again.' }, { status: 500 })
  }
}