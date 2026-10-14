import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createInviteToken, isValidInviteToken, buildInviteLink, getAppUrl, inviteExpiry } from '@/lib/inviteToken'

describe('invite tokens', () => {
  it('produces 256 bits of base64url entropy', () => {
    const token = createInviteToken()
    expect(token).toHaveLength(43) // 32 bytes -> base64url without padding
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createInviteToken()))
    expect(tokens.size).toBe(200)
  })

  it('accepts its own tokens', () => {
    expect(isValidInviteToken(createInviteToken())).toBe(true)
  })

  it('rejects guessable or malformed tokens', () => {
    // The old implementation produced Math.random().toString(36).substring(2,15)
    // — 13 predictable characters. It must not pass validation.
    expect(isValidInviteToken(Math.random().toString(36).substring(2, 15))).toBe(false)
    expect(isValidInviteToken('short')).toBe(false)
    expect(isValidInviteToken("' OR 1=1 --")).toBe(false)
    expect(isValidInviteToken(`${'a'.repeat(31)}/`)).toBe(false)
    expect(isValidInviteToken('')).toBe(false)
  })
})

describe('invite links', () => {
  const original = process.env.APP_URL
  const originalPublic = process.env.NEXT_PUBLIC_APP_URL
  const originalVercel = process.env.VERCEL_URL

  afterEach(() => {
    process.env.APP_URL = original
    process.env.NEXT_PUBLIC_APP_URL = originalPublic
    if (originalVercel === undefined) delete process.env.VERCEL_URL
    else process.env.VERCEL_URL = originalVercel
  })

  it('uses APP_URL and strips a trailing slash', () => {
    process.env.APP_URL = 'https://app.example.com/'
    expect(getAppUrl()).toBe('https://app.example.com')
    expect(buildInviteLink('tok')).toBe('https://app.example.com/invite/tok')
  })

  it('falls back to VERCEL_URL, then localhost', () => {
    process.env.APP_URL = ''
    delete process.env.NEXT_PUBLIC_APP_URL
    process.env.VERCEL_URL = 'preview.vercel.app'
    expect(getAppUrl()).toBe('https://preview.vercel.app')

    delete process.env.VERCEL_URL
    expect(getAppUrl()).toBe('http://localhost:3000')
  })
})

describe('invite expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('expires exactly 7 days out', () => {
    vi.setSystemTime(new Date('2026-10-14T00:00:00.000Z'))
    expect(inviteExpiry()).toBe('2026-10-21T00:00:00.000Z')
  })
})