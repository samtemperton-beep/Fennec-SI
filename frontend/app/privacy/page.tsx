import Link from 'next/link'
import { FoxIcon } from '@/components/shared/FoxIcon'

export const metadata = { title: 'Privacy Policy — Fennec' }

// Keep in step with what the app actually does: the processors in section 5, the
// FAQ (backend/src/services/faq.ts) and the Fennec chat's guide (appGuide.ts).
export default function PrivacyPage() {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '0 0 80px' }}>
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', padding: '16px 24px' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}>
          <FoxIcon size={24} />
          <span style={{ fontWeight: 800, fontSize: 15, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Fennec</span>
        </Link>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 16px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 40 }}>Last updated: 10 November 2026</p>

        <Section title="1. Who we are">
          Fennec SI (short for Save &amp; Invest, and called Fennec in this policy) is a New Zealand app for saving and investing in one place, available at fennecsi.com. This policy explains what personal information we collect, how we use and protect it, and your rights under the New Zealand Privacy Act 2020.
          <br /><br />
          Fennec is currently in testing. Features change often, and we&apos;ll update this policy as they do.
        </Section>

        <Section title="2. What we collect">
          <strong>Your account:</strong> your email address, how you sign in (password, email link or Google), and profile details you choose to add, such as a username, photo, location or profession. Passwords are handled by our sign-in provider and stored only in hashed form; we never see them.
          <br /><br />
          <strong>Money information you add or connect:</strong> bank accounts, balances and transactions, categories, budgets, bills, savings goals, KiwiSaver details, home loan figures, investment holdings, watchlists, price alerts, and (if you use the Business section) invoices and business settings.
          <br /><br />
          <strong>Bank connections (optional):</strong> if you connect your bank, we receive account and transaction data through Akahu, a New Zealand open-banking provider, with your consent. Access is read-only: Fennec can&apos;t move money or make payments, and we never receive your bank login.
          <br /><br />
          <strong>Gmail (optional, Premium):</strong> if you connect Gmail, Fennec has read-only access to find bills and invoices. Matching emails are read to pull out the bill details (sender, amount, due date and reference), and we store those details, not your emails. You can disconnect at any time.
          <br /><br />
          <strong>Broker statements (optional, Premium):</strong> if you verify your portfolio, the statement you upload is read to confirm your holdings and isn&apos;t kept after verification.
          <br /><br />
          <strong>Rates notices (optional):</strong> if you upload a rates notice or revaluation letter on the Home Loan page, it&apos;s read to find your council valuation. The file itself isn&apos;t kept. The details read off it (the council, address, valuation reference and values) are saved, encrypted, so you don&apos;t need to upload it again, and are deleted if you change your address or delete your account.
          <br /><br />
          <strong>KiwiSaver screenshots (optional):</strong> if your KiwiSaver provider can&apos;t be connected, you can upload a screenshot or statement on the KiwiSaver page. It&apos;s read to fill in your provider, fund and balance for you to check, and the file itself isn&apos;t kept.
          <br /><br />
          <strong>About you (optional):</strong> if you choose to, your age range, what you&apos;re working towards (such as buying a home or paying off debt), and household details you give the budget helper (how many adults and children, take-home pay, rent or mortgage, and whether you run a car). These are used to suggest budgets and goals and to give Fennec&apos;s AI context, and you can change them on the Goals page.
          <br /><br />
          <strong>Pledges and accountability buddies (optional):</strong> places you pledge not to spend, and transactions that match them. If you invite a buddy, we keep the email address you give and send it one invitation. Once they accept, they see what you choose to share: your pledges, streaks and level, slips (with amounts only if you allow it), and the names of budgets you go over or goals that pass their date. Your points and badges are worked out from your own budgets, transactions and goals.
          <br /><br />
          <strong>Partner sharing (optional):</strong> if you link with a partner, we record the link and what you&apos;ve chosen to share with them.
          <br /><br />
          <strong>Category rules:</strong> when you save a rule that uses one of Fennec&apos;s standard categories, its keyword and category (for example &quot;woolworths&quot; and Groceries) may be suggested for Fennec&apos;s shared category list, which the team reviews before anyone&apos;s transactions use it. Nothing that identifies you or your transactions is kept with the suggestion.
          <br /><br />
          <strong>Community:</strong> posts and replies you publish, posts you like, people you block, reports you make, and, if you verify your portfolio, your leaderboard entry. Reports are seen only by Fennec&apos;s administrator, not by the person reported.
          <br /><br />
          <strong>Feedback:</strong> messages you send with the Feedback button, any screenshot you attach, the page you were on, and your browser type.
          <br /><br />
          <strong>Usage and technical data:</strong> how many AI requests you&apos;ve made (to apply plan limits), when you last used the app, and standard server logs, which include IP addresses.
        </Section>

        <Section title="3. How we use it">
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>To run Fennec for you: show your money in one place, sync connected accounts, and send the reminders, alerts and summaries you choose in Notifications → Preferences (these emails can include amounts, such as what a bill is for)</li>
            <li>To produce AI answers, analysis and summaries based on your own figures</li>
            <li>To share what you&apos;ve chosen with a linked partner</li>
            <li>To apply plan features and limits, and handle Premium requests</li>
            <li>To send account emails (sign-in links, password resets, alerts) and reply to feedback</li>
            <li>To keep Fennec secure, fix problems, and prevent fraud and abuse</li>
          </ul>
          We don&apos;t sell your personal information, and we don&apos;t use it for advertising.
        </Section>

        <Section title="4. Who can see your information">
          Your information is stored under your account, and our database only lets a signed-in person read or change their own records. Other Fennec users can&apos;t see it, except:
          <ul style={{ paddingLeft: 20, lineHeight: 2, marginTop: 8 }}>
            <li>accounts, bills and goals you choose to share with a linked partner</li>
            <li>what you choose to share with an accountability buddy who has accepted your invitation</li>
            <li>community posts and replies, which other users can read, along with your username, avatar, badges and whether your portfolio is verified</li>
            <li>the leaderboard, which shows your username and percentage performance, never dollar amounts</li>
          </ul>
          Fennec&apos;s administrator can see account emails, usernames, plans and AI usage counts to run the service. The administrator also reviews community posts and replies that have been reported. The admin tools don&apos;t show anyone&apos;s accounts, transactions or investments.
        </Section>

        <Section title="5. AI processing">
          Fennec&apos;s AI features use Anthropic (Claude) and Google (Gemini). When you use one, we send the provider what it needs for that answer: for example your question and a summary of the relevant figures, a holding you&apos;ve asked to analyse, the text of a bill email, a rates notice or KiwiSaver screenshot you&apos;ve uploaded, or a broker statement you&apos;ve uploaded for verification. We don&apos;t send your password or bank login.
          <br /><br />
          We use these providers through their business APIs, under their terms for data handling. We don&apos;t use your information to train AI models. AI answers can be wrong, and they&apos;re general information, not financial advice.
        </Section>

        <Section title="6. Service providers">
          We use these providers to run Fennec. Each gets only what it needs for its part:
          <ul style={{ paddingLeft: 20, lineHeight: 2, marginTop: 8 }}>
            <li><strong>Supabase</strong>: database, sign-in and file storage (hosted on Amazon Web Services in Sydney, Australia)</li>
            <li><strong>Vercel</strong>: hosts the website</li>
            <li><strong>Railway</strong>: hosts the server that syncs data and runs AI requests</li>
            <li><strong>Akahu</strong>: bank and investment account connections</li>
            <li><strong>Toitū Te Whenua LINZ</strong>: looks up property details and council valuations for the address you enter on the Home Loan page</li>
            <li><strong>Anthropic</strong> and <strong>Google</strong>: AI processing; Google also provides Google sign-in and the Gmail connection</li>
            <li><strong>Resend</strong>: sends account, alert and feedback emails</li>
            <li><strong>Finnhub</strong> and <strong>Yahoo Finance</strong>: market prices and news; we send them share codes only, never personal information</li>
          </ul>
          Some of these providers store or process information outside New Zealand, including in Australia and the United States. We choose providers that protect information in ways comparable to the Privacy Act.
        </Section>

        <Section title="7. Security">
          Information is encrypted in transit (HTTPS) and at rest. On top of that, bank and Gmail connection keys, IRD, GST and bank account numbers, your home address and the property details looked up for it are encrypted with a key held separately from the database, so a copy of the database alone wouldn&apos;t reveal them. For KiwiSaver we keep only the month and year you were born, not the full date. On screen, dollar amounts and those details start hidden until you tap the eye, and you&apos;re signed out after a period without activity. You can adjust these in Settings → Security &amp; privacy. Database rules keep each person&apos;s records to themselves, and you can turn on two-factor sign-in in Settings. Bank access is read-only. No system is completely secure, so please use a strong, unique password, and tell us straight away if you think your account has been accessed by someone else.
        </Section>

        <Section title="8. Cookies and browser storage">
          We use cookies set by our sign-in provider to keep you signed in. Your browser also stores a few preferences, such as light or dark theme, cards you&apos;ve hidden and your security settings, and the time you were last active (so Fennec can sign you out when you&apos;re away). We don&apos;t use advertising or tracking cookies.
        </Section>

        <Section title="9. How long we keep it">
          We keep your information while your account is open. Deleting your account in Settings removes your data straight away, apart from bills and goals you shared with a linked partner, which stay with them. Copies in backups and server logs are removed as those expire. We may keep information for longer only where the law requires it.
        </Section>

        <Section title="10. Your rights">
          Under the Privacy Act 2020 you can ask to see the personal information we hold about you and ask us to correct it. You can delete your account at any time in Settings, and disconnect your bank or Gmail whenever you like. To make a request, email{' '}
          <a href="mailto:support@fennecsi.com" style={{ color: 'var(--primary)' }}>support@fennecsi.com</a>. If you&apos;re not happy with how we&apos;ve handled your information, you can complain to the{' '}
          <a href="https://www.privacy.org.nz" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>Office of the Privacy Commissioner</a>.
        </Section>

        <Section title="11. Age">
          Fennec is for people aged 18 and over. If you think someone under 18 has an account, contact us and we&apos;ll delete it.
        </Section>

        <Section title="12. Changes to this policy">
          We&apos;ll update this page when Fennec changes how it handles information, and tell you by email or in the app before any significant change takes effect.
        </Section>

        <Section title="13. Contact">
          Privacy questions or requests: <a href="mailto:support@fennecsi.com" style={{ color: 'var(--primary)' }}>support@fennecsi.com</a>
        </Section>

        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/faq" style={{ color: 'var(--primary)', fontSize: 14, textDecoration: 'none' }}>FAQ</Link>
          <Link href="/terms" style={{ color: 'var(--primary)', fontSize: 14, textDecoration: 'none' }}>Terms of Service</Link>
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
