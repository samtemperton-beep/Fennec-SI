'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { safeNext } from '@/lib/safeNext'
import { checkEmail } from '@/lib/emailCheck'
import { checkPassword, PASSWORD_MIN } from '@/lib/password'
import { FoxIcon } from '@/components/shared/FoxIcon'
import { IconMail, IconLoader, IconLock, IconEye, IconEyeOff, IconShieldCheck, IconArrowLeft } from '@tabler/icons-react'

type Step = 'login' | 'mfa' | 'sent'
type Method = 'password' | 'magic'
// signin: existing account · signup: create one · forgot: email a reset link ·
// newpw: back from that link, choose a new password
type Mode = 'signin' | 'signup' | 'forgot' | 'newpw'
type Sent = 'magic' | 'confirm' | 'reset'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [method, setMethod] = useState<Method>('password')
  const [step, setStep] = useState<Step>('login')
  const [totpCode, setTotpCode] = useState('')
  const [factorId, setFactorId] = useState('')
  const [loading, setLoading] = useState<'google' | 'password' | 'magic' | 'totp' | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>('signin')
  const [sent, setSent] = useState<Sent>('magic')
  const [confirmPw, setConfirmPw] = useState('')
  const [suggestion, setSuggestion] = useState<string | null>(null) // "Did you mean ...?"
  const [keptEmail, setKeptEmail] = useState('') // the user said their address is right as typed

  function changeEmail(value: string) {
    setEmail(value)
    setSuggestion(null)
    setError('')
  }

  // Instant check when leaving the email box. Quiet about empty or half-typed
  // addresses; the full check runs on submit.
  function reviewEmail() {
    if (!email.trim()) return
    const c = checkEmail(email)
    if (!c.ok && 'suggestion' in c && keptEmail !== email) setSuggestion(c.suggestion)
    else if (!c.ok && 'reason' in c) setError(c.reason)
  }

  // Full check before anything is sent. Returns false if it should stop.
  async function emailIsUsable(): Promise<boolean> {
    const c = checkEmail(email)
    if (!c.ok && 'reason' in c) { setError(c.reason); return false }
    if (!c.ok && keptEmail !== email) { setSuggestion(c.suggestion); return false }
    const domain = c.ok ? c.domain : c.domain
    try {
      const r = await fetch(`/api/check-email-domain?domain=${encodeURIComponent(domain)}`)
      if (r.ok && (await r.json()).canReceive === false) {
        setError(`We can't find an email service at ${domain}. Check the part after the @.`)
        return false
      }
    } catch { /* a failed lookup must never block sign-up */ }
    return true
  }
  const supabase = createClient()

  // ?mode=signup (landing page buttons) or ?mode=reset (back from a reset email)
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('mode')
    if (m === 'signup') setMode('signup')
    if (m === 'reset') setMode('newpw')
  }, [])

  function switchMode(m: Mode) {
    setMode(m); setError(''); setPassword(''); setConfirmPw(''); setStep('login')
  }

  async function signUpPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!agreed || !email || !password) return
    const weak = checkPassword(password, email)
    if (weak) { setError(weak); return }
    if (password !== confirmPw) { setError("The two passwords don't match."); return }
    setLoading('password')
    setError('')
    if (!(await emailIsUsable())) { setLoading(null); return }
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl('/onboarding') },
    })
    setLoading(null)
    if (err) { setError(err.message); return }
    // Supabase hides whether an address is registered: an existing one comes
    // back as a user with no identities.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setError('There is already an account with this email. Sign in instead, or use "Forgot password?".')
      return
    }
    if (data.session) { window.location.href = '/onboarding'; return } // email confirmation turned off
    setSent('confirm')
    setStep('sent')
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading('magic')
    setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl('/login?mode=reset') })
    setLoading(null)
    if (err) { setError(err.message); return }
    setSent('reset')
    setStep('sent')
  }

  async function saveNewPassword(e: React.FormEvent) {
    e.preventDefault()
    const { data: { user: current } } = await supabase.auth.getUser()
    const weakNew = checkPassword(password, current?.email ?? '')
    if (weakNew) { setError(weakNew); return }
    if (password !== confirmPw) { setError("The two passwords don't match."); return }
    setLoading('password')
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(null)
    if (err) {
      setError(err.message.includes('session') ? 'This reset link has expired. Request a new one.' : err.message)
      return
    }
    window.location.href = '/app/dashboard'
  }

  // Where they were heading before being asked to sign in (set by proxy.ts).
  const nextPath = () => safeNext(new URLSearchParams(window.location.search).get('next'))
  // OAuth and magic links finish on the server so the session cookie exists
  // before the first protected page loads.
  const callbackUrl = (next = nextPath()) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

  // Already signed in (e.g. back from Google) but 2FA not done yet: go straight
  // to the code step. proxy.ts sends people here for exactly this.
  useEffect(() => {
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(async ({ data }) => {
      if (data?.nextLevel !== 'aal2' || data.currentLevel === 'aal2') return
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.[0]
      if (totp) {
        setFactorId(totp.id)
        setStep('mfa')
      }
    })
  }, [])

  async function cancelMfa() {
    // Leave no half-signed-in session behind.
    await supabase.auth.signOut()
    setStep('login'); setTotpCode(''); setError(''); setFactorId('')
  }

  async function signInGoogle() {
    if (!agreed) return
    setLoading('google')
    setError('')
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl() },
    })
  }

  async function signInPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!agreed || !email || !password) return
    setLoading('password')
    setError('')
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(null)
    if (err) { setError(err.message); return }

    // Check if MFA is required
    if (data.session === null && data.user === null) {
      // Shouldn't happen, but guard
      setError('Sign in failed. Please try again.')
      return
    }

    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assurance?.nextLevel === 'aal2' && assurance?.currentLevel === 'aal1') {
      // MFA enrolled — need TOTP
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.[0]
      if (totp) {
        setFactorId(totp.id)
        setStep('mfa')
        return
      }
    }
    // No MFA or already aal2 — redirect
    window.location.href = nextPath()
  }

  async function signInMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!agreed || !email) return
    setLoading('magic')
    setError('')
    if (!(await emailIsUsable())) { setLoading(null); return }
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    })
    setLoading(null)
    if (err) { setError(err.message); return }
    setSent('magic')
    setStep('sent')
  }

  async function verifyTotp(e: React.FormEvent) {
    e.preventDefault()
    if (!totpCode || totpCode.length !== 6) return
    setLoading('totp')
    setError('')
    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeErr) { setError(challengeErr.message); setLoading(null); return }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: totpCode,
    })
    setLoading(null)
    if (verifyErr) { setError('Invalid code. Please try again.'); return }
    window.location.href = nextPath()
  }

  const features = [
    {
      bg: 'var(--primary-light)', color: 'var(--primary)',
      icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>,
      title: 'Track spending & investments in one place',
      body: 'Connect your portfolio and bank accounts. See where every dollar goes and how your investments are performing.',
    },
    {
      bg: 'rgba(16,185,129,.12)', color: 'var(--green)',
      icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58"/></svg>,
      title: 'AI-powered signals on every holding',
      body: 'Get BUY / HOLD / SELL reasoning in real time across NZ, ASX &amp; US markets.',
    },
    {
      bg: 'rgba(251,191,36,.1)', color: '#fbbf24',
      icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
      title: 'Smart budgets & earnings calendar',
      body: 'Set spending targets, get earnings reminders, and stay ahead of market events that affect your portfolio.',
    },
  ]

  return (
    // Columns and the left panel's visibility come from the classes only: inline
    // display / gridTemplateColumns would override them and squash both columns
    // side by side on a phone.
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'grid' }}
      className="grid-cols-1 md:grid-cols-[1fr_480px]">

      {/* ── Left panel (wide screens only) ── */}
      <div style={{
        flexDirection: 'column', justifyContent: 'center',
        padding: '60px 48px', borderRight: '1px solid var(--border)',
        background: 'linear-gradient(135deg,rgba(44,110,106,.07) 0%,var(--bg) 60%)',
        position: 'relative', overflow: 'hidden',
      }} className="hidden md:flex">
        <div style={{ position: 'absolute', top: -100, left: -100, width: 400, height: 400, background: 'radial-gradient(circle,rgba(44,110,106,.12) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, right: -60, width: 300, height: 300, background: 'radial-gradient(circle,rgba(16,185,129,.08) 0%,transparent 70%)', pointerEvents: 'none' }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 56 }}>
          <div style={{ background: 'var(--primary)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FoxIcon size={28} />
          </div>
          <div>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18 }}>Fennec</span>
            <span style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic', display: 'block', lineHeight: 1, marginTop: 1 }}>Spend &amp; Invest</span>
          </div>
        </div>

        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(1.6rem,3vw,2.4rem)', fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>
          Your spending &amp;<br /><span style={{ color: 'var(--primary)' }}>investment tracker</span>
        </h2>
        <p style={{ color: 'var(--text2)', fontSize: 16, lineHeight: 1.7, marginBottom: 48, maxWidth: 440 }}>
          One app for your portfolio, your budget, and the AI signals that tie them together.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>
          {features.map(({ bg, color, icon, title, body }) => (
            <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                {icon}
              </div>
              <div>
                <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{title}</p>
                <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: body }} />
              </div>
            </div>
          ))}
        </div>

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

          {/* Mobile logo */}
          <div className="flex md:hidden items-center gap-2 justify-center mb-8">
            <div style={{ background: 'var(--primary)', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FoxIcon size={24} />
            </div>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16 }}>Fennec</span>
          </div>

          {/* ── Step: MFA ── */}
          {step === 'mfa' && (
            <div>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <IconShieldCheck size={26} style={{ color: 'var(--primary)' }} />
              </div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 22, marginBottom: 6, textAlign: 'center' }}>Two-factor authentication</h2>
              <p style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', marginBottom: 28 }}>
                Enter the 6-digit code from your authenticator app
              </p>
              <form onSubmit={verifyTotp}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000 000"
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  style={{ width: '100%', padding: '14px', borderRadius: 10, background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 22, outline: 'none', marginBottom: 12, display: 'block', textAlign: 'center', letterSpacing: '0.3em' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
                {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10, textAlign: 'center' }}>{error}</p>}
                <button type="submit" disabled={totpCode.length !== 6 || loading === 'totp'}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, cursor: totpCode.length === 6 ? 'pointer' : 'not-allowed', opacity: totpCode.length !== 6 || loading === 'totp' ? 0.5 : 1 }}
                >
                  {loading === 'totp' ? <IconLoader size={16} className="animate-spin" /> : <IconShieldCheck size={16} />}
                  Verify
                </button>
              </form>
              <button onClick={cancelMfa} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontSize: 13, cursor: 'pointer', margin: '16px auto 0' }}>
                <IconArrowLeft size={13} /> Sign out and use a different account
              </button>
            </div>
          )}

          {/* ── Step: Magic link sent ── */}
          {step === 'sent' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <IconMail size={26} style={{ color: 'var(--primary)' }} />
              </div>
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Check your email</p>
              <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>
                {sent === 'confirm' && <>We sent a link to <strong>{email}</strong>. Click it to confirm your account and you&apos;ll go straight to setting up Fennec.</>}
                {sent === 'magic' && <>We sent a sign-in link to <strong>{email}</strong>. If you&apos;re new, this creates your account too.</>}
                {sent === 'reset' && <>If there&apos;s an account for <strong>{email}</strong>, we&apos;ve sent a link to set a new password.</>}
              </p>
              <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
                Open the link on this device, in this browser. It can take a minute to arrive; check your spam folder too.
              </p>
              <button onClick={() => { setStep('login'); setError('') }} style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--primary)', fontFamily: 'Syne, sans-serif', fontSize: 13, cursor: 'pointer' }}>
                ← Use a different email
              </button>
            </div>
          )}

          {/* ── Step: Login ── */}
          {step === 'login' && (
            <>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 24, marginBottom: 6, textAlign: 'center' }}>
                {mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : mode === 'newpw' ? 'Choose a new password' : 'Welcome back'}
              </h2>
              <p style={{ color: 'var(--text2)', fontSize: 14, textAlign: 'center', marginBottom: 28 }}>
                {mode === 'signup' ? 'Free to start. No card needed.' : mode === 'forgot' ? "Enter your email and we'll send you a link." : mode === 'newpw' ? `At least ${PASSWORD_MIN} characters.` : 'Sign in to your Fennec account'}
              </p>

              {mode === 'forgot' && (
                <form onSubmit={sendReset}>
                  <label style={fieldLabel}>Email</label>
                  <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus style={fieldInput} />
                  {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</p>}
                  <button type="submit" disabled={!!loading || !email} style={{ ...primaryBtn, opacity: loading || !email ? 0.5 : 1 }}>
                    {loading ? <IconLoader size={16} className="animate-spin" /> : <IconMail size={16} />} Send reset link
                  </button>
                </form>
              )}

              {mode === 'newpw' && (
                <form onSubmit={saveNewPassword}>
                  <label style={fieldLabel}>New password</label>
                  <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus style={fieldInput} />
                  <label style={fieldLabel}>Type it again</label>
                  <input type="password" autoComplete="new-password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required style={fieldInput} />
                  {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</p>}
                  <button type="submit" disabled={!!loading || !password || !confirmPw} style={{ ...primaryBtn, opacity: loading || !password || !confirmPw ? 0.5 : 1 }}>
                    {loading ? <IconLoader size={16} className="animate-spin" /> : <IconLock size={16} />} Save password
                  </button>
                </form>
              )}

              {(mode === 'signin' || mode === 'signup') && (<>

              {/* Terms */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20, cursor: 'pointer' }}>
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                  style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--primary)', flexShrink: 0, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                  I agree to the{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>Privacy Policy</a>
                </span>
              </label>

              {/* Google */}
              <button onClick={signInGoogle} disabled={!!loading || !agreed}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, cursor: agreed ? 'pointer' : 'not-allowed', marginBottom: 16, opacity: loading === 'google' || !agreed ? 0.5 : 1, transition: 'opacity 0.15s' }}
              >
                {loading === 'google' ? <IconLoader size={18} className="animate-spin" /> : (
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                {mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}
              </button>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ color: 'var(--text2)', fontSize: 12, fontFamily: 'Syne, sans-serif' }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              {/* Create account with email + password */}
              {mode === 'signup' && (
                <form onSubmit={signUpPassword}>
                  <label style={fieldLabel}>Email</label>
                  <input type="email" autoComplete="email" placeholder="your@email.com" value={email} onChange={e => changeEmail(e.target.value)} onBlur={reviewEmail} required style={fieldInput} />
                  {suggestion && (
                    <div style={{ background: 'var(--primary-light)', borderRadius: 8, padding: '9px 11px', marginBottom: 10, fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5 }}>
                      Did you mean <strong>{suggestion}</strong>?
                      <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
                        <button type="button" onClick={() => { setEmail(suggestion); setSuggestion(null); setError('') }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Yes, fix it</button>
                        <button type="button" onClick={() => { setKeptEmail(email); setSuggestion(null) }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text2)', fontSize: 12.5, cursor: 'pointer' }}>No, mine is correct</button>
                      </div>
                    </div>
                  )}
                  <label style={fieldLabel}>Password</label>
                  <input type="password" autoComplete="new-password" placeholder={`At least ${PASSWORD_MIN} characters`} value={password} onChange={e => setPassword(e.target.value)} required style={fieldInput} />
                  <label style={fieldLabel}>Type it again</label>
                  <input type="password" autoComplete="new-password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required style={fieldInput} />
                  {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</p>}
                  {!agreed && <p style={{ color: 'var(--text3)', fontSize: 11.5, marginBottom: 10 }}>Tick the box above to agree to the terms first.</p>}
                  <button type="submit" disabled={!!loading || !email || !password || !confirmPw || !agreed}
                    style={{ ...primaryBtn, opacity: loading || !email || !password || !confirmPw || !agreed ? 0.5 : 1 }}>
                    {loading === 'password' ? <IconLoader size={16} className="animate-spin" /> : <IconLock size={16} />} Create account
                  </button>
                </form>
              )}

              {/* Method toggle */}
              {mode === 'signin' && (<>
              <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 3, marginBottom: 16, gap: 2 }}>
                {(['password', 'magic'] as Method[]).map(m => (
                  <button key={m} onClick={() => { setMethod(m); setError('') }}
                    style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s', background: method === m ? 'var(--surface)' : 'transparent', color: method === m ? 'var(--text)' : 'var(--text2)', boxShadow: method === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                  >
                    {m === 'password' ? '🔒 Password' : '✉️ Magic link'}
                  </button>
                ))}
              </div>

              {/* Password form */}
              {method === 'password' && (
                <form onSubmit={signInPassword}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</label>
                  <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 13, outline: 'none', marginBottom: 10, display: 'block' }}
                    onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                  />
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Password</label>
                  <div style={{ position: 'relative', marginBottom: 10 }}>
                    <input type={showPw ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required
                      style={{ width: '100%', padding: '11px 40px 11px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 13, outline: 'none', display: 'block' }}
                      onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                      onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                    />
                    <button type="button" onClick={() => setShowPw(p => !p)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', padding: 0, lineHeight: 0 }}
                    >
                      {showPw ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                  {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</p>}
                  <button type="submit" disabled={!!loading || !email || !password || !agreed}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, cursor: email && password && agreed ? 'pointer' : 'not-allowed', opacity: loading === 'password' || !email || !password || !agreed ? 0.5 : 1, transition: 'opacity 0.15s' }}
                  >
                    {loading === 'password' ? <IconLoader size={16} className="animate-spin" /> : <IconLock size={16} />}
                    Sign in
                  </button>
                  <div style={{ textAlign: 'center', marginTop: 10 }}>
                    <button type="button" onClick={() => switchMode('forgot')} style={{ fontSize: 12, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>Forgot password?</button>
                  </div>
                </form>
              )}

              {/* Magic link form */}
              {method === 'magic' && (
                <form onSubmit={signInMagicLink}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</label>
                  <input type="email" placeholder="your@email.com" value={email} onChange={e => changeEmail(e.target.value)} required
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 13, outline: 'none', marginBottom: 10, display: 'block' }}
                    onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={e => { e.target.style.borderColor = 'var(--border)'; reviewEmail() }}
                  />
                  {suggestion && (
                    <div style={{ background: 'var(--primary-light)', borderRadius: 8, padding: '9px 11px', marginBottom: 10, fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5 }}>
                      Did you mean <strong>{suggestion}</strong>?
                      <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
                        <button type="button" onClick={() => { setEmail(suggestion); setSuggestion(null); setError('') }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Yes, fix it</button>
                        <button type="button" onClick={() => { setKeptEmail(email); setSuggestion(null) }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text2)', fontSize: 12.5, cursor: 'pointer' }}>No, mine is correct</button>
                      </div>
                    </div>
                  )}
                  {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</p>}
                  <button type="submit" disabled={!!loading || !email || !agreed}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, cursor: email && agreed ? 'pointer' : 'not-allowed', opacity: loading === 'magic' || !email || !agreed ? 0.5 : 1, transition: 'opacity 0.15s' }}
                  >
                    {loading === 'magic' ? <IconLoader size={16} className="animate-spin" /> : <IconMail size={16} />}
                    Send magic link
                  </button>
                </form>
              )}
              </>)}
              </>)}
            </>
          )}

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 24, paddingTop: 20, textAlign: 'center' }}>
            <p style={{ color: 'var(--text2)', fontSize: 13 }}>
              {mode === 'signin' ? 'New to Fennec?' : 'Already have an account?'}{' '}
              <button type="button" onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                style={{ color: 'var(--primary)', fontFamily: 'Syne, sans-serif', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4, fontSize: 13 }}>
                {mode === 'signin' ? 'Create an account →' : 'Sign in →'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const fieldLabel: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }
const fieldInput: React.CSSProperties = { width: '100%', padding: '11px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 13, outline: 'none', marginBottom: 10, display: 'block' }
const primaryBtn: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'opacity 0.15s' }
