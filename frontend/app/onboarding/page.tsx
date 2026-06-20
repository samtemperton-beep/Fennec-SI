'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconChartBar, IconArrowRight } from '@tabler/icons-react'

const STEPS = ['Profile', 'Risk Level', 'Import Portfolio', 'AI Key', 'Done']

const AVATAR_COLORS = [
  '#5b6aff', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
]

const INVESTOR_TYPES = [
  'Retail Investor', 'Active Trader', 'Day Trader', 'Swing Trader',
  'Long-Term / Buy & Hold', 'Dividend Investor', 'Growth Investor',
  'Value Investor', 'Index / ETF Investor', 'Crypto Investor',
  'Financial Advisor', 'Fund Manager', 'Student / Learning', 'Other',
]

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [username, setUsername] = useState('')
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0])
  const [location, setLocation] = useState('')
  const [profession, setProfession] = useState('')
  const [riskLevel, setRiskLevel] = useState(7)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  async function finish() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').upsert({
        id: user.id,
        username,
        avatar_color: avatarColor,
        location: location || null,
        profession: profession || null,
        risk_level: riskLevel,
      })
      if (anthropicKey) {
        await supabase.auth.updateUser({ data: { anthropic_key: anthropicKey } })
      }
    }
    router.push('/app/portfolio')
  }

  const RISK_LABELS: Record<number, string> = { 1: 'Very Conservative', 3: 'Conservative', 5: 'Moderate', 7: 'Aggressive', 9: 'Very Aggressive', 10: 'Maximum Risk' }
  const riskLabel = RISK_LABELS[riskLevel] || RISK_LABELS[Math.floor(riskLevel / 2) * 2 + 1] || 'Moderate'

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div style={{ background: 'var(--accent)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconChartBar size={20} color="white" />
          </div>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 20 }}>Fennec SI</span>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i <= step ? 'var(--accent)' : 'var(--surface2)',
                color: i <= step ? 'white' : 'var(--text2)',
                fontSize: 12, fontWeight: 700, fontFamily: 'Syne, sans-serif',
              }}>
                {i < step ? '✓' : i + 1}
              </div>
              {i < STEPS.length - 1 && <div style={{ width: 24, height: 2, background: i < step ? 'var(--accent)' : 'var(--border)' }} />}
            </div>
          ))}
        </div>

        <div className="card">
          {step === 0 && (
            <div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Set up your profile</h2>
              <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 24 }}>This is how you'll appear in the community</p>

              {/* Avatar preview + color picker */}
              <div className="flex flex-col items-center mb-6">
                <div style={{
                  width: 72, height: 72, borderRadius: '50%', background: avatarColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, fontWeight: 700, color: 'white', fontFamily: 'Syne, sans-serif', marginBottom: 12,
                }}>
                  {username ? username[0].toUpperCase() : '?'}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Pick an avatar colour</p>
                <div className="flex gap-2">
                  {AVATAR_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setAvatarColor(c)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                        outline: avatarColor === c ? `3px solid white` : 'none',
                        outlineOffset: 2,
                        boxShadow: avatarColor === c ? `0 0 0 5px ${c}55` : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Username */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Username *</label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="kiwi_trader"
                  style={{ width: '100%', padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 16, outline: 'none' }}
                />
              </div>

              {/* Location */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Location <span style={{ opacity: 0.5 }}>(optional)</span></label>
                <input
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="Auckland, NZ"
                  style={{ width: '100%', padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 14, outline: 'none' }}
                />
              </div>

              {/* Profession */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Investor Type <span style={{ opacity: 0.5 }}>(optional)</span></label>
                <select
                  value={profession}
                  onChange={e => setProfession(e.target.value)}
                  style={{ width: '100%', padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: profession ? 'var(--text)' : 'var(--text2)', fontFamily: 'DM Mono, monospace', fontSize: 14, outline: 'none' }}
                >
                  <option value="">Select your investor type...</option>
                  {INVESTOR_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <button onClick={() => setStep(1)} disabled={!username || username.length < 3}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-lg"
                style={{ background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, opacity: !username || username.length < 3 ? 0.5 : 1 }}
              >
                Continue <IconArrowRight size={18} />
              </button>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Set your risk level</h2>
              <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 24 }}>This affects AI recommendations and opportunity picks</p>
              <div className="flex items-center gap-3 mb-4">
                <span style={{ fontSize: 12, color: 'var(--green)', fontFamily: 'Syne, sans-serif' }}>Conservative</span>
                <input type="range" min={1} max={10} value={riskLevel} onChange={e => setRiskLevel(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: 12, color: 'var(--red)', fontFamily: 'Syne, sans-serif' }}>Aggressive</span>
              </div>
              <p className="text-center mb-6" style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 20, color: 'var(--accent)' }}>
                {riskLevel}/10 — {riskLabel}
              </p>
              <button onClick={() => setStep(2)} className="flex items-center justify-center gap-2 w-full py-3 rounded-lg"
                style={{ background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}
              >
                Continue <IconArrowRight size={18} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Import your portfolio</h2>
              <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 24 }}>You can do this now or later from the Portfolio page</p>
              <div className="space-y-3 mb-6">
                {['Hatch CSV', 'Sharesies CSV', 'IBKR Activity Statement', 'Screenshot (AI-powered)'].map(m => (
                  <a key={m} href="/app/portfolio" style={{ display: 'block', padding: '12px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 500, color: 'var(--text2)' }}>
                    📄 {m}
                  </a>
                ))}
              </div>
              <button onClick={() => setStep(3)} className="w-full py-3 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
                Skip for now
              </button>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Add your AI key</h2>
              <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 20 }}>
                Get one free at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>console.anthropic.com</a>
              </p>
              <input
                type="password"
                value={anthropicKey}
                onChange={e => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-..."
                style={{ width: '100%', padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none', marginBottom: 16 }}
              />
              <button onClick={() => setStep(4)} className="flex items-center justify-center gap-2 w-full py-3 rounded-lg mb-3"
                style={{ background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}
              >
                Save & Continue <IconArrowRight size={18} />
              </button>
              <button onClick={() => setStep(4)} className="w-full py-3 rounded-lg" style={{ background: 'transparent', color: 'var(--text2)', fontFamily: 'Syne, sans-serif' }}>
                Skip for now (use default key)
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="text-center">
              <div style={{
                width: 80, height: 80, borderRadius: '50%', background: avatarColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32, fontWeight: 700, color: 'white', fontFamily: 'Syne, sans-serif',
                margin: '0 auto 16px',
              }}>
                {username[0]?.toUpperCase()}
              </div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 8 }}>You're all set, {username}!</h2>
              <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 24 }}>Start tracking your portfolio and getting AI insights</p>
              <button onClick={finish} disabled={loading} className="flex items-center justify-center gap-2 w-full py-3 rounded-lg"
                style={{ background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16 }}
              >
                {loading ? <LoadingSpinner size={18} /> : null} Launch Fennec SI →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
