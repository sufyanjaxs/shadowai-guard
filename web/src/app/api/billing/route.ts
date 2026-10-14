import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth'
import { getBillingMode, isBillingConfigured, supportEmail } from '@/lib/billing'

export const dynamic = 'force-dynamic'

// One call for everything the Billing page renders: the workspace's
// subscription, which billing mode is active, the support address, and the price
// ids when card checkout is configured.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const companyId = auth.context.profile.company_id!
  const mode = getBillingMode()
  const configured = isBillingConfigured(mode)

  const { data: subscription } = await getSupabaseAdmin()
    .from('subscriptions')
    .select('plan, status, seat_limit, current_period_end')
    .eq('company_id', companyId)
    .maybeSingle()

  return NextResponse.json({
    companyId,
    subscription: subscription ?? null,
    mode: configured ? mode : 'manual',
    stripeConfigured: mode === 'stripe' && configured,
    prices: configured
      ? {
          starter: process.env.STRIPE_PRICE_STARTER,
          business: process.env.STRIPE_PRICE_BUSINESS,
        }
      : {},
    supportEmail: supportEmail(),
  })
}