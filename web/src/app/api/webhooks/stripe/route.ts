import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { seatLimitForPrice, planForPrice } from '@/lib/plans'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

// Stripe moves `subscription` around the API surface (top level on older
// versions, invoice.parent.subscription_details on newer ones). Read both.
function extractSubscriptionRef(source: unknown): string | null {
  const obj = source as Record<string, any> | null
  if (!obj) return null
  const candidate = obj.subscription ?? obj.parent?.subscription_details?.subscription
  if (typeof candidate === 'string') return candidate
  if (candidate && typeof candidate === 'object' && typeof candidate.id === 'string') return candidate.id
  return null
}

function extractCustomerId(source: unknown): string | null {
  const obj = source as Record<string, any> | null
  const candidate = obj?.customer ?? obj?.parent?.customer_details?.customer
  return typeof candidate === 'string' ? candidate : null
}

// The company is taken from the Checkout Session's client_reference_id (set by
// /api/checkout) and mirrored into subscription metadata, so later subscription
// and invoice events can be resolved without a customer lookup.
function companyIdFromMetadata(metadata: Stripe.Metadata | null | undefined): string | null {
  const value = metadata?.company_id
  return typeof value === 'string' && value.length > 0 ? value : null
}

async function findCompanyId(args: {
  explicit?: string | null
  subscriptionId?: string | null
  customerId?: string | null
}): Promise<string | null> {
  if (args.explicit) return args.explicit

  if (args.subscriptionId) {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('company_id')
      .eq('stripe_subscription_id', args.subscriptionId)
      .maybeSingle()
    if (data?.company_id) return data.company_id
  }

  if (args.customerId) {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('company_id')
      .eq('stripe_customer_id', args.customerId)
      .maybeSingle()
    if (data?.company_id) return data.company_id
  }

  return null
}

async function upsertSubscription(args: {
  companyId: string
  customerId: string | null
  subscriptionId: string | null
  plan: string
  status: string
  seatLimit: number
  currentPeriodEnd?: string | null
}) {
  const row = {
    company_id: args.companyId,
    stripe_customer_id: args.customerId,
    stripe_subscription_id: args.subscriptionId,
    plan: args.plan,
    status: args.status,
    seat_limit: args.seatLimit,
    current_period_end: args.currentPeriodEnd ?? null,
  }

  // onConflict company_id: a company has at most one active subscription row, and
  // stripe_subscription_id is nullable (NULLs never conflict in Postgres).
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(row, { onConflict: 'company_id' })
  if (error) throw new Error(`subscriptions upsert failed: ${error.message}`)
}

async function syncSubscription(subscription: Stripe.Subscription, fallbackStatus?: string) {
  const companyId = await findCompanyId({
    explicit: companyIdFromMetadata(subscription.metadata),
    subscriptionId: subscription.id,
    customerId: typeof subscription.customer === 'string' ? subscription.customer : null,
  })
  if (!companyId) {
    throw new Error(`No company found for subscription ${subscription.id}`)
  }

  const item = subscription.items?.data?.[0]
  // current_period_end moved from the subscription onto its items in newer API
  // versions, so both are read (the item field is not in this SDK's types).
  const itemPeriodEnd = (item as unknown as { current_period_end?: number } | undefined)?.current_period_end
  const periodEndTs =
    (subscription as unknown as { current_period_end?: number }).current_period_end ??
    itemPeriodEnd ??
    null

  const canceled = subscription.status === 'canceled'
  const seatLimit = canceled ? 0 : seatLimitForPrice(item?.price?.id)

  await upsertSubscription({
    companyId,
    customerId: typeof subscription.customer === 'string' ? subscription.customer : null,
    subscriptionId: subscription.id,
    plan: planForPrice(item?.price?.id),
    status: fallbackStatus ?? subscription.status,
    seatLimit,
    currentPeriodEnd: periodEndTs ? new Date(periodEndTs * 1000).toISOString() : null,
  })
}

async function setStatusByReference(args: {
  subscriptionId: string | null
  customerId: string | null
  status: string
  seatLimit?: number
}) {
  const companyId = await findCompanyId({
    subscriptionId: args.subscriptionId,
    customerId: args.customerId,
  })
  if (!companyId) return false

  const patch: Record<string, unknown> = { status: args.status }
  if (typeof args.seatLimit === 'number') patch.seat_limit = args.seatLimit

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update(patch)
    .eq('company_id', companyId)
  if (error) throw new Error(`subscriptions update failed: ${error.message}`)
  return true
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const companyId = session.client_reference_id || companyIdFromMetadata(session.metadata)
  if (!companyId) throw new Error(`Checkout session ${session.id} has no company reference`)

  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null
  const customerId = typeof session.customer === 'string' ? session.customer : null

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 })
  const priceId = lineItems.data[0]?.price?.id ?? null

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    await syncSubscription(subscription, subscription.status === 'active' ? 'active' : subscription.status)
    return
  }

  await upsertSubscription({
    companyId,
    customerId,
    subscriptionId: null,
    plan: session.mode === 'subscription' ? 'starter' : 'one_time',
    status: 'active',
    seatLimit: seatLimitForPrice(priceId),
    currentPeriodEnd: null,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Missing signature configuration' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    // CRITICAL: verified on every request. Nothing in this handler runs before
    // the signature checks out.
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid signature'
    console.error('Webhook signature verification failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Idempotency: Stripe retries until it sees a 2xx, so the same event id can
  // arrive repeatedly. The primary key turns every repeat into a no-op.
  const { error: claimError } = await supabaseAdmin
    .from('stripe_events')
    .insert({ id: event.id, type: event.type, status: 'received' })

  if (claimError) {
    if (claimError.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true })
    }
    // Without the ledger we must not guess: refuse so Stripe retries.
    console.error('Could not record Stripe event:', claimError.message)
    return NextResponse.json({ error: 'Event ledger unavailable' }, { status: 500 })
  }

  let outcome: 'processed' | 'ignored' = 'ignored'

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        outcome = 'processed'
        break
      }

      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired': {
        outcome = 'ignored'
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        await syncSubscription(event.data.object as Stripe.Subscription)
        outcome = 'processed'
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        outcome = (await setStatusByReference({
          subscriptionId: extractSubscriptionRef(invoice),
          customerId: extractCustomerId(invoice),
          status: 'past_due',
        })) ? 'processed' : 'ignored'
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        outcome = (await setStatusByReference({
          subscriptionId: extractSubscriptionRef(invoice),
          customerId: extractCustomerId(invoice),
          status: 'active',
        })) ? 'processed' : 'ignored'
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        outcome = (await setStatusByReference({
          subscriptionId: null,
          customerId: typeof charge.customer === 'string' ? charge.customer : null,
          status: 'refunded',
        })) ? 'processed' : 'ignored'
        break
      }

      default:
        outcome = 'ignored'
    }

    await supabaseAdmin
      .from('stripe_events')
      .update({ status: outcome })
      .eq('id', event.id)

    return NextResponse.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'handler error'
    console.error(`Webhook handler error for ${event.type} (${event.id}):`, message)
    // Mark failed and answer 500 so Stripe retries the delivery.
    await supabaseAdmin.from('stripe_events').update({ status: 'failed', error: message }).eq('id', event.id)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }
}