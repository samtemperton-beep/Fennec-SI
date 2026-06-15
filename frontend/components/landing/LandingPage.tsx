'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  IconChartBar, IconBrain, IconBell, IconUsers, IconCheck,
  IconTrendingUp, IconShieldCheck, IconArrowRight, IconStar
} from '@tabler/icons-react'

const FEATURES = [
  { icon: IconChartBar, title: 'Portfolio Tracking', desc: 'Track NZ, ASX & US stocks in one place. Real-time prices, P&L, and performance metrics.' },
  { icon: IconBrain, title: 'AI Signals', desc: 'Claude AI generates BUY/HOLD/SELL signals for every holding. Streaming AI advisor chat.' },
  { icon: IconTrendingUp, title: 'Daily Top 10 Picks', desc: 'AI-curated top 10 stocks across markets. Updated every 6 hours with projected returns.' },
  { icon: IconBell, title: 'Smart Alerts', desc: 'Price alerts and AI signal changes. Email notifications via Resend when triggered.' },
  { icon: IconUsers, title: 'Investment Community', desc: 'Share picks, milestones, and market takes. Real-time community feed with leaderboards.' },
  { icon: IconShieldCheck, title: 'Secure & Private', desc: 'Your API keys encrypted with AES-256. Hosted on Vercel + Railway for reliability.' },
]

const MOCK_POSTS = [
  { user: 'kiwi_trader', signal: 'BUY', ticker: 'AAPL', body: '📱 Apple Q1 earnings crush estimates. $AAPL BUY — services revenue up 17% YoY. Target $230.', time: '2m ago', likes: 12 },
  { user: 'asx_bull', signal: 'HOLD', ticker: 'BHP', body: '⛏️ Iron ore holding steady. BHP looks range-bound near-term. Accumulate on dips.', time: '8m ago', likes: 7 },
  { user: 'nzx_picks', signal: 'BUY', ticker: 'FPH', body: '🏥 Fisher & Paykel Health recovering well. Export sales data solid. Long-term BUY.', time: '15m ago', likes: 19 },
  { user: 'growth_mode', signal: 'SELL', ticker: 'META', body: '⚠️ Valuation stretched post-run. Taking profits on $META at these levels. Risk/reward poor.', time: '32m ago', likes: 4 },
]

export default function LandingPage() {
  const [postIdx, setPostIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setPostIdx(i => (i + 1) % MOCK_POSTS.length), 3000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div style={{ background: 'var(--accent)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconChartBar size={18} color="white" />
          </div>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18 }}>Fennec SI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" style={{ color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontSize: 14 }}>Sign in</Link>
          <Link
            href="/login"
            style={{
              background: 'var(--accent)', color: 'white',
              padding: '8px 18px', borderRadius: 8,
              fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14,
            }}
          >
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6"
          style={{ background: 'rgba(91,106,255,0.1)', border: '1px solid rgba(91,106,255,0.3)', fontSize: 12, color: 'var(--accent2)' }}
        >
          <IconStar size={12} />
          <span style={{ fontFamily: 'Syne, sans-serif' }}>AI-powered · NZ, ASX & US markets</span>
        </div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20 }}>
          Your AI-powered stock<br />
          <span style={{ color: 'var(--accent)' }}>portfolio tracker</span>
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 18, lineHeight: 1.6, marginBottom: 40, maxWidth: 600, margin: '0 auto 40px' }}>
          Track NZ, ASX & US stocks. Get AI signals, daily picks, and community insights — all in one place.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/login"
            className="flex items-center gap-2"
            style={{
              background: 'var(--accent)', color: 'white',
              padding: '14px 28px', borderRadius: 10,
              fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16,
            }}
          >
            Start for free <IconArrowRight size={18} />
          </Link>
          <Link
            href="/app/community"
            style={{
              color: 'var(--text2)', padding: '14px 28px',
              border: '1px solid var(--border)', borderRadius: 10,
              fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 16,
            }}
          >
            View community
          </Link>
        </div>
        <p className="mt-4" style={{ color: 'var(--text2)', fontSize: 12 }}>
          No credit card required · Free tier includes 20 AI analyses/day
        </p>
      </section>

      {/* Live community preview */}
      <section className="max-w-2xl mx-auto px-6 pb-16">
        <p className="text-center mb-4" style={{ color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontSize: 13 }}>
          LIVE COMMUNITY FEED
        </p>
        <div
          style={{
            border: '1px solid var(--border)', borderRadius: 12,
            background: 'var(--surface)', overflow: 'hidden',
          }}
        >
          {MOCK_POSTS.map((p, i) => (
            <div
              key={i}
              style={{
                padding: '16px 20px',
                borderBottom: i < MOCK_POSTS.length - 1 ? '1px solid var(--border)' : undefined,
                opacity: i === postIdx ? 1 : 0.5,
                transition: 'opacity 0.3s',
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: 'white', fontWeight: 700, fontFamily: 'Syne, sans-serif',
                  }}
                >
                  {p.user[0].toUpperCase()}
                </div>
                <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>{p.user}</span>
                <span className={p.signal === 'BUY' ? 'signal-buy' : p.signal === 'SELL' ? 'signal-sell' : 'signal-hold'}>
                  {p.signal} {p.ticker}
                </span>
                <span style={{ color: 'var(--text2)', fontSize: 12, marginLeft: 'auto' }}>{p.time}</span>
              </div>
              <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{p.body}</p>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>❤️ {p.likes}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <h2 className="text-center mb-12" style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 700 }}>
          Everything you need to invest smarter
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <div key={i} className="card hover:border-accent transition-colors" style={{ transition: 'border-color 0.2s' }}>
              <div
                className="mb-3 w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(91,106,255,0.15)' }}
              >
                <f.icon size={20} style={{ color: 'var(--accent2)' }} />
              </div>
              <h3 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-center mb-12" style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 700 }}>
          Simple, transparent pricing
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Free */}
          <div className="card">
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Free</p>
            <p style={{ fontSize: 36, fontWeight: 800, fontFamily: 'DM Mono, monospace', marginBottom: 16 }}>$0<span style={{ fontSize: 14, color: 'var(--text2)' }}>/mo</span></p>
            {['Basic portfolio tracking', '20 AI analyses per day', 'Community feed (read-only for 7 days)', 'Watchlist up to 20 stocks', 'Daily top 10 picks'].map(f => (
              <div key={f} className="flex items-center gap-2 mb-2">
                <IconCheck size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
                <span style={{ fontSize: 14 }}>{f}</span>
              </div>
            ))}
            <Link href="/login" className="block text-center mt-6" style={{ background: 'var(--surface2)', color: 'var(--text)', padding: '10px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600, border: '1px solid var(--border)' }}>
              Get started free
            </Link>
          </div>
          {/* Pro */}
          <div className="card" style={{ border: '1px solid var(--accent)', background: 'rgba(91,106,255,0.05)' }}>
            <div className="flex items-center justify-between mb-1">
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 20 }}>Pro</p>
              <span style={{ background: 'var(--accent)', color: 'white', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, fontFamily: 'Syne, sans-serif' }}>POPULAR</span>
            </div>
            <p style={{ fontSize: 36, fontWeight: 800, fontFamily: 'DM Mono, monospace', marginBottom: 16, color: 'var(--accent2)' }}>$9<span style={{ fontSize: 14, color: 'var(--text2)' }}>/mo</span></p>
            {['Unlimited AI analyses', 'Real-time price alerts', 'Email notifications', 'Priority analysis queue', 'Full community posting', 'IPO analysis & calendar', 'Newsletter digest', 'CSV & screenshot import'].map(f => (
              <div key={f} className="flex items-center gap-2 mb-2">
                <IconCheck size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ fontSize: 14 }}>{f}</span>
              </div>
            ))}
            <Link href="/login" className="block text-center mt-6" style={{ background: 'var(--accent)', color: 'white', padding: '10px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
              Start Pro free for 7 days
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '24px' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <IconChartBar size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14 }}>Fennec SI</span>
          </div>
          <p style={{ color: 'var(--text2)', fontSize: 12 }}>© 2024 Fennec SI. Not financial advice.</p>
          <div className="flex gap-4">
            {['Privacy', 'Terms', 'GitHub'].map(l => (
              <a key={l} href="#" style={{ color: 'var(--text2)', fontSize: 12, fontFamily: 'Syne, sans-serif' }}>{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
