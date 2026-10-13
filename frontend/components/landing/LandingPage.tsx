'use client'
import Link from 'next/link'
import { FoxIcon } from '@/components/shared/FoxIcon'
import { IconCheck, IconArrowRight } from '@tabler/icons-react'

// ── Feature cards ─────────────────────────────────────────────────────────────

const FEATURES = [
  {
    emoji: '📈',
    title: 'Portfolio Tracking',
    desc: 'Track NZ, ASX & US stocks in one place. Real-time prices, P&L, AI signals, and performance charts.',
  },
  {
    emoji: '🏦',
    title: 'Household Finance',
    desc: 'Sync your NZ bank accounts via Akahu. Track spending by category, set budgets, manage recurring bills.',
  },
  {
    emoji: '🦊',
    title: 'Fennec AI',
    desc: 'Context-aware AI adviser that knows your portfolio and finances. Ask anything — it adapts to the page you\'re on.',
  },
  {
    emoji: '🥝',
    title: 'KiwiSaver Tracker',
    desc: 'Track your KiwiSaver balance, model retirement projections, and see when you\'ll hit key milestones.',
  },
  {
    emoji: '🎯',
    title: 'Savings Goals',
    desc: 'Set goals for holidays, emergencies, or big purchases. Track progress and see how long until you get there.',
  },
  {
    emoji: '🔔',
    title: 'Smart Alerts',
    desc: 'Price alerts and AI signal changes sent to your email. Know the moment your targets are triggered.',
  },
  {
    emoji: '🏆',
    title: 'Leaderboard & Community',
    desc: 'Share picks, compete on verified portfolio returns, and learn from other NZ & ASX investors.',
  },
  {
    emoji: '🔒',
    title: 'Secure & Private',
    desc: 'Bank sync via Akahu — read-only access. Keys encrypted with AES-256. Hosted on Vercel + Railway.',
  },
]

const FREE_FEATURES = [
  'Portfolio tracking (NZ, ASX, US)',
  '10 AI analyses per day',
  'Community feed access',
  'Watchlist up to 20 stocks',
  'Daily top 10 AI picks',
  'Household finance overview',
  'KiwiSaver projection tool',
]

const PRO_FEATURES = [
  'Unlimited AI analyses (Claude)',
  'Fennec AI — unlimited chat',
  'NZ bank sync via Akahu',
  'Portfolio verification & badges',
  'Leaderboard & premium community',
  'Real-time price alerts & email',
  'CSV & screenshot import',
  'Deep-dive reports & AI drafts',
]

const COMMUNITY_POSTS = [
  { user: 'kiwi_trader', initial: 'K', bg: 'var(--primary)', signal: 'BUY', ticker: 'AAPL', body: '📱 Apple Q1 earnings crush estimates. $AAPL BUY — services revenue up 17% YoY. Target $230.', time: '2m ago', likes: 12 },
  { user: 'asx_bull', initial: 'A', bg: '#10b981', signal: 'HOLD', ticker: 'BHP', body: '⛏️ Iron ore holding steady. BHP looks range-bound near-term. Accumulate on dips.', time: '8m ago', likes: 7 },
  { user: 'nzx_picks', initial: 'N', bg: '#f59e0b', signal: 'BUY', ticker: 'FPH', body: '🏥 Fisher & Paykel Health recovering well. Export sales data solid. Long-term BUY.', time: '15m ago', likes: 19 },
]

function SignalPill({ signal }: { signal: string }) {
  const styles: Record<string, React.CSSProperties> = {
    BUY:  { color: 'var(--green)', background: 'rgba(31,204,110,.1)',  border: '1px solid rgba(31,204,110,.3)' },
    SELL: { color: 'var(--red)',   background: 'rgba(240,84,84,.1)',   border: '1px solid rgba(240,84,84,.3)' },
    HOLD: { color: 'var(--amber)', background: 'rgba(240,169,64,.1)',  border: '1px solid rgba(240,169,64,.3)' },
  }
  return (
    <span style={{ ...styles[signal], borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>
      {signal}
    </span>
  )
}

export default function LandingPage() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>

      {/* ── Nav ── */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ background: 'var(--primary)', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FoxIcon size={32} />
          </div>
          <div>
            <span style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 800, fontSize: 16, display: 'block', lineHeight: 1.1 }}>Fennec</span>
            <span style={{ fontSize: 9, color: 'var(--text3)', fontStyle: 'italic' }}>spend &amp; invest</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <a href="#features" style={{ color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontSize: 14, textDecoration: 'none' }}>Features</a>
          <a href="#pricing" style={{ color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontSize: 14, textDecoration: 'none' }}>Pricing</a>
          <Link href="/app/community" style={{ color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontSize: 14, textDecoration: 'none' }}>Community</Link>
          <Link href="/login" style={{ color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontSize: 14, textDecoration: 'none' }}>Sign in</Link>
          <Link href="/login" style={{ background: 'var(--primary)', color: 'white', padding: '8px 18px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '60px 32px 56px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'var(--primary-light)', border: '1px solid var(--primary)', fontSize: 12, color: 'var(--primary)', marginBottom: 24, fontFamily: 'Syne, sans-serif' }}>
          ✦ NZ stocks · household finance · AI adviser
        </div>
        <h1 style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: 'clamp(2rem,5vw,3.4rem)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20 }}>
          Your complete<br />
          <span style={{ color: 'var(--primary)' }}>personal financial hub</span>
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 17, lineHeight: 1.7, marginBottom: 40, maxWidth: 580, margin: '0 auto 40px' }}>
          Track your NZ, ASX &amp; US investments. Manage household finances and KiwiSaver.
          Get answers from an AI adviser that knows your full financial picture.
        </p>

        {/* Mini feature pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 36 }}>
          {['📈 Stock portfolio', '🏦 Bank sync (Akahu)', '🥝 KiwiSaver tracker', '🎯 Savings goals', '🦊 AI adviser', '🏆 Community'].map(f => (
            <span key={f} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', fontFamily: 'Syne, sans-serif' }}>{f}</span>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <Link
            href="/login"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--primary)', color: 'white', padding: '14px 28px', borderRadius: 10, fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, textDecoration: 'none' }}
          >
            Start for free <IconArrowRight size={18} />
          </Link>
          <Link
            href="/app/community"
            style={{ color: 'var(--text2)', padding: '14px 28px', border: '1px solid var(--border)', borderRadius: 10, fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 16, textDecoration: 'none' }}
          >
            View community
          </Link>
        </div>
        <p style={{ color: 'var(--text3)', fontSize: 12 }}>No credit card required · Free tier available</p>
      </section>

      {/* ── Dashboard preview strip ── */}
      <section style={{ maxWidth: 860, margin: '0 auto', padding: '0 32px 60px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Net Worth', value: '$189,240', sub: 'portfolio + bank + KiwiSaver', color: 'var(--primary)' },
            { label: 'Portfolio', value: '$94,580', sub: '+17.2% all time', color: '#10b981' },
            { label: 'This Month', value: '-$3,210', sub: 'household spending', color: '#f59e0b' },
            { label: 'KiwiSaver', value: '$52,400', sub: 'projected $480k at 65', color: '#8b5cf6' },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>{stat.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, sans-serif', color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Community feed ── */}
      <section style={{ maxWidth: 680, margin: '0 auto', padding: '0 32px 64px' }}>
        <p style={{ textAlign: 'center', color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
          Live Community Feed
        </p>
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden' }}>
          {COMMUNITY_POSTS.map((p, i) => (
            <div key={i} style={{ padding: '16px 20px', borderBottom: i < COMMUNITY_POSTS.length - 1 ? '1px solid var(--border)' : undefined, opacity: i === 0 ? 1 : i === 1 ? 0.65 : 0.35 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white', fontWeight: 700 }}>
                  {p.initial}
                </div>
                <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>{p.user}</span>
                <SignalPill signal={p.signal} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginLeft: 2 }}>{p.ticker}</span>
                <span style={{ color: 'var(--text2)', fontSize: 12, marginLeft: 'auto' }}>{p.time}</span>
              </div>
              <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{p.body}</p>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>❤️ {p.likes}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px 64px' }}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>
          Everything in one place
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 15, marginBottom: 40 }}>Investing and household finances — finally in a single dashboard.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {FEATURES.map(({ emoji, title, desc }) => (
            <div key={title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>{emoji}</div>
              <h3 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{title}</h3>
              <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Fennec AI callout ── */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '0 32px 64px' }}>
        <div style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 16, padding: '28px 32px', display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0 }}><FoxIcon size={56} /></div>
          <div>
            <h3 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, color: 'var(--primary)', marginBottom: 8 }}>Meet Fennec AI</h3>
            <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>
              An AI adviser that knows your full financial picture — your holdings, bank balances, KiwiSaver, spending, and goals. It changes focus automatically based on what you're looking at, so answers are always relevant.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['"Am I on track for retirement?"', '"Should I rebalance my portfolio?"', '"Where am I overspending?"', '"What\'s my net worth trajectory?"'].map(q => (
                <span key={q} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)' }}>{q}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" style={{ maxWidth: 820, margin: '0 auto', padding: '0 32px 80px' }}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 700, textAlign: 'center', marginBottom: 40 }}>
          Simple, transparent pricing
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Free</p>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 36, fontWeight: 800, marginBottom: 20 }}>
              $0<span style={{ fontSize: 14, color: 'var(--text2)' }}>/mo</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {FREE_FEATURES.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconCheck size={15} style={{ color: 'var(--green)', flexShrink: 0 }} />
                  <span style={{ fontSize: 14 }}>{f}</span>
                </div>
              ))}
            </div>
            <Link href="/login" style={{ display: 'block', textAlign: 'center', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textDecoration: 'none' }}>
              Get started free
            </Link>
          </div>

          <div style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 12, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 20 }}>Premium</p>
              <span style={{ background: 'var(--primary)', color: 'white', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, fontFamily: 'Syne, sans-serif' }}>POPULAR</span>
            </div>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 36, fontWeight: 800, marginBottom: 20, color: 'var(--primary)' }}>
              $9<span style={{ fontSize: 14, color: 'var(--text2)' }}>/mo</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {PRO_FEATURES.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconCheck size={15} style={{ color: 'var(--green)', flexShrink: 0 }} />
                  <span style={{ fontSize: 14 }}>{f}</span>
                </div>
              ))}
            </div>
            <Link href="/login" style={{ display: 'block', textAlign: 'center', padding: '10px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, textDecoration: 'none' }}>
              Start Premium free for 7 days
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '24px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FoxIcon size={22} />
            <span style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: 14 }}>Fennec</span>
            <span style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' }}>spend &amp; invest</span>
          </div>
          <p style={{ color: 'var(--text2)', fontSize: 12 }}>© 2026 Fennec. Not financial advice.</p>
          <div style={{ display: 'flex', gap: 20 }}>
            {['Privacy', 'Terms'].map(l => (
              <a key={l} href="#" style={{ color: 'var(--text2)', fontSize: 12, fontFamily: 'Syne, sans-serif', textDecoration: 'none' }}>{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
