// Minimal transactional email via the Resend HTTP API (no extra dependency).
// Without RESEND_API_KEY the caller falls back to showing the invite link in the
// dashboard, which is the behaviour the previous build had.

export interface InviteEmail {
  to: string
  companyName: string
  inviteUrl: string
  appUrl: string
}

export interface EmailResult {
  sent: boolean
  reason?: 'not_configured' | 'failed'
}

export async function sendInviteEmail(input: InviteEmail): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, reason: 'not_configured' }

  const from = process.env.INVITE_EMAIL_FROM || 'ShadowAI Guard <onboarding@resend.dev>'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: `${input.companyName} invited you to ShadowAI Guard`,
        text: [
          `${input.companyName} invited you to join their ShadowAI Guard workspace.`,
          '',
          `Accept the invitation: ${input.inviteUrl}`,
          '',
          'The link expires in 7 days and can only be used once.',
          '',
          'If you were not expecting this email you can ignore it.',
        ].join('\n'),
      }),
    })

    if (!res.ok) {
      console.error('Invite email failed:', res.status, await res.text())
      return { sent: false, reason: 'failed' }
    }

    return { sent: true }
  } catch (err) {
    console.error('Invite email threw:', err)
    return { sent: false, reason: 'failed' }
  }
}