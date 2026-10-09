import Link from 'next/link'
import { IconTrendingUp } from '@tabler/icons-react'

export const metadata = { title: 'Privacy Policy — Fennec SI' }

export default function PrivacyPage() {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '0 0 80px' }}>
      {/* Top bar */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/login" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconTrendingUp size={17} color="white" />
          </div>
          <span style={{ fontWeight: 800, fontSize: 15, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Fennec SI</span>
        </Link>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 48 }}>Last updated: 27 June 2026</p>

        <Section title="1. Who we are">
          Fennec SI is an AI-powered investment intelligence platform based in New Zealand. This policy explains how we collect, use, and protect your personal information when you use our service at fennecsi.com.
        </Section>

        <Section title="2. What we collect">
          <strong>Account information:</strong> Your email address and any profile details you choose to provide (username, profession, location, avatar).
          <br /><br />
          <strong>Portfolio data:</strong> Stock holdings, purchase prices, watchlist items, and AI analysis results you generate on the platform.
          <br /><br />
          <strong>Usage data:</strong> Pages visited, features used, AI call counts, and session timestamps — used to improve the platform and enforce free-tier limits.
          <br /><br />
          <strong>Broker documents:</strong> If you use portfolio verification, you may upload a broker statement. This document is passed to our AI system for data extraction only and is not retained after verification is complete.
          <br /><br />
          <strong>Device and technical data:</strong> IP address, browser type, and device type collected automatically via standard server logs.
        </Section>

        <Section title="3. How we use your data">
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>To provide and improve the Fennec SI service</li>
            <li>To generate AI-powered signals and analysis personalised to your portfolio</li>
            <li>To enforce free-tier usage limits and manage Premium subscriptions</li>
            <li>To display leaderboard rankings (only with your consent via portfolio verification)</li>
            <li>To send transactional emails (magic links, billing receipts, important notices)</li>
            <li>To detect and prevent fraud or abuse</li>
          </ul>
          We do not sell your personal data to third parties. We do not use your data for advertising.
        </Section>

        <Section title="4. AI processing">
          Portfolio analysis, signals, and portfolio verification are powered by Anthropic's Claude API. Data sent to Claude is subject to Anthropic's data processing terms. We do not use your data to train AI models. Analysis results are stored in your account so you can review them later.
        </Section>

        <Section title="5. Data sharing">
          We share data only with:
          <ul style={{ paddingLeft: 20, lineHeight: 2, marginTop: 8 }}>
            <li><strong>Supabase</strong> — database and authentication (hosted in AWS ap-southeast-2)</li>
            <li><strong>Anthropic</strong> — AI analysis processing</li>
            <li><strong>Vercel</strong> — frontend hosting</li>
            <li><strong>Railway</strong> — backend hosting</li>
          </ul>
          All processors are required to handle data in accordance with applicable privacy laws.
        </Section>

        <Section title="6. Cookies and local storage">
          We use browser local storage to remember your theme preference (light/dark). We use session cookies set by Supabase for authentication. We do not use advertising or tracking cookies.
        </Section>

        <Section title="7. Data retention">
          Your account data is retained while your account is active. If you delete your account, we will delete your personal data within 30 days, except where we are required to retain it by law (e.g. billing records for up to 7 years).
        </Section>

        <Section title="8. Your rights">
          Under the New Zealand Privacy Act 2020, you have the right to:
          <ul style={{ paddingLeft: 20, lineHeight: 2, marginTop: 8 }}>
            <li>Request access to the personal information we hold about you</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your account and associated data</li>
            <li>Withdraw consent for optional data processing at any time</li>
          </ul>
          To exercise any of these rights, email <a href="mailto:support@fennecsi.com" style={{ color: 'var(--primary)' }}>support@fennecsi.com</a>.
        </Section>

        <Section title="9. Security">
          We use industry-standard security practices including encrypted connections (HTTPS), hashed credentials, and row-level security on our database. However, no system is completely secure — please use a strong, unique email account and report any suspected breach immediately.
        </Section>

        <Section title="10. Children">
          Fennec SI is not intended for users under 18. We do not knowingly collect data from children. If you believe a child has created an account, contact us and we will delete it.
        </Section>

        <Section title="11. Changes to this policy">
          We may update this policy from time to time. We will notify you of material changes by email or in-app notice at least 14 days in advance.
        </Section>

        <Section title="12. Contact">
          Privacy questions or complaints: <a href="mailto:support@fennecsi.com" style={{ color: 'var(--primary)' }}>support@fennecsi.com</a>
        </Section>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--border)', display: 'flex', gap: 16 }}>
          <Link href="/terms" style={{ color: 'var(--primary)', fontSize: 14, textDecoration: 'none' }}>Terms of Service →</Link>
          <Link href="/login" style={{ color: 'var(--text2)', fontSize: 14, textDecoration: 'none' }}>← Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>{title}</h2>
      <div style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.8 }}>{children}</div>
    </div>
  )
}
