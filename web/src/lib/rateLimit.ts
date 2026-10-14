import { createHash } from 'crypto'
import { getSupabaseAdmin } from './supabase-admin'

// Fixed-window rate limiter backed by Postgres (public.check_rate_limit), so the
// limit holds across serverless instances. The previous version kept counters in
// a module-level Map, which resets on every cold start and is per-instance.
//
// If Postgres is unreachable (or the 003 migration has not been applied yet) the
// limiter degrades to an in-process counter rather than failing open completely.

type MemoryRecord = { count: number; resetTime: number }
const memoryFallback = new Map<string, MemoryRecord>()

function checkInMemory(identifier: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const record = memoryFallback.get(identifier)

  if (!record || now > record.resetTime) {
    memoryFallback.set(identifier, { count: 1, resetTime: now + windowMs })
    return true
  }
  if (record.count >= limit) return false

  record.count++
  return true
}

// Identifiers may contain a visitor's IP address. Hashing keeps the raw address
// out of the rate_limits table (and out of any table dump).
export function hashIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32)
}

export async function checkRateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const key = `rl_${hashIdentifier(identifier)}`

  try {
    const { data, error } = await getSupabaseAdmin().rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: Math.ceil(windowMs / 1000),
    })

    if (error) {
      console.error('check_rate_limit failed, using in-memory fallback:', error.message)
      return checkInMemory(key, limit, windowMs)
    }

    return data === true
  } catch (err) {
    console.error('check_rate_limit threw, using in-memory fallback:', err)
    return checkInMemory(key, limit, windowMs)
  }
}