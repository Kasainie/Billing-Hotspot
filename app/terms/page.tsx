import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'Terms for the LKTECH ISP operations platform and hotspot internet access.',
  alternates: { canonical: '/terms' },
}

const platformSections = [
  {
    id: 'platform-scope',
    title: '1. Scope and parties',
    paragraphs: [
      'These Terms & Conditions apply to the LKTECH website, account, and ISP operations software (the “Platform”). They govern the relationship between LKTECH (“LKTECH”, “we”, “us”) and the internet service provider or other organization that creates or administers a Platform workspace (“Provider”, “you”).',
      'The separate Hotspot Access Terms below describe the relationship between a Provider and a person using that Provider’s Wi-Fi or hotspot service (“Hotspot User”). Internet connectivity is sold and supplied by the Provider, not by LKTECH. The Provider is responsible for its packages, network, customer support, and any provider-specific terms.',
      'By creating or using a Platform account, or by using a hotspot where these terms are made available, you acknowledge these terms. If you do not agree, do not create an account or use the relevant service. If you accept for an organization, you confirm you have authority to bind it.',
    ],
  },
  {
    id: 'platform-accounts',
    title: '2. Accounts and workspace administration',
    paragraphs: [
      'Provide accurate account and workspace information, keep contact details current, and protect passwords, verification codes, API keys, router credentials, and other access details. You are responsible for activity performed through your account and for promptly notifying LKTECH of suspected unauthorized access.',
      'Workspace owners and administrators control invitations, roles, staff access, network settings, and subscriber records. You must assign access only to people who need it, review access regularly, and remove access when it is no longer appropriate. Do not share named user credentials or attempt to bypass role restrictions.',
      'You are responsible for ensuring that your use of the Platform and your instructions to staff comply with applicable law, your customer agreements, and the permissions you have obtained.',
    ],
  },
  {
    id: 'platform-use',
    title: '3. Acceptable use',
    paragraphs: [
      'Use the Platform only for lawful ISP, hotspot, and business operations. Do not use it to infringe rights, distribute malware, send unlawful or unsolicited communications, probe or disrupt systems, evade security controls, access another workspace without permission, or upload content you are not entitled to use.',
      'Do not reverse engineer, copy, resell, lease, or exploit the Platform except as permitted by law or with LKTECH’s written permission. Do not interfere with its operation, test security without authorization, or use automated methods that impose unreasonable load.',
    ],
  },
  {
    id: 'platform-data',
    title: '4. Provider data and privacy',
    paragraphs: [
      'The Provider remains responsible for its subscriber, staff, payment, and network records, including the accuracy of information entered and the legal basis for collecting and using it. You must give customers and staff any notices required by law and respond to their requests as applicable.',
      'LKTECH uses information needed to provide, secure, maintain, and improve the Platform and to support the Provider’s requested operations. Depending on the service and applicable law, the Provider and LKTECH may have different controller or processor roles. These Terms do not replace a privacy notice or a separate data-processing agreement where one is required.',
      'Do not enter sensitive personal information unless it is necessary and the Platform is appropriate for it. The Provider should export or retain its own records when needed and must not treat the Platform as its sole backup.',
    ],
  },
  {
    id: 'platform-integrations',
    title: '5. Routers, networks, payments, and other services',
    paragraphs: [
      'Router provisioning, monitoring, session controls, SMS, mobile-money payments, email, and other integrations may depend on third-party products, networks, credentials, or services. The Provider is responsible for selecting compatible equipment, authorizing access, securing its network, and reviewing generated scripts or configuration changes before applying them.',
      'Third-party services are subject to their own terms and availability. LKTECH does not control mobile operators, payment providers, internet transit, electricity, routers, or customer devices and is not responsible for their independent acts or outages.',
      'Payment status shown in the Platform may depend on provider callbacks, settlement, reconciliation, or other third-party data. The Provider remains responsible for confirming transactions, setting and disclosing charges, resolving disputes, and complying with payment-provider requirements.',
    ],
  },
  {
    id: 'platform-fees',
    title: '6. Fees, trials, and taxes',
    paragraphs: [
      'Any Platform subscription, usage charge, trial, or payment obligation will be described in the applicable plan, order, or checkout flow. Unless that offer states otherwise, charges are due as displayed and are not refundable except where required by law or expressly agreed in writing.',
      'The Provider is responsible for applicable taxes and charges arising from its business and internet services. Hotspot package prices and payment rules are set by the Provider and shown to Hotspot Users before purchase.',
    ],
  },
  {
    id: 'platform-availability',
    title: '7. Availability, changes, and suspension',
    paragraphs: [
      'We work to keep the Platform available and secure, but it may be interrupted for maintenance, upgrades, incidents, connectivity problems, or events outside our control. We do not promise uninterrupted or error-free operation.',
      'We may change or discontinue features, with reasonable notice where practical. We may restrict or suspend access where reasonably necessary to protect users, investigate suspected misuse, comply with law, address a security risk, or respond to overdue amounts. Where practical, we will notify the workspace owner and provide an opportunity to resolve the issue.',
    ],
  },
  {
    id: 'platform-ip',
    title: '8. Intellectual property',
    paragraphs: [
      'LKTECH and its licensors retain their rights in the Platform, software, design, documentation, and branding. We grant the Provider a limited, non-exclusive, non-transferable right to use the Platform for its internal operations while its account is active and in accordance with these terms.',
      'The Provider retains rights in its own data and materials and grants LKTECH permission to process them as reasonably needed to provide and secure the Platform. The Provider must have the rights and permissions necessary to submit those materials.',
    ],
  },
  {
    id: 'platform-disclaimers',
    title: '9. Disclaimers and liability',
    paragraphs: [
      'To the extent allowed by law, the Platform is provided “as available”. We do not warrant that it will meet every business requirement, that data from routers or third parties will always be complete or current, or that every configuration will work with every network.',
      'Nothing in these terms excludes or limits a liability that cannot lawfully be excluded or limited. To the extent permitted by law, LKTECH is not liable for indirect or consequential loss, loss of profits, or loss caused by a Provider’s network, equipment, configuration, staff, customer relationship, or third-party service. The Provider is responsible for its connectivity service and its customer commitments.',
      'To the extent permitted by law, LKTECH’s total liability arising from the Platform during the 12 months before the event giving rise to the claim is limited to the Platform fees paid by the Provider to LKTECH during that period. This limit does not apply where prohibited by law.',
    ],
  },
  {
    id: 'platform-termination',
    title: '10. Termination',
    paragraphs: [
      'A Provider may stop using the Platform and request account closure through its authorized workspace owner. We may terminate or suspend access for a material breach, legal requirement, security risk, or discontinuation of the service. On termination, Platform access may end and data may be deleted after a reasonable period, subject to legal, security, and backup-retention requirements.',
      'The Provider should export any records it needs before closing its workspace. Terms that by their nature should continue, including intellectual property, accrued payment obligations, disclaimers, and liability limits, survive termination.',
    ],
  },
  {
    id: 'platform-law',
    title: '11. Governing law and changes to these terms',
    paragraphs: [
      'These Platform terms are governed by the laws of Kenya, without limiting any mandatory consumer protections that apply to a user elsewhere. The parties will first try in good faith to resolve a dispute through written notice and discussion. If it is not resolved, either party may refer it to a court of competent jurisdiction in Kenya.',
      'We may update these terms by publishing a revised version with a new “Last updated” date. Material changes will be notified through the Platform or by another reasonable method where practical. Continued use after a revised version takes effect constitutes acceptance to the extent permitted by law.',
    ],
  },
]

const hotspotSections = [
  {
    id: 'hotspot-service-terms',
    title: '12. Hotspot Access Terms',
    paragraphs: [
      'These terms apply to Wi-Fi, voucher, PPPoE, and other internet access sold or provided by an independent internet service provider using LKTECH software (“Hotspot Service”). The Provider identified on the portal, package offer, or payment instructions is the seller and service provider. LKTECH supplies billing and network-management software; it is not the Provider and does not itself operate the local Wi-Fi network.',
      'By purchasing, signing in to, or using a Hotspot Service after these terms have been made available to you, you agree to these terms and any clearly presented Provider-specific package conditions. If you do not agree, do not purchase or connect. Provider-specific conditions may add detail for the local service, but cannot take away rights that applicable law gives you.',
    ],
  },
  {
    id: 'hotspot-purchase',
    title: '13. Packages, payment, and activation',
    paragraphs: [
      'Before purchase, review the package price, advertised speed or quota, duration, device limits, coverage, and any fair-use conditions displayed by the Provider. The Provider determines those package details. Actual speeds and coverage can vary with signal strength, congestion, device capability, location, and network conditions.',
      'Where payment is collected through mobile money or another payment provider, follow the payment prompt and use the correct phone number and reference. A payment request is not confirmation of payment. Access or a voucher is issued after the transaction is confirmed, subject to the displayed offer and network availability. Keep your receipt or transaction reference.',
      'Package duration, quota, expiry, and start time are those disclosed by the Provider at purchase or on the portal. Some vouchers begin their validity on first successful connection; other packages may start at purchase or activation. Check the specific offer before paying. A session may end when its time, quota, or account validity expires.',
      'If a payment is duplicated, misdirected, not credited, or disputed, contact the Provider using the support details on the portal and provide the receipt/reference. Refunds, cancellations, and reversals are handled by the Provider and payment provider under the displayed offer and applicable law. LKTECH does not independently hold or guarantee the Provider’s customer funds.',
    ],
  },
  {
    id: 'hotspot-credentials',
    title: '14. Credentials and device security',
    paragraphs: [
      'Keep voucher codes, usernames, passwords, and payment details private. Do not share, sell, or reuse access credentials beyond the package rules. You are responsible for activity on your connection unless applicable law provides otherwise. Contact the Provider promptly if credentials are lost or appear to have been used without permission.',
      'Public or shared Wi-Fi may not be secure. Use current device security, secure websites and applications, and avoid transmitting sensitive information over a connection you do not trust. The Provider does not guarantee that its network can protect every device or communication.',
    ],
  },
  {
    id: 'hotspot-acceptable-use',
    title: '15. Acceptable use of internet access',
    paragraphs: [
      'Use the Hotspot Service lawfully and do not use it to threaten, harass, defraud, infringe intellectual-property rights, distribute malware, access systems without authorization, interfere with network operation, or violate another person’s rights.',
      'Do not bypass authentication, payment, usage limits, device limits, or security controls; impersonate another user; scan or attack the Provider’s or another customer’s systems; or resell or redistribute access unless the Provider has expressly authorized it. The Provider may apply reasonable traffic-management measures and may block harmful traffic to protect its network and users.',
    ],
  },
  {
    id: 'hotspot-availability',
    title: '16. Network availability and suspension',
    paragraphs: [
      'Internet access depends on radio coverage, power, backhaul, equipment, maintenance, congestion, and third-party networks. The Provider will use reasonable efforts to deliver the service described in the package but does not promise uninterrupted access or a particular speed at every moment unless expressly stated in the package.',
      'The Provider may suspend or end a session for expiry, quota exhaustion, unpaid or reversed payment, suspected fraud, security incidents, unlawful use, network maintenance, or a legal requirement. Where practical, it will provide notice and explain how to restore access. Any statutory rights remain unaffected.',
      'The Hotspot Service is not an emergency service. Do not rely on it as your only means of contacting emergency services or receiving urgent alerts.',
    ],
  },
  {
    id: 'hotspot-privacy',
    title: '17. Hotspot data and support',
    paragraphs: [
      'The Provider may need account, device, session, usage, payment-reference, and troubleshooting information to authenticate users, deliver access, prevent fraud, maintain the network, and respond to support requests. The Provider is responsible for giving required privacy notices and handling personal information in accordance with applicable law. LKTECH may process relevant information on the Provider’s behalf to operate the billing and network-management software.',
      'For connectivity, package, payment-credit, or refund questions, contact the Provider using the contact details shown on the portal. For a Platform issue, contact LKTECH at info@lktech.life. Include only the information needed to investigate; do not send passwords or full payment credentials.',
    ],
  },
  {
    id: 'hotspot-liability',
    title: '18. Hotspot responsibility and disputes',
    paragraphs: [
      'The Provider is responsible for the Hotspot Service it sells, the package description, local network, customer support, and any refund or service remedy owed under its offer or applicable law. LKTECH is not a party to the Provider’s internet-access contract and does not guarantee the Provider’s network or package.',
      'Nothing in these terms excludes or limits a consumer right or liability that cannot be excluded under applicable law. To the extent permitted by law, neither LKTECH nor the Provider is responsible for indirect losses arising from interruptions, device incompatibility, or a user’s failure to secure their device.',
      'These Hotspot Access Terms are governed by the laws of Kenya, subject to mandatory consumer protections. Raise a concern first with the Provider using the portal support details. If it is not resolved, you may use the applicable dispute-resolution or regulatory channels available under law.',
    ],
  },
]

function TermsSections({ sections }: { sections: typeof platformSections }) {
  return sections.map((section) => (
    <section className="legal-section" id={section.id} key={section.id}>
      <h2>{section.title}</h2>
      {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    </section>
  ))
}

export default function TermsPage() {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link className="legal-brand" href="/">LKTECH<span>.</span></Link>
        <nav aria-label="Legal navigation">
          <Link href="/">Home</Link>
          <Link href="/signup">Create account</Link>
        </nav>
      </header>
      <div className="legal-layout">
        <aside className="legal-toc">
          <span>IN THIS DOCUMENT</span>
          <a href="#platform-terms">Platform terms</a>
          <a href="#hotspot-service-terms">Hotspot access terms</a>
          <a href="#contact">Contact</a>
        </aside>
        <article className="legal-content">
          <p className="legal-eyebrow">LKTECH · SERVICE TERMS</p>
          <h1>Terms &amp; Conditions</h1>
          <p className="legal-intro">These terms cover the LKTECH ISP operations platform and hotspot internet access provided by participating internet service providers.</p>
          <p className="legal-updated"><strong>Last updated:</strong> 19 October 2026</p>

          <div className="legal-notice">
            <strong>Different services, different responsibilities</strong>
            <p>LKTECH provides software to internet service providers. Each Provider operates and is responsible for its own internet service, packages, support, and customer relationship. Please review the package details and the Provider named on your hotspot portal before paying.</p>
          </div>

          <section id="platform-terms" className="legal-group">
            <h2 className="legal-group-title">Part A · LKTECH Platform</h2>
            <TermsSections sections={platformSections} />
          </section>

          <section className="legal-group">
            <h2 className="legal-group-title">Part B · Hotspot customers</h2>
            <TermsSections sections={hotspotSections} />
          </section>

          <section className="legal-section" id="contact">
            <h2>19. Contact</h2>
            <p>For questions about the LKTECH Platform or these general terms, email <a href="mailto:info@lktech.life">info@lktech.life</a>. For hotspot service, package, payment, or refund questions, contact the internet service provider shown on the relevant hotspot portal.</p>
          </section>

        </article>
      </div>
      <footer className="legal-footer">
        <span>© 2026 LKTECH™. All rights reserved.</span>
        <Link href="/signup">Create an account</Link>
      </footer>
    </main>
  )
}
