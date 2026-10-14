import { describe, it, expect, vi, beforeEach } from 'vitest'
import Stripe from 'stripe'

// The Stripe client is replaced with one that never touches the network: only
// `webhooks.constructEvent` (pure HMAC) and two data-returning methods are used.
// vi.mock factories are hoisted, so the spies have to be hoisted with them.
const WEBHOOK_SECRET = 'whsec_test_secret'

const { listLineItems, retrieveSubscription } = vi.hoisted(() => ({
  listLineItems: vi.fn(),
  retrieveSubscription: vi.fn(),
}))

vi.mock('@/lib/stripe', () => {
  const client = new Stripe('sk_test_placeholder_for_unit_tests', { typescript: true })
  return {
    getStripe: () => Object.assign(client, {
      checkout: { sessions: { listLineItems } },
      subscriptions: { retrieve: retrieveSubscription },
    }),
  }
})

// In-memory stand-in for the service-role client, recording every write so the
// test can assert what the handler actually persisted.
type Row = Record<string, unknown>
const state = {
  inserts: [] as { table: string; payload: unknown }[],
  updates: [] as { table: string; payload: unknown }[],
  upserts: [] as { table: string; payload: unknown; options: unknown }[],
  ledgerInsertError: null as { code?: string; message?: string } | null,
  lookups: {} as Record<string, Row | null>,
}

function chain(table: string, filters: Record<string, unknown> = {}) {
  const self: Record<string, unknown> = {}
  self.select = () => self
  self.eq = (column: string, value: unknown) => chain(table, { ...filters, [column]: value })
  self.insert = (payload: unknown) => {
    state.inserts.push({ table, payload })
    const error = table === 'stripe_events' ? state.ledgerInsertError : null
    return Promise.resolve({ data: null, error })
  }
  self.update = (payload: unknown) => {
    state.updates.push({ table, payload })
    // Chainable: the route calls .update(...).eq(...)
    return self
  }
  self.upsert = (payload: unknown, options: unknown) => {
    state.upserts.push({ table, payload, options })
    return Promise.resolve({ data: null, error: null })
  }
  self.maybeSingle = () => Promise.resolve({ data: state.lookups[table] ?? null, error: null })
  self.single = () => Promise.resolve({ data: state.lookups[table] ?? null, error: null })
  return self
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => chain(table) }),
}))

import { POST } from '@/app/api/webhooks/stripe/route'

const signer = new Stripe('sk_test_placeholder_for_unit_tests', { typescript: true })

function signedRequest(event: unknown, secret = WEBHOOK_SECRET): Request {
  const payload = JSON.stringify(event)
  const header = signer.webhooks.generateTestHeaderString({ payload, secret })
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': header },
    body: payload,
  }) as unknown as Request
}

function event(type: string, object: unknown, id = `evt_${Math.random().toString(36).slice(2)}`) {
  return {
    id,
    // Stripe nests the payload under data.object; `object` is kept so the
    // fixture reads like a real event dump.
    object,
    data: { object },
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
  }
}

const COMPANY_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
  process.env.STRIPE_PRICE_BUSINESS = 'price_business_test'
  process.env.STRIPE_PRICE_STARTER = 'price_starter_test'
  state.inserts = []
  state.updates = []
  state.upserts = []
  state.ledgerInsertError = null
  state.lookups = {}
  listLineItems.mockReset()
  retrieveSubscription.mockReset()
  // Checkout always reads the line items before branching on subscription vs one-time.
  listLineItems.mockResolvedValue({ data: [{ price: { id: 'price_starter_test' } }] })
})

describe('stripe webhook', () => {
  it('rejects a request with no signature and touches nothing', async () => {
    const res = await POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: '{}' }) as never)
    expect(res.status).toBe(400)
    expect(state.inserts).toHaveLength(0)
  })

  it('rejects a signature made with the wrong secret', async () => {
    const res = await POST(signedRequest(event('invoice.paid', {}), 'whsec_attacker') as never)
    expect(res.status).toBe(400)
    expect(state.inserts).toHaveLength(0)
  })

  it('records the event id before doing any work', async () => {
    state.lookups.subscriptions = null
    await POST(signedRequest(event('unhandled.event.type', {})) as never)

    const ledgerInsert = state.inserts.find((i) => i.table === 'stripe_events')
    expect(ledgerInsert).toBeTruthy()
    expect(ledgerInsert!.payload).toMatchObject({ status: 'received' })
  })

  it('treats a redelivered event id as a no-op', async () => {
    state.ledgerInsertError = { code: '23505', message: 'duplicate key' }
    const res = await POST(signedRequest(event('customer.subscription.deleted', {})) as never)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ duplicate: true })
    expect(state.upserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  it('upgrades a business subscription to 100 seats on checkout', async () => {
    retrieveSubscription.mockResolvedValue({
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      metadata: { company_id: COMPANY_ID },
      current_period_end: 1750000000,
      items: { data: [{ price: { id: 'price_business_test' } }] },
    })

    const res = await POST(
      signedRequest(
        event('checkout.session.completed', {
          id: 'cs_1',
          client_reference_id: COMPANY_ID,
          customer: 'cus_1',
          subscription: 'sub_1',
          mode: 'subscription',
        })
      ) as never
    )

    expect(res.status).toBe(200)
    const upsert = state.upserts.find((u) => u.table === 'subscriptions')
    expect(upsert).toBeTruthy()
    expect(upsert!.payload).toMatchObject({
      company_id: COMPANY_ID,
      plan: 'business',
      status: 'active',
      seat_limit: 100,
      stripe_subscription_id: 'sub_1',
    })
    expect(state.updates.find((u) => u.table === 'stripe_events')?.payload).toMatchObject({ status: 'processed' })
  })

  it('gives a starter subscription 25 seats', async () => {
    retrieveSubscription.mockResolvedValue({
      id: 'sub_2',
      customer: 'cus_2',
      status: 'active',
      metadata: { company_id: COMPANY_ID },
      current_period_end: 1750000000,
      items: { data: [{ price: { id: 'price_starter_test' } }] },
    })

    await POST(
      signedRequest(
        event('checkout.session.completed', {
          id: 'cs_2',
          client_reference_id: COMPANY_ID,
          customer: 'cus_2',
          subscription: 'sub_2',
          mode: 'subscription',
        })
      ) as never
    )

    expect(state.upserts.find((u) => u.table === 'subscriptions')!.payload).toMatchObject({
      seat_limit: 25,
      plan: 'starter',
    })
  })

  it('drops seats to zero when a subscription is cancelled', async () => {
    await POST(
      signedRequest(
        event('customer.subscription.deleted', {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'canceled',
          metadata: { company_id: COMPANY_ID },
          items: { data: [{ price: { id: 'price_business_test' } }] },
        })
      ) as never
    )

    expect(state.upserts.find((u) => u.table === 'subscriptions')!.payload).toMatchObject({
      company_id: COMPANY_ID,
      status: 'canceled',
      seat_limit: 0,
    })
  })

  it('marks a failed invoice as past_due using the subscription reference', async () => {
    state.lookups.subscriptions = { company_id: COMPANY_ID }

    const res = await POST(
      signedRequest(
        event('invoice.payment_failed', {
          id: 'in_1',
          customer: 'cus_1',
          parent: { subscription_details: { subscription: 'sub_9' } },
        })
      ) as never
    )

    expect(res.status).toBe(200)
    expect(state.updates.find((u) => u.table === 'subscriptions')!.payload).toMatchObject({
      status: 'past_due',
    })
    expect(state.updates.find((u) => u.table === 'stripe_events')?.payload).toMatchObject({ status: 'processed' })
  })

  it('ignores events it does not act on', async () => {
    const res = await POST(signedRequest(event('customer.updated', { id: 'cus_3' })) as never)
    expect(res.status).toBe(200)
    expect(state.upserts).toHaveLength(0)
    expect(state.updates.find((u) => u.table === 'stripe_events')?.payload).toMatchObject({ status: 'ignored' })
  })

  it('answers 500 and records the failure when the handler throws', async () => {
    retrieveSubscription.mockRejectedValue(new Error('Stripe is unreachable'))

    const res = await POST(
      signedRequest(
        event('checkout.session.completed', {
          id: 'cs_3',
          client_reference_id: COMPANY_ID,
          customer: 'cus_3',
          subscription: 'sub_3',
          mode: 'subscription',
        })
      ) as never
    )

    expect(res.status).toBe(500)
    const failed = state.updates.find((u) => u.table === 'stripe_events')?.payload as Row
    expect(failed).toMatchObject({ status: 'failed' })
    expect(String(failed.error)).toContain('Stripe is unreachable')
  })

  it('never echoes internal error text back to Stripe', async () => {
    retrieveSubscription.mockRejectedValue(new Error('postgresql://user:password@db.internal failed'))
    const res = await POST(
      signedRequest(
        event('checkout.session.completed', {
          id: 'cs_4',
          client_reference_id: COMPANY_ID,
          customer: 'cus_4',
          subscription: 'sub_4',
          mode: 'subscription',
        })
      ) as never
    )
    const body = await res.text()
    expect(body).not.toContain('password')
    expect(body).not.toContain('db.internal')
  })
})