import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — ShadowAI Guard',
  description: 'How ShadowAI Guard handles data: detection is local, only metadata is transmitted.',
}

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: '1. Summary',
    body: [
      'ShadowAI Guard is a browser extension that blocks or redacts sensitive data before you paste or send it to an AI tool, an email service, or any web form.',
      'All detection happens locally inside your browser. The text you type or paste is never transmitted to us, to our servers, or to any third party. Only anonymised metadata about a detection is transmitted, so your administrator can see risk trends.',
    ],
  },
  {
    heading: '2. What the extension collects',
    body: [
      'The extension requests the <all_urls> host permission so it can inspect the text you are about to submit on any site, not only on a fixed list of supported AI tools.',
      'Detection runs entirely on your device. The following is transmitted to our API after a detection, and nothing else:',
      '• the data type that was detected (for example CREDIT_CARD, API_KEY, EMAIL)',
      '• the action taken (WARN, REDACT, BLOCK, or that a user chose to bypass a warning)',
      '• the hostname of the site you were on (for example chatgpt.com)',
      '• the identifier of your account and your company, so events are attributed correctly.',
      'The detected value itself — card number, ID number, IBAN, email address, phone number, API key, or password — never leaves your browser. There is no code path that transmits message content, and there is no content column in our database.',
    ],
  },
  {
    heading: '3. What the dashboard stores',
    body: [
      'Your account: email address, a hashed password (Supabase Auth), your role, and the company you belong to.',
      'Your company: name, creation date, plan and seat count.',
      'Security events: the metadata listed in section 2, with a timestamp.',
      'Policies: which action applies to which data type, set by an administrator.',
    ],
  },
  {
    heading: '4. Who can see your data',
    body: [
      'Administrators of your company can see aggregated security events for their company. They cannot see the content of any message, because it is never collected.',
      'Row Level Security in our database enforces this: a member of one company can never read another company\'s events, policies, or team members, regardless of what the browser requests.',
      'We do not sell personal data and we do not share it with advertisers or data brokers.',
    ],
  },
  {
    heading: '5. Sub-processors',
    body: [
      'Supabase — authentication and database (region selected at signup).',
      'Stripe — subscription billing and the customer portal. Card details are entered on Stripe\'s pages; we never see or store them.',
      'Resend — transactional email, only if your administrator enabled invitation emails. Without it, invitations are shown as a link in the dashboard.',
    ],
  },
  {
    heading: '6. Retention',
    body: [
      'Security events are kept while your subscription is active and for 24 months afterwards, so year-over-year reporting works. Deleting a company deletes its events, policies, team members and invitations.',
      'Invitation links expire after 7 days and can be used once.',
      'Rate-limit counters (a hashed network address and a counter) are deleted 24 hours after their window closes.',
    ],
  },
  {
    heading: '7. Your rights (GDPR / UAE PDPL)',
    body: [
      'You can request a copy of your personal data, correction, or deletion by contacting your company administrator or the address below. Because we store no message content, there is no message history to export.',
      'Our legal basis for processing security metadata is legitimate interest: preventing accidental disclosure of confidential data. Access to your company\'s events is limited to that company\'s administrators.',
    ],
  },
  {
    heading: '8. Security',
    body: [
      'Detection runs locally, the extension holds no encryption keys, and session cookies are httpOnly, secure and SameSite=Lax.',
      'Row Level Security is enabled on every table with deny-by-default policies. Stripe webhooks are verified by signature and every event id is recorded so a retry cannot be applied twice.',
    ],
  },
  {
    heading: '9. Changes',
    body: [
      'If this policy changes materially we will update the "last updated" date below and notify administrators by email.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-gray-500 mb-10">Last updated: 14 October 2026</p>

        {SECTIONS.map((section) => (
          <section key={section.heading} className="mb-8">
            <h2 className="text-xl font-bold mb-3">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="text-gray-700 leading-relaxed mb-3">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <p className="text-gray-700 leading-relaxed mb-10">
          Questions or requests: <span className="font-semibold">privacy@shadowaiguard.com</span>
        </p>

        <Link href="/" className="text-blue-600 font-semibold">← Back to ShadowAI Guard</Link>
      </div>
    </div>
  )
}