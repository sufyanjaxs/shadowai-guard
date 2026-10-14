import { describe, it, expect, vi, beforeEach } from 'vitest'

// supabaseAdmin is stubbed so the limiter can be exercised without a database.
const rpc = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}))

import { checkRateLimit, hashIdentifier } from '@/lib/rateLimit'

describe('hashIdentifier', () => {
  it('is deterministic and hides the raw value', () => {
    expect(hashIdentifier('1.2.3.4')).toBe(hashIdentifier('1.2.3.4'))
    expect(hashIdentifier('1.2.3.4')).not.toContain('1.2.3.4')
    expect(hashIdentifier('1.2.3.4')).not.toBe(hashIdentifier('1.2.3.5'))
  })
})

describe('checkRateLimit with Postgres available', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('passes the window through in seconds and trusts the database verdict', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null })
    await expect(checkRateLimit('signup_1.2.3.4', 5, 15 * 60 * 1000)).resolves.toBe(true)

    const args = rpc.mock.calls[0][0] as string
    const params = rpc.mock.calls[0][1] as { p_limit: number; p_window_seconds: number }
    expect(args).toBe('check_rate_limit')
    expect(params.p_limit).toBe(5)
    expect(params.p_window_seconds).toBe(900)
  })

  it('returns false when the database says the caller is over the limit', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    await expect(checkRateLimit('signup_1.2.3.4', 5, 60_000)).resolves.toBe(false)
  })
})

describe('checkRateLimit when Postgres is unavailable', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('still enforces the limit in-process instead of failing open', async () => {
    // The fallback path logs on purpose; keep the test output readable.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockRejectedValue(new Error('connection refused'))
    const identifier = `unique-${Math.random()}`

    const results: boolean[] = []
    for (let i = 0; i < 4; i++) {
      results.push(await checkRateLimit(identifier, 3, 60_000))
    }

    expect(results).toEqual([true, true, true, false])
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})