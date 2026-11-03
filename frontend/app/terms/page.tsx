import Link from 'next/link'
import { FoxIcon } from '@/components/shared/FoxIcon'

export const metadata = { title: 'Terms of Service — Fennec' }

export default function TermsPage() {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '0 0 80px' }}>
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', padding: '16px 24px' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}>
          <FoxIcon size={24} />
          <span style={{ fontWeight: 800, fontSize: 15, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Fennec</span>
        </Link>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 16px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Terms of Service</h1>
        <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 40 }}>Last updated: 3 November 2026</p>

        <Section title="1. Agreeing to these terms">
          By creating a Fennec account or using any part of Fennec, you agree to these terms. If you don&apos;t agree, please don&apos;t use Fennec.
        </Section>

        <Section title="2. Not financial advice">
          <strong>Fennec provides information and tools to help you understand your money. Nothing in Fennec is financial, investment, legal or tax advice, and Fennec is not a licensed financial adviser.</strong>
          <br /><br />
          AI answers, signals, picks, analysis and projections are produced automatically and can be wrong, incomplete or out of date. Market prices can be delayed. Past performance doesn&apos;t predict future results. Decisions you make are your own; for important ones, talk to a licensed financial adviser.
        </Section>

        <Section title="3. Fennec is in testing">
          Fennec is still being built and tested. You may find bugs, figures may sometimes be wrong, features may change or be removed, and the service may be unavailable at times. Please check anything important against your bank or broker, and report problems with the Feedback button.
        </Section>

        <Section title="4. Who can use Fennec">
          You must be at least 18 and able to enter into a contract to use Fennec.
        </Section>

        <Section title="5. Your account">
          Keep your sign-in details secure and don&apos;t share your account. You&apos;re responsible for what happens under it. We recommend turning on two-factor sign-in in Settings. Tell us straight away at support@fennecsi.com if you think someone else has accessed your account.
        </Section>

        <Section title="6. Connecting your bank and Gmail">
          Bank and investment connections are provided by Akahu, and the Gmail connection by Google, under their own terms. By connecting, you authorise Fennec to read the data you&apos;ve chosen to share. Fennec&apos;s access is read-only: it can&apos;t move money or send emails. You can disconnect at any time. We aren&apos;t responsible for errors, delays or outages in data from these providers.
        </Section>

        <Section title="7. Sharing with a partner">
          If you link with a partner, they can see the accounts, bills and goals you choose to share, and can edit shared bills and goals. Only link with someone you trust, and only share information you have the right to share. Either of you can unlink at any time.
        </Section>

        <Section title="8. Acceptable use">
          You must not:
          <ul style={{ marginTop: 10, paddingLeft: 20, lineHeight: 2 }}>
            <li>use Fennec for anything unlawful</li>
            <li>try to access other people&apos;s accounts or data</li>
            <li>reverse-engineer Fennec, or scrape or copy its data in bulk</li>
            <li>use automated tools to access Fennec without our permission</li>
            <li>submit false portfolio information to gain a leaderboard position</li>
            <li>post anything in Community that is unlawful, misleading, abusive or promotes a financial product for your own benefit</li>
            <li>impersonate anyone, or interfere with or disrupt the service</li>
          </ul>
          We may remove content or suspend accounts that break these rules.
        </Section>

        <Section title="9. Plans and Premium">
          Fennec has a free plan and a Premium plan. What each includes is shown in the app and may change. During testing, Premium isn&apos;t sold: you can request it with the Request Premium button, and we may grant or withdraw it at our discretion. Before Fennec ever charges for Premium, we&apos;ll show you the price and billing terms, and nothing will be charged without your agreement.
        </Section>

        <Section title="10. Portfolio verification">
          By uploading a broker statement for verification, you confirm you have the right to share it and that it&apos;s accurate. We don&apos;t keep the statement after verification. Verified badges may be removed if we find evidence of manipulation.
        </Section>

        <Section title="11. Privacy">
          How we handle your information is explained in our{' '}
          <Link href="/privacy" style={{ color: 'var(--primary)' }}>Privacy Policy</Link>, which forms part of these terms.
        </Section>

        <Section title="12. Ownership">
          Fennec&apos;s software, design and branding belong to Fennec or its licensors. Information you add to Fennec stays yours; you give us permission to use it only to provide the service to you.
        </Section>

        <Section title="13. Other services">
          Fennec uses third-party services for bank connections, market data, AI and email. We aren&apos;t responsible for their accuracy or availability, or for websites we link to.
        </Section>

        <Section title="14. Liability">
          Fennec is provided &quot;as is&quot;. To the extent the law allows, we give no warranties and aren&apos;t liable for indirect or consequential loss, or for investment or financial losses, arising from your use of Fennec. Nothing in these terms limits rights you have under the Consumer Guarantees Act 1993 or the Fair Trading Act 1986 that can&apos;t be excluded by agreement.
        </Section>

        <Section title="15. Ending your use">
          You can stop using Fennec and delete your account at any time in Settings. We may suspend or close accounts that break these terms, or end the service, with notice where reasonable.
        </Section>

        <Section title="16. Changes to these terms">
          We may update these terms. We&apos;ll tell you by email or in the app before significant changes take effect. Continuing to use Fennec after that means you accept the updated terms.
        </Section>

        <Section title="17. Governing law">
          These terms are governed by New Zealand law, and New Zealand courts have exclusive jurisdiction.
        </Section>

        <Section title="18. Contact">
          Questions about these terms? Email{' '}
          <a href="mailto:support@fennecsi.com" style={{ color: 'var(--primary)' }}>support@fennecsi.com</a>.
        </Section>

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/faq" style={{ color: 'var(--primary)', fontSize: 14, textDecoration: 'none' }}>FAQ</Link>
          <Link href="/privacy" style={{ color: 'var(--primary)', fontSize: 14, textDecoration: 'none' }}>Privacy Policy</Link>
          <Link href="/login" style={{ color: 'var(--text2)', fontSize: 14, textDecoration: 'none' }}>Sign in</Link>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>{title}</h2>
      <div style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.8 }}>{children}</div>
    </div>
  )
}
