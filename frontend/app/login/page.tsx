'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { IconMail, IconLoader } from '@tabler/icons-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState<'google' | 'magic' | null>(null)
  const supabase = createClient()

  async function signInGoogle() {
    setLoading('google')
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app/portfolio` },
    })
  }

  async function signInMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading('magic')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/app/portfolio` },
    })
    setLoading(null)
    if (!error) setSent(true)
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 480px' }}>

      {/* ── Left panel: value prop ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '60px 48px', borderRight: '1px solid var(--border)',
        background: 'linear-gradient(135deg,rgba(91,106,255,.07) 0%,var(--bg) 60%)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Ambient glows */}
        <div style={{ position: 'absolute', top: -100, left: -100, width: 400, height: 400, background: 'radial-gradient(circle,rgba(91,106,255,.12) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, right: -60, width: 300, height: 300, background: 'radial-gradient(circle,rgba(16,185,129,.08) 0%,transparent 70%)', pointerEvents: 'none' }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 56 }}>
          <div style={{ background: 'var(--accent)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          </div>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18 }}>Fennec SI</span>
        </div>

        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(1.6rem,3vw,2.4rem)', fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>
          Invest smarter with<br /><span style={{ color: 'var(--accent)' }}>AI at your side</span>
        </h2>
        <p style={{ color: 'var(--text2)', fontSize: 16, lineHeight: 1.7, marginBottom: 48, maxWidth: 440 }}>
          Track your NZ, ASX &amp; US portfolio, get real-time AI signals, and compete on verified leaderboards.
        </p>

        {/* Feature bullets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>
          {[
            {
              bg: 'rgba(91,106,255,.15)', color: 'var(--accent2)',
              icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58"/></svg>,
              title: 'AI-powered signals on every holding',
              body: 'Claude generates BUY / HOLD / SELL reasoning in real time, calibrated to your risk profile.',
            },
            {
              bg: 'rgba(16,185,129,.12)', color: 'var(--green)',
              icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
              title: 'Verified portfolios & leaderboards',
              body: 'Upload your broker statement. Claude verifies your holdings and unlocks badges & the leaderboard.',
            },
            {
              bg: 'rgba(251,191,36,.1)', color: '#fbbf24',
              icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
              title: 'Hidden gems & daily top 10',
              body: 'AI-curated stock picks across US, ASX & NZX markets, updated daily with catalyst reasoning.',
            },
          ].map(({ bg, color, icon, title, body }) => (
            <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                {icon}
              </div>
              <div>
                <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{title}</p>
                <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>{body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Social proof */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex' }}>
            {['#5b6aff', '#10b981', '#f59e0b', '#ef4444'].map((bg, i) => (
              <div key={i} style={{ width: 28, height: 28, borderRadius: '50%', background: bg, border: '2px solid var(--bg)', marginLeft: i === 0 ? 0 : -8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white', fontWeight: 700, fontFamily: 'Syne, sans-serif' }}>
                {['K','A','S','M'][i]}
              </div>
            ))}
          </div>
          <div>
            <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 13, color: 'var(--green)' }}>★★★★★</p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>Trusted by 500+ investors across NZ &amp; AU</p>
          </div>
        </div>
      </div>

      {/* ── Right panel: login form ── */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px 36px', background: 'var(--surface)' }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 24, marginBottom: 6, textAlign: 'center' }}>Welcome back</h2>
          <p style={{ color: 'var(--text2)', fontSize: 14, textAlign: 'center', marginBottom: 32 }}>Sign in to your portfolio</p>

          {sent ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(91,106,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <IconMail size={26} style={{ color: 'var(--accent)' }} />
              </div>
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Check your email</p>
              <p style={{ color: 'var(--text2)', fontSize: 13 }}>We sent a magic link to <strong>{email}</strong></p>
              <button onClick={() => setSent(false)} style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--accent)', fontFamily: 'Syne, sans-serif', fontSize: 13, cursor: 'pointer' }}>
                ← Try a different email
              </button>
            </div>
          ) : (
            <>
              {/* Google */}
              <button
                onClick={signInGoogle}
                disabled={!!loading}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginBottom: 16, opacity: loading === 'google' ? 0.7 : 1 }}
              >
                {loading === 'google' ? <IconLoader size={18} className="animate-spin" /> : (
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                Continue with Google
              </button>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ color: 'var(--text2)', fontSize: 12, fontFamily: 'Syne, sans-serif' }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              {/* Magic link */}
              <form onSubmit={signInMagicLink}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Email
                </label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 14, outline: 'none', marginBottom: 10, display: 'block' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
                <button
                  type="submit"
                  disabled={!!loading || !email}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: loading === 'magic' || !email ? 0.7 : 1 }}
                >
                  {loading === 'magic' ? <IconLoader size={16} className="animate-spin" /> : <IconMail size={16} />}
                  Send magic link
                </button>
              </form>
            </>
          )}

          <p style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 11, marginTop: 20, lineHeight: 1.6 }}>
            By signing in you agree to our{' '}
            <a href="#" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Terms of Service</a>
            {' '}and{' '}
            <a href="#" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Privacy Policy</a>
          </p>

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 24, paddingTop: 20, textAlign: 'center' }}>
            <p style={{ color: 'var(--text2)', fontSize: 13 }}>
              Don&apos;t have an account?{' '}
              <a href="/login" style={{ color: 'var(--accent)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textDecoration: 'none', marginLeft: 4 }}>
                Sign up free →
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
