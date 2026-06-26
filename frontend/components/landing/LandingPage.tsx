'use client'
import Link from 'next/link'
import { IconCheck, IconArrowRight } from '@tabler/icons-react'

const FEATURES = [
  {
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    title: 'Portfolio Tracking',
    desc: 'Track NZ, ASX & US stocks in one place. Real-time prices, P&L, and performance metrics.',
  },
  {
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58"/></svg>,
    title: 'AI Signals',
    desc: 'Claude AI generates BUY/HOLD/SELL signals for every holding. Streaming AI advisor chat.',
  },
  {
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    title: 'Daily Top 10 Picks',
    desc: 'AI-curated top 10 stocks across markets. Updated with projected returns and catalyst reasoning.',
  },
  {
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
    title: 'Smart Alerts',
    desc: 'Price alerts and AI signal changes. Email notifications when your targets are triggered.',
  },
  {
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    title: 'Investment Community',
    desc: 'Share picks, milestones, and market takes. Real-time community feed with leaderboards.',
  },
  {
    icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    title: 'Secure & Private',
    desc: 'Your API keys encrypted with AES-256. Hosted on Vercel + Railway for reliability.',
  },
]

const FREE_FEATURES = [
  'Basic portfolio tracking',
  '10 AI analyses per day',
  'Community feed (read-only 7 days)',
  'Watchlist up to 20 stocks',
  'Daily top 10 picks',
]

const PRO_FEATURES = [
  'Unlimited AI analyses (Claude)',
  'Portfolio verification & badges',
  'Leaderboard access',
  'Real-time price alerts & email',
  'IPO analysis & newsletter digest',
  'Deep-dive reports & AI drafts',
  'CSV & screenshot import',
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
          <div style={{ background: 'var(--primary)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          </div>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18 }}>Fennec SI</span>
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
          ✦ AI-powered · NZ, ASX &amp; US markets
        </div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(2rem,5vw,3.6rem)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20 }}>
          Your AI-powered stock<br />
          <span style={{ color: 'var(--primary)' }}>portfolio tracker</span>
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 18, lineHeight: 1.6, marginBottom: 40, maxWidth: 560, margin: '0 auto 40px' }}>
          Track NZ, ASX &amp; US stocks. Get AI signals, daily picks, and community insights — all in one place.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
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
        <p style={{ color: 'var(--text2)', fontSize: 12 }}>No credit card required · Free tier includes 10 AI analyses/day</p>
      </section>

      {/* ── Live community feed ── */}
      <section style={{ maxWidth: 680, margin: '0 auto', padding: '0 32px 64px' }}>
        <p style={{ textAlign: 'center', color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
          Live Community Feed
        </p>
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden' }}>
          {COMMUNITY_POSTS.map((p, i) => (
            <div
              key={i}
              style={{ padding: '16px 20px', borderBottom: i < COMMUNITY_POSTS.length - 1 ? '1px solid var(--border)' : undefined, opacity: i === 0 ? 1 : i === 1 ? 0.65 : 0.35 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white', fontWeight: 700, fontFamily: 'Syne, sans-serif' }}>
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
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 700, textAlign: 'center', marginBottom: 40 }}>
          Everything you need to invest smarter
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {FEATURES.map(({ icon, title, desc }) => (
            <div key={title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, transition: 'border-color 0.2s' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, color: 'var(--primary)' }}>
                {icon}
              </div>
              <h3 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 8 }}>{title}</h3>
              <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" style={{ maxWidth: 820, margin: '0 auto', padding: '0 32px 80px' }}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 700, textAlign: 'center', marginBottom: 40 }}>
          Simple, transparent pricing
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* Free */}
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

          {/* Premium */}
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
            <div style={{ background: 'var(--primary)', borderRadius: 6, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
            </div>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14 }}>Fennec SI</span>
          </div>
          <p style={{ color: 'var(--text2)', fontSize: 12 }}>© 2026 Fennec SI. Not financial advice.</p>
          <div style={{ display: 'flex', gap: 20 }}>
            {['Privacy', 'Terms', 'GitHub'].map(l => (
              <a key={l} href="#" style={{ color: 'var(--text2)', fontSize: 12, fontFamily: 'Syne, sans-serif', textDecoration: 'none' }}>{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
