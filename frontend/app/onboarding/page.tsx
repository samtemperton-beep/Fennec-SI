'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconCheck, IconArrowRight, IconPlugConnected, IconUpload, IconExternalLink, IconChartBar, IconWallet, IconNewSection, IconUsers, IconBriefcase } from '@tabler/icons-react'
import { toast } from 'sonner'

const FEATURES = [
  {
    id: 'investments',
    icon: IconChartBar,
    color: 'var(--primary)',
    bg: 'var(--primary-light)',
    label: 'Investments',
    description: 'Track your NZ, ASX & US portfolio with live prices and AI signals',
    recommended: true,
  },
  {
    id: 'finance',
    icon: IconWallet,
    color: '#10b981',
    bg: 'rgba(16,185,129,0.12)',
    label: 'Household Finance',
    description: 'Budget tracking, bills, spending insights and savings goals',
    recommended: true,
  },
  {
    id: 'news',
    icon: IconNewSection,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    label: 'Market News & Events',
    description: 'AI-curated news, earnings calendar and newsletter digests',
    recommended: true,
  },
  {
    id: 'community',
    icon: IconUsers,
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,0.12)',
    label: 'Community & Leaderboard',
    description: 'Share ideas, follow other investors, compete on verified leaderboards',
    recommended: false,
  },
  {
    id: 'business',
    icon: IconBriefcase,
    color: '#6366f1',
    bg: 'rgba(99,102,241,0.12)',
    label: 'Business & Tax',
    description: 'Invoicing, business transactions and tax summaries',
    recommended: false,
    premiumNote: 'Full features require Premium',
  },
]

const AKAHU_SUPPORTED = [
  'Hatch', 'Sharesies', 'InvestNow', 'Simplicity', 'Kernel', 'ANZ Investments',
  'ASB Securities', 'BNZ Investments', 'Westpac', 'ANZ', 'ASB', 'BNZ',
  'Kiwibank', 'TSB', 'Co-operative Bank', 'Heartland Bank',
]

type Step = 'welcome' | 'features' | 'akahu' | 'akahu-tokens' | 'fallback' | 'profile' | 'done'

function FennecMessage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 28 }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>
        🦊
      </div>
      <div style={{ flex: 1, padding: '12px 16px', background: 'var(--surface2)', borderRadius: '4px 16px 16px 16px', fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
        {children}
      </div>
    </div>
  )
}

function StepDot({ n, current, done }: { n: number; current: number; done: boolean }) {
  const active = n === current
  const complete = done || n < current
  return (
    <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 700, flexShrink: 0, transition: 'all 0.2s', background: complete ? 'var(--primary)' : active ? 'var(--primary-light)' : 'var(--surface2)', color: complete ? 'white' : active ? 'var(--primary)' : 'var(--text2)', border: active ? '2px solid var(--primary)' : 'none' }}>
      {complete ? <IconCheck size={14} /> : n}
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState<Step>('welcome')
  const [userId, setUserId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set(['investments', 'finance', 'news']))
  const [appToken, setAppToken] = useState('')
  const [userToken, setUserToken] = useState('')
  const [savingTokens, setSavingTokens] = useState(false)
  const [akahuConnected, setAkahuConnected] = useState(false)
  const [riskLevel, setRiskLevel] = useState(5)
  const [investorType, setInvestorType] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setUserId(data.user.id)
      // Pre-fill name from Google profile if available
      const googleName = data.user.user_metadata?.full_name || data.user.user_metadata?.name || ''
      if (googleName) setName(googleName.split(' ')[0])
      setLoading(false)
    })
  }, [])

  const STEP_ORDER: Step[] = ['welcome', 'features', 'akahu', 'profile', 'done']
  const stepNum = (s: Step) => {
    const map: Record<Step, number> = { welcome: 1, features: 2, akahu: 3, 'akahu-tokens': 3, fallback: 3, profile: 4, done: 5 }
    return map[s]
  }

  function toggleFeature(id: string) {
    setSelectedFeatures(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function saveAkahuTokens() {
    if (!appToken || !userToken) return
    setSavingTokens(true)
    try {
      await api.saveAkahuCredentials(appToken.trim(), userToken.trim())
      setAkahuConnected(true)
      toast.success('Akahu connected! Your accounts will sync shortly.')
      setStep('profile')
    } catch (e: any) {
      toast.error(e.message)
    }
    setSavingTokens(false)
  }

  async function finish() {
    if (!userId) return
    setSaving(true)
    try {
      await supabase.from('profiles').upsert({
        id: userId,
        username: name.trim() || null,
        risk_level: riskLevel,
        profession: investorType || null,
        enabled_features: [...selectedFeatures],
        onboarding_complete: true,
      })
      // Trigger Akahu sync if connected
      if (akahuConnected) api.syncAkahu().catch(() => {})
      router.push('/app/dashboard')
    } catch (e: any) {
      toast.error(e.message)
      setSaving(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <LoadingSpinner size={32} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32, justifyContent: 'center' }}>
          <div style={{ background: 'var(--primary)', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16 }}>Fennec SI</span>
        </div>

        {/* Step progress */}
        {step !== 'done' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 36 }}>
            {[1, 2, 3, 4].map((n, i) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
                <StepDot n={n} current={stepNum(step)} done={false} />
                {i < 3 && <div style={{ width: 40, height: 2, background: stepNum(step) > n + 1 ? 'var(--primary)' : 'var(--border)', transition: 'background 0.3s' }} />}
              </div>
            ))}
          </div>
        )}

        {/* ── Step: Welcome ── */}
        {step === 'welcome' && (
          <div className="card" style={{ padding: 28 }}>
            <FennecMessage>
              Hey! 👋 I&apos;m Fennec, your AI financial guide. I&apos;ll help you track your spending, grow your investments, and make smarter money decisions.<br /><br />
              Let&apos;s get you set up — it only takes a couple of minutes. What should I call you?
            </FennecMessage>
            <input
              type="text"
              placeholder="Your first name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && name.trim() && setStep('features')}
              autoFocus
              style={{ width: '100%', padding: '13px 16px', borderRadius: 10, background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)', fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 600, outline: 'none', marginBottom: 16, display: 'block' }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
            <button onClick={() => name.trim() && setStep('features')} disabled={!name.trim()}
              style={{ width: '100%', padding: '13px', borderRadius: 10, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, cursor: name.trim() ? 'pointer' : 'not-allowed', opacity: name.trim() ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              Let&apos;s go <IconArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step: Features ── */}
        {step === 'features' && (
          <div className="card" style={{ padding: 28 }}>
            <FennecMessage>
              Nice to meet you, <strong>{name}</strong>! What do you want to use Fennec for? Pick everything that applies — you can always change this later in Settings.
            </FennecMessage>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {FEATURES.map(f => {
                const active = selectedFeatures.has(f.id)
                return (
                  <button key={f.id} onClick={() => toggleFeature(f.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary-light)' : 'var(--surface2)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                  >
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: f.bg, color: f.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <f.icon size={18} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{f.label}</span>
                        {f.recommended && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'rgba(34,197,94,0.12)', color: 'var(--green)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>Recommended</span>}
                        {f.premiumNote && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'rgba(251,191,36,0.15)', color: '#f59e0b', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>Premium</span>}
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, margin: 0 }}>{f.description}</p>
                    </div>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                      {active && <IconCheck size={12} color="white" />}
                    </div>
                  </button>
                )
              })}
            </div>
            <button onClick={() => setStep('akahu')} disabled={selectedFeatures.size === 0}
              style={{ width: '100%', padding: '13px', borderRadius: 10, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, cursor: selectedFeatures.size > 0 ? 'pointer' : 'not-allowed', opacity: selectedFeatures.size > 0 ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              Continue <IconArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step: Akahu intro ── */}
        {step === 'akahu' && (
          <div className="card" style={{ padding: 28 }}>
            <FennecMessage>
              Now for the most important step. To give you accurate, real-time data across your <strong>bank accounts, investments, and KiwiSaver</strong> — Fennec connects to them via <strong>Akahu</strong>.<br /><br />
              Akahu is a trusted NZ Open Banking provider. It reads your balances and transactions securely — <strong>Fennec never sees your login credentials</strong>.
            </FennecMessage>

            {/* Why Akahu matters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {[
                { icon: '🏦', title: 'Live bank account balances', body: 'ANZ, ASB, BNZ, Kiwibank, Westpac and more — all in one place.' },
                { icon: '📈', title: 'Real portfolio data from your broker', body: 'Hatch, Sharesies, InvestNow, Kernel and others sync automatically. No manual entry.' },
                { icon: '🥝', title: 'KiwiSaver balance', body: 'Your retirement savings updated whenever your provider reports it.' },
                { icon: '✅', title: 'Verified portfolio for the leaderboard', body: 'Direct broker connection = instant verification. No document uploads needed.' },
              ].map(item => (
                <div key={item.title} style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--surface2)' }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{item.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, margin: 0 }}>{item.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Supported apps */}
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(44,110,106,0.06)', border: '1px solid rgba(44,110,106,0.2)', marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--primary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supported apps</p>
              <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>{AKAHU_SUPPORTED.join(' · ')}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setStep('akahu-tokens')}
                style={{ width: '100%', padding: '13px', borderRadius: 10, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <IconPlugConnected size={17} /> Connect via Akahu
              </button>
              <button onClick={() => setStep('fallback')}
                style={{ width: '100%', padding: '11px', borderRadius: 10, background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                My broker isn&apos;t supported — use CSV upload instead
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Akahu tokens ── */}
        {step === 'akahu-tokens' && (
          <div className="card" style={{ padding: 28 }}>
            <FennecMessage>
              You&apos;ll need to create a <strong>personal app</strong> on Akahu to get your tokens. It takes about 2 minutes — here&apos;s how:
            </FennecMessage>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {[
                { n: 1, text: 'Go to my.akahu.nz and sign in (or create a free account)' },
                { n: 2, text: 'Click "Apps" → "New App" → give it any name (e.g. "Fennec SI")' },
                { n: 3, text: 'In the app, go to "Connections" and link your bank and broker accounts' },
                { n: 4, text: 'Copy the App Token and User Token from the app dashboard' },
              ].map(s => (
                <div key={s.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{s.n}</div>
                  <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, margin: 0 }}>{s.text}</p>
                </div>
              ))}
            </div>

            <a href="https://my.akahu.nz" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, background: 'var(--primary-light)', border: '1px solid var(--primary)', color: 'var(--primary)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, textDecoration: 'none', marginBottom: 20 }}
            >
              <IconExternalLink size={14} /> Open my.akahu.nz
            </a>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>App Token</label>
                <input type="password" placeholder="app_token_..." value={appToken} onChange={e => setAppToken(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 13, outline: 'none', display: 'block' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>User Token</label>
                <input type="password" placeholder="user_token_..." value={userToken} onChange={e => setUserToken(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 13, outline: 'none', display: 'block' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={saveAkahuTokens} disabled={!appToken || !userToken || savingTokens}
                style={{ width: '100%', padding: '13px', borderRadius: 10, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, cursor: appToken && userToken ? 'pointer' : 'not-allowed', opacity: !appToken || !userToken || savingTokens ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {savingTokens ? <LoadingSpinner size={16} /> : <IconPlugConnected size={16} />}
                {savingTokens ? 'Connecting…' : 'Connect Akahu'}
              </button>
              <button onClick={() => setStep('profile')}
                style={{ width: '100%', padding: '11px', borderRadius: 10, background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                I&apos;ll do this later (limited features)
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Fallback (CSV upload) ── */}
        {step === 'fallback' && (
          <div className="card" style={{ padding: 28 }}>
            <FennecMessage>
              No problem — if your broker isn&apos;t on Akahu yet, you can upload a CSV export from your broker instead. This gives you portfolio tracking, but <strong>won&apos;t include live bank balances or automatic KiwiSaver syncing</strong>.<br /><br />
              You can always connect Akahu later in Settings when your broker is supported.
            </FennecMessage>

            <div style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.06)', marginBottom: 20 }}>
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, color: '#f59e0b', marginBottom: 4 }}>⚠️ CSV upload limitations</p>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                <li>Prices and quantities won&apos;t update automatically</li>
                <li>No bank account or spending data</li>
                <li>Portfolio not eligible for leaderboard verification</li>
                <li>You&apos;ll need to re-upload after changes to your portfolio</li>
              </ul>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => { setStep('profile') }}
                style={{ width: '100%', padding: '13px', borderRadius: 10, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <IconUpload size={16} /> I&apos;ll upload a CSV from my portfolio page
              </button>
              <button onClick={() => setStep('akahu-tokens')}
                style={{ width: '100%', padding: '11px', borderRadius: 10, background: 'var(--primary-light)', border: '1px solid var(--primary)', color: 'var(--primary)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                ← Actually, let me try Akahu
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Investor profile ── */}
        {step === 'profile' && (
          <div className="card" style={{ padding: 28 }}>
            <FennecMessage>
              {akahuConnected
                ? <>Akahu is connected! 🎉 Your accounts will sync in the background. Almost done — just a couple of questions to personalise your experience.</>
                : <>Almost there! Just a couple of questions to personalise your AI signals and insights.</>
              }
            </FennecMessage>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, marginBottom: 10 }}>How would you describe yourself as an investor?</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['Beginner', 'Casual investor', 'Active trader', 'Long-term / buy & hold', 'Dividend investor', 'Growth investor', 'Day trader'].map(t => (
                  <button key={t} onClick={() => setInvestorType(t)}
                    style={{ padding: '7px 14px', borderRadius: 20, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${investorType === t ? 'var(--primary)' : 'var(--border)'}`, background: investorType === t ? 'var(--primary-light)' : 'var(--surface2)', color: investorType === t ? 'var(--primary)' : 'var(--text2)', transition: 'all 0.15s' }}
                  >{t}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>Risk tolerance</label>
                <span style={{ fontSize: 12, color: 'var(--primary)', fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>
                  {riskLevel <= 3 ? 'Conservative' : riskLevel <= 5 ? 'Moderate' : riskLevel <= 7 ? 'Balanced' : riskLevel <= 9 ? 'Aggressive' : 'Maximum risk'}
                </span>
              </div>
              <input type="range" min={1} max={10} value={riskLevel} onChange={e => setRiskLevel(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'Syne, sans-serif' }}>Play it safe</span>
                <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'Syne, sans-serif' }}>High risk, high reward</span>
              </div>
            </div>

            <button onClick={() => setStep('done')}
              style={{ width: '100%', padding: '13px', borderRadius: 10, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              Continue <IconArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ── Step: Done ── */}
        {step === 'done' && (
          <div className="card" style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🦊</div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 8 }}>
              You&apos;re all set, {name}!
            </h2>
            <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              Here&apos;s what I&apos;ve set up for you:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28, textAlign: 'left' }}>
              {[...selectedFeatures].map(f => {
                const feat = FEATURES.find(x => x.id === f)
                return feat ? (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: feat.bg, color: feat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <feat.icon size={14} />
                    </div>
                    <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>{feat.label}</span>
                    <IconCheck size={14} style={{ color: 'var(--green)', marginLeft: 'auto', flexShrink: 0 }} />
                  </div>
                ) : null
              })}
              {akahuConnected && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10 }}>
                  <span style={{ fontSize: 18 }}>🔗</span>
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>Akahu connected — syncing now</span>
                  <IconCheck size={14} style={{ color: 'var(--green)', marginLeft: 'auto', flexShrink: 0 }} />
                </div>
              )}
            </div>

            <button onClick={finish} disabled={saving}
              style={{ width: '100%', padding: '14px', borderRadius: 10, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {saving ? <LoadingSpinner size={18} /> : null}
              {saving ? 'Saving…' : 'Take me to my dashboard →'}
            </button>
          </div>
        )}

        {/* Skip link for power users */}
        {!['done', 'welcome'].includes(step) && (
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text2)' }}>
            <button onClick={finish} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', textDecoration: 'underline', fontSize: 12, fontFamily: 'Syne, sans-serif' }}>
              Skip setup and go to dashboard
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
