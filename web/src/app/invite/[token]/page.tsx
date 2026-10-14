import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isValidInviteToken } from '@/lib/inviteToken'
import InviteAccept from './InviteAccept'

// Tokens change state (single use), so never cache this page.
export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }: { params: { token: string } }) {
  const { token } = params

  let status: 'valid' | 'invalid' | 'used' | 'expired' = 'invalid'
  let email = ''
  let companyName = ''

  // The service client is used because the visitor is by definition not logged in
  // yet. Only non-secret fields are handed to the client.
  if (isValidInviteToken(token) && supabaseAdmin) {
    const { data: invite } = await supabaseAdmin
      .from('invites')
      .select('email, company_id, accepted_at, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (invite) {
      const { data: company } = await supabaseAdmin
        .from('companies')
        .select('name')
        .eq('id', invite.company_id)
        .maybeSingle()

      companyName = company?.name || 'your company'
      email = invite.email

      if (invite.accepted_at) status = 'used'
      else if (new Date(invite.expires_at).getTime() <= Date.now()) status = 'expired'
      else status = 'valid'
    }
  }

  if (status === 'invalid') {
    // An unknown token gets the same 404 as a missing page: nothing about a
    // random token should be distinguishable from a wrong URL.
    notFound()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md">
        <h1 className="text-2xl font-bold text-center mb-2 text-blue-600">🛡️ ShadowAI Guard</h1>
        <InviteAccept
          token={token}
          email={email}
          companyName={companyName}
          status={status}
        />
        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="text-blue-600 font-semibold">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}