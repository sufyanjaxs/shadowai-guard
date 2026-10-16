/**
 * Whether a new account must confirm its email address before it can sign in.
 *
 * This is OFF by default and that is deliberate, not an oversight.
 *
 * Supabase's built-in mailer (what a project gets with no SMTP provider configured)
 * only ever delivers to the project's own team members. On a free project it is
 * also heavily rate limited. So a deployment that requires confirmation without a
 * real provider does not verify anyone - it silently strands every signup behind an
 * email that is never sent. The account is created, the UI says "check your inbox",
 * and nothing ever arrives.
 *
 * Turn it on ONLY once a real provider is wired up on the Supabase project
 * (Authentication -> SMTP, e.g. Resend). See DEPLOY.md section 3.
 *
 * The variable is read as an exact match on "required" so that an unset, empty or
 * stale value fails safe to "off" - an unverified account is recoverable, an
 * unreachable one is not.
 */
export function requiresEmailConfirmation(): boolean {
  return process.env.EMAIL_VERIFICATION === 'required'
}