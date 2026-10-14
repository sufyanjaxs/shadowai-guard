import { randomBytes } from 'crypto'

// Invite tokens are bearer credentials: anyone holding one can join the company.
// The UI previously generated them with Math.random() in the browser, which is
// predictable from other browser outputs. Tokens are now 256 bits of CSPRNG
// output and are only ever minted on the server.
export function createInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

export function isValidInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/.test(token)
}

// Absolute origin of this deployment. Falls back to the Vercel-provided origin
// so invite links are correct without extra configuration, but never to a
// request header, which an attacker can forge.
export function getAppUrl(): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/+$/, '')

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`

  return 'http://localhost:3000'
}

export function buildInviteLink(token: string): string {
  return `${getAppUrl()}/invite/${token}`
}

export const INVITE_TTL_DAYS = 7

export function inviteExpiry(): string {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}