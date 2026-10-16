import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { requiresEmailConfirmation } from '../emailVerification'

// The bug this guards: the first live deployment shipped with confirmation "on"
// against Supabase's built-in mailer, which only delivers to project team members.
// Signup told users to check an inbox that never received anything, and every
// account was stranded. The safe default is the one that cannot strand anyone.
describe('requiresEmailConfirmation', () => {
  const original = process.env.EMAIL_VERIFICATION

  beforeEach(() => {
    delete process.env.EMAIL_VERIFICATION
  })

  afterEach(() => {
    if (original === undefined) delete process.env.EMAIL_VERIFICATION
    else process.env.EMAIL_VERIFICATION = original
  })

  it('is off when the variable is unset', () => {
    expect(requiresEmailConfirmation()).toBe(false)
  })

  it('is on only for the exact value "required"', () => {
    process.env.EMAIL_VERIFICATION = 'required'
    expect(requiresEmailConfirmation()).toBe(true)
  })

  it.each(['', 'true', 'false', '1', 'on', 'REQUIRED', 'yes', 'required '])(
    'treats %o as off rather than throwing a signup at a user who can never activate',
    (value) => {
      process.env.EMAIL_VERIFICATION = value
      expect(requiresEmailConfirmation()).toBe(false)
    },
  )
})