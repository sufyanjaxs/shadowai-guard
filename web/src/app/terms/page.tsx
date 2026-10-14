import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service — ShadowAI Guard',
  description: 'Terms governing the use of the ShadowAI Guard browser extension and dashboard.',
}

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: '1. Agreement',
    body: [
      'These terms govern your use of the ShadowAI Guard browser extension, the administration dashboard, and the services we operate. By creating an account or installing the extension you accept them.',
    ],
  },
  {
    heading: '2. The service',
    body: [
      'ShadowAI Guard is a data loss prevention tool. It inspects text locally in your browser, applies the policy an administrator has configured, and reports anonymised metadata about each detection.',
      'It is a preventative control, not a guarantee. Detection uses pattern matching and cannot identify every form of sensitive data, including unstructured information such as trade secrets or unpublished research. Do not treat it as a substitute for training, access controls, or data-classification policy.',
    ],
  },
  {
    heading: '3. Accounts and roles',
    body: [
      'An account belongs to exactly one company. The first person to sign up creates the company and becomes its administrator. Administrators can invite members, change data-type policies, change roles, manage billing, and delete invitations.',
      'You are responsible for the accuracy of your company name and for the actions of everyone you invite. Tell us promptly if you believe an account has been used without authorisation.',
    ],
  },
  {
    heading: '4. Acceptable use',
    body: [
      'Do not attempt to bypass, disable, decompile, or reverse-engineer the detection logic, and do not automate sign-up, invitation, or checkout endpoints. Automated abuse may result in suspension.',
      'Do not use the service to store or transmit content that you are not authorised to process. We never receive your content, so we cannot moderate it — but your employer\'s policies and applicable law still apply to what you type.',
    ],
  },
  {
    heading: '5. Plans, billing and cancellation',
    body: [
      'Paid plans are billed monthly or annually through Stripe and are priced per company, with a seat limit per plan. Charges are made to the payment method entered on Stripe\'s checkout page; we never store card details.',
      'You can cancel at any time from the billing portal. Cancellation takes effect at the end of the paid period; the workspace drops to zero seats immediately, which disables enforcement for all members until it is renewed.',
      'Except where required by law, fees already paid are non-refundable. Prices are shown exclusive of VAT or equivalent taxes, which are added at checkout.',
    ],
  },
  {
    heading: '6. Availability and support',
    body: [
      'We aim for high availability but do not guarantee uninterrupted service. Detection in the extension continues to work using the last policy it cached if our API is unreachable, so enforcement does not silently stop during an outage.',
      'Support is provided on a best-effort basis for paid plans and by email for all plans.',
    ],
  },
  {
    heading: '7. Limitation of liability',
    body: [
      'To the maximum extent permitted by law, our total liability arising out of or relating to the service is limited to the amount you paid us in the twelve months before the claim. We are not liable for indirect, incidental, or consequential loss, including lost profits or data loss caused by a detection the service did not flag.',
      'Nothing in these terms excludes liability that cannot be excluded by law.',
    ],
  },
  {
    heading: '8. Termination',
    body: [
      'You may stop using the service and delete your account at any time. We may suspend or terminate an account that breaches these terms, and will restore access if the issue is resolved.',
      'On termination we delete your company\'s events, policies, team members and invitations, as described in the privacy policy.',
    ],
  },
  {
    heading: '9. Changes to these terms',
    body: [
      'We may update these terms. Material changes are announced by email to administrators at least 14 days before they take effect. Continuing to use the service after that date means accepting the updated terms.',
    ],
  },
]

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
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

        <Link href="/" className="text-blue-600 font-semibold">← Back to ShadowAI Guard</Link>
      </div>
    </div>
  )
}