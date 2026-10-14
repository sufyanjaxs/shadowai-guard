import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isAllowedPrice, planForPrice, seatLimitForPrice, SEATS_BUSINESS, SEATS_STARTER } from '@/lib/plans'

describe('plan mapping', () => {
  const originalStarter = process.env.STRIPE_PRICE_STARTER
  const originalBusiness = process.env.STRIPE_PRICE_BUSINESS

  beforeEach(() => {
    process.env.STRIPE_PRICE_STARTER = 'price_starter'
    process.env.STRIPE_PRICE_BUSINESS = 'price_business'
  })

  afterEach(() => {
    process.env.STRIPE_PRICE_STARTER = originalStarter
    process.env.STRIPE_PRICE_BUSINESS = originalBusiness
  })

  it('gives the business price 100 seats and everything else 25', () => {
    expect(seatLimitForPrice('price_business')).toBe(SEATS_BUSINESS)
    expect(seatLimitForPrice('price_starter')).toBe(SEATS_STARTER)
    expect(seatLimitForPrice(undefined)).toBe(SEATS_STARTER)
    expect(seatLimitForPrice('price_someone_elses')).toBe(SEATS_STARTER)
  })

  it('labels the plan', () => {
    expect(planForPrice('price_business')).toBe('business')
    expect(planForPrice('price_starter')).toBe('starter')
  })

  it('accepts only configured prices at checkout', () => {
    expect(isAllowedPrice('price_starter')).toBe(true)
    expect(isAllowedPrice('price_business')).toBe(true)
    expect(isAllowedPrice('price_attacker')).toBe(false)
    expect(isAllowedPrice(undefined)).toBe(false)
  })

  it('accepts nothing while prices are unconfigured', () => {
    delete process.env.STRIPE_PRICE_STARTER
    delete process.env.STRIPE_PRICE_BUSINESS
    expect(isAllowedPrice('price_starter')).toBe(false)
  })
})