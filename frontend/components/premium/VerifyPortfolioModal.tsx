'use client'
import { useState } from 'react'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { api } from '@/lib/api'
import {
  IconUpload, IconCheck, IconX, IconShieldCheck,
  IconCamera, IconFileSpreadsheet, IconChevronDown, IconChevronUp,
  IconCircleCheck, IconCircleDashed,
} from '@tabler/icons-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  onVerified: (tickers: string[]) => void
}

type Step = 1 | 2
type PortfolioMethod = 'csv' | 'screenshot'

// Step 1 guide: how to screenshot your broker account settings page
const ACCOUNT_GUIDES: Record<string, { label: string; steps: string[] }> = {
  hatch: {
    label: 'Hatch',
    steps: [
      'Go to app.hatchinvest.nz and sign in',
      'Click your name/avatar in the top-right corner',
      'Select "Settings" — you\'ll see your name and email address on the page',
      'Take a screenshot of that page showing your email',
      'Upload it below',
    ],
  },
  sharesies: {
    label: 'Sharesies',
    steps: [
      'Log in to Sharesies',
      'Go to Account → Personal details',
      'Take a screenshot showing your name and email address',
      'Upload it below',
    ],
  },
  ibkr: {
    label: 'IBKR',
    steps: [
      'Log in to Interactive Brokers',
      'Go to Settings → User Settings',
      'Take a screenshot showing your account email',
      'Upload it below',
    ],
  },
  other: {
    label: 'your broker',
    steps: [
      'Log in to your broker account',
      'Navigate to Settings, Profile, or Account details',
      'Take a screenshot that clearly shows your email address',
      'Upload it below',
    ],
  },
}

// Step 2 guide: how to export your portfolio
const PORTFOLIO_GUIDES: Record<string, { csv: string[]; screenshot: string[] }> = {
  hatch: {
    csv: [
      'Go to app.hatchinvest.nz and sign in',
      'Click your name/avatar → Statements',
      'Find "Portfolio export" and click Download CSV',
      'Upload that file below',
    ],
    screenshot: [
      'Open Hatch and tap Portfolio',
      'Scroll to show all holdings',
      'Take a screenshot (or multiple if you have many stocks)',
      'Upload below — Claude AI will read the holdings',
    ],
  },
  sharesies: {
    csv: [
      'Log in to Sharesies',
      'Go to Account → Reports → Portfolio',
      'Download as CSV and upload below',
    ],
    screenshot: [
      'Open Sharesies and go to Portfolio',
      'Take a screenshot of your full holdings list',
      'Upload below',
    ],
  },
  ibkr: {
    csv: [
      'Log in to IBKR',
      'Go to Reports → Statements → Positions',
      'Download as CSV and upload below',
    ],
    screenshot: [
      'Go to Portfolio → Positions',
      'Take a screenshot and upload below',
    ],
  },
  other: {
    csv: [
      'Find the Portfolio or Holdings section in your broker',
      'Look for Export or Download (usually CSV)',
      'Upload the file below',
    ],
    screenshot: [
      'Navigate to your Portfolio or Holdings page',
      'Take a clear screenshot showing your stocks',
      'Upload below',
    ],
  },
}

const BROKERS = [
  { id: 'hatch', label: 'Hatch' },
  { id: 'sharesies', label: 'Sharesies' },
  { id: 'ibkr', label: 'IBKR' },
  { id: 'other', label: 'Other' },
]

export function VerifyPortfolioModal({ open, onClose, onVerified }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [broker, setBroker] = useState('hatch')
  const [guideOpen, setGuideOpen] = useState(true)

  // Step 1 state
  const [accountFile, setAccountFile] = useState<File | null>(null)
  const [step1Verifying, setStep1Verifying] = useState(false)
  const [step1Result, setStep1Result] = useState<{ matched: boolean; foundEmail?: string; broker?: string; reason: string } | null>(null)

  // Step 2 state
  const [portfolioMethod, setPortfolioMethod] = useState<PortfolioMethod>('csv')
  const [portfolioFile, setPortfolioFile] = useState<File | null>(null)
  const [step2Verifying, setStep2Verifying] = useState(false)
  const [step2Result, setStep2Result] = useState<{ verified_tickers: string[]; claude_notes: string; status: string } | null>(null)

  function reset() {
    setStep(1)
    setAccountFile(null)
    setStep1Result(null)
    setPortfolioFile(null)
    setStep2Result(null)
    setGuideOpen(true)
  }

  // ── Step 1: verify broker account screenshot ──────────────────────────────
  async function verifyAccount() {
    if (!accountFile) return
    setStep1Verifying(true)
    try {
      const base64 = await fileToBase64(accountFile)
      const result = await api.verifyBrokerAccount(base64, accountFile.type || 'image/jpeg')
      setStep1Result(result)
      if (result.matched) {
        setGuideOpen(true) // re-open guide for step 2
        setStep(2)
      }
    } catch (e: any) {
      toast.error('Could not read screenshot: ' + e.message)
    }
    setStep1Verifying(false)
  }

  // ── Step 2: verify portfolio holdings ────────────────────────────────────
  async function verifyPortfolio() {
    if (!portfolioFile) return
    setStep2Verifying(true)
    try {
      let res: any
      if (portfolioMethod === 'csv') {
        const text = await portfolioFile.text()
        res = await api.verifyPortfolioCSV(text)
      } else {
        const base64 = await fileToBase64(portfolioFile)
        res = await api.verifyPortfolio(base64, portfolioFile.type || 'image/jpeg')
      }
      setStep2Result(res.verification)
      if (res.verification?.status === 'verified') {
        onVerified(res.verification.verified_tickers)
        if (res.newBadges?.length > 0) toast.success(`New badge${res.newBadges.length > 1 ? 's' : ''} unlocked!`)
      }
    } catch (e: any) {
      toast.error('Verification failed: ' + e.message)
    }
    setStep2Verifying(false)
  }

  const acctGuide = ACCOUNT_GUIDES[broker] || ACCOUNT_GUIDES.other
  const portGuide = PORTFOLIO_GUIDES[broker] || PORTFOLIO_GUIDES.other
  const portSteps = portfolioMethod === 'csv' ? portGuide.csv : portGuide.screenshot

  const allDone = step2Result?.status === 'verified'

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Verify Portfolio" wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Progress stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {[
            { n: 1, label: 'Confirm account' },
            { n: 2, label: 'Confirm holdings' },
          ].map((s, i) => {
            const done = (s.n === 1 && step1Result?.matched) || (s.n === 2 && step2Result?.status === 'verified')
            const active = step === s.n
            return (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--green)' : active ? 'var(--primary)' : 'var(--surface2)', border: `2px solid ${done ? 'var(--green)' : active ? 'var(--primary)' : 'var(--border)'}`, transition: 'all 0.2s' }}>
                    {done
                      ? <IconCheck size={16} color="white" />
                      : <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 800, fontSize: 13, color: active ? 'white' : 'var(--text2)' }}>{s.n}</span>
                    }
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 600, color: active || done ? 'var(--text)' : 'var(--text2)' }}>{s.label}</span>
                </div>
                {i < 1 && (
                  <div style={{ height: 2, flex: 1, background: step1Result?.matched ? 'var(--green)' : 'var(--border)', marginBottom: 16, transition: 'background 0.3s' }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Broker selector (shown on both steps) */}
        {!allDone && (
          <div>
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Your broker</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {BROKERS.map(b => (
                <button key={b.id} onClick={() => setBroker(b.id)}
                  style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', border: broker === b.id ? 'none' : '1px solid var(--border)', background: broker === b.id ? 'var(--primary)' : 'var(--surface2)', color: broker === b.id ? 'white' : 'var(--text2)', transition: 'all 0.15s' }}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 1 ────────────────────────────────────────────────────── */}
        {step === 1 && !allDone && (
          <>
            <div style={{ background: 'rgba(44,110,106,0.08)', borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Step 1 — Prove it's your account</p>
              <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                Take a screenshot of your broker's profile or settings page so we can see the email address linked to your account. Claude AI will read it and check it matches your Fennec email.
              </p>
            </div>

            <Accordion
              title={`How to get your ${acctGuide.label} account screenshot`}
              open={guideOpen}
              onToggle={() => setGuideOpen(o => !o)}
            >
              {acctGuide.steps.map((s, i) => <Step key={i} n={i + 1} text={s} />)}
            </Accordion>

            {!step1Result ? (
              <FileDropZone
                file={accountFile}
                accept="image/*,.pdf"
                hint="Screenshot of your broker account/settings page"
                onChange={e => { setAccountFile(e.target.files?.[0] || null); setStep1Result(null) }}
                onDrop={e => { e.preventDefault(); setAccountFile(e.dataTransfer.files[0] || null) }}
              />
            ) : (
              <ResultBanner
                ok={step1Result.matched}
                title={step1Result.matched ? `Email verified — ${step1Result.foundEmail}` : 'Email mismatch'}
                body={step1Result.reason}
              />
            )}

            {!step1Result?.matched && (
              <button onClick={verifyAccount} disabled={!accountFile || step1Verifying}
                style={btnStyle(!accountFile || step1Verifying)}>
                {step1Verifying ? <><LoadingSpinner size={14} /> Reading screenshot…</> : <><IconShieldCheck size={15} /> Verify account email</>}
              </button>
            )}

            {step1Result && !step1Result.matched && (
              <button onClick={() => { setAccountFile(null); setStep1Result(null) }} style={ghostBtnStyle}>
                Try a different screenshot
              </button>
            )}
          </>
        )}

        {/* ── STEP 2 ────────────────────────────────────────────────────── */}
        {step === 2 && !allDone && (
          <>
            {/* Step 1 success summary */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10 }}>
              <IconCircleCheck size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>
                Account email confirmed — <strong style={{ color: 'var(--text)' }}>{step1Result?.foundEmail}</strong>
                {step1Result?.broker ? ` (${step1Result.broker})` : ''}
              </p>
            </div>

            <div style={{ background: 'rgba(44,110,106,0.08)', borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Step 2 — Confirm your holdings</p>
              <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                Now upload a CSV export or screenshot of your portfolio. We'll match the stocks against your Fennec holdings to confirm they're real.
              </p>
            </div>

            {/* CSV vs Screenshot toggle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {([
                { id: 'csv' as PortfolioMethod, icon: IconFileSpreadsheet, label: 'CSV Export', sub: 'Best — covers all holdings in one file' },
                { id: 'screenshot' as PortfolioMethod, icon: IconCamera, label: 'Screenshot', sub: 'Take a photo of your portfolio page' },
              ]).map(m => {
                const Icon = m.icon
                const active = portfolioMethod === m.id
                return (
                  <button key={m.id} onClick={() => { setPortfolioMethod(m.id); setPortfolioFile(null); setStep2Result(null) }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '12px 8px', borderRadius: 10, border: active ? '2px solid var(--primary)' : '1px solid var(--border)', background: active ? 'var(--primary-light)' : 'var(--surface2)', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <Icon size={20} style={{ color: active ? 'var(--primary)' : 'var(--text2)' }} />
                    <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 12, color: active ? 'var(--primary)' : 'var(--text)' }}>{m.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.3 }}>{m.sub}</span>
                  </button>
                )
              })}
            </div>

            <Accordion
              title={`How to ${portfolioMethod === 'csv' ? 'export CSV from' : 'screenshot your portfolio in'} ${acctGuide.label}`}
              open={guideOpen}
              onToggle={() => setGuideOpen(o => !o)}
            >
              {portSteps.map((s, i) => <Step key={i} n={i + 1} text={s} />)}
            </Accordion>

            {!step2Result ? (
              <FileDropZone
                file={portfolioFile}
                accept={portfolioMethod === 'csv' ? '.csv,text/csv' : 'image/*,.pdf'}
                hint={portfolioMethod === 'csv' ? 'Upload your portfolio CSV export' : 'Upload your portfolio screenshot'}
                onChange={e => { setPortfolioFile(e.target.files?.[0] || null); setStep2Result(null) }}
                onDrop={e => { e.preventDefault(); setPortfolioFile(e.dataTransfer.files[0] || null) }}
              />
            ) : (
              <ResultBanner
                ok={step2Result.status === 'verified'}
                title={step2Result.status === 'verified'
                  ? `Holdings verified — ${step2Result.verified_tickers?.length} stocks matched`
                  : 'Could not match holdings'}
                body={step2Result.claude_notes}
              />
            )}

            {!step2Result && (
              <button onClick={verifyPortfolio} disabled={!portfolioFile || step2Verifying}
                style={btnStyle(!portfolioFile || step2Verifying)}>
                {step2Verifying
                  ? <><LoadingSpinner size={14} /> {portfolioMethod === 'screenshot' ? 'Reading with Claude AI…' : 'Matching holdings…'}</>
                  : <><IconShieldCheck size={15} /> Confirm my holdings</>
                }
              </button>
            )}

            {step2Result && step2Result.status !== 'verified' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setPortfolioFile(null); setStep2Result(null) }} style={{ ...ghostBtnStyle, flex: 1 }}>
                  Try again
                </button>
                <button onClick={() => setPortfolioMethod(m => m === 'csv' ? 'screenshot' : 'csv')} style={{ ...ghostBtnStyle, flex: 1 }}>
                  Switch to {portfolioMethod === 'csv' ? 'screenshot' : 'CSV'}
                </button>
              </div>
            )}
          </>
        )}

        {/* ── ALL DONE ──────────────────────────────────────────────────── */}
        {allDone && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🛡️</div>
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20, marginBottom: 6 }}>Portfolio Verified</p>
              <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                Your account email and holdings have both been confirmed. Your verified badge is now active.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10 }}>
                <IconCircleCheck size={16} style={{ color: 'var(--green)' }} />
                <span style={{ fontSize: 13 }}>Account email — <strong>{step1Result?.foundEmail}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10 }}>
                <IconCircleCheck size={16} style={{ color: 'var(--green)' }} />
                <span style={{ fontSize: 13 }}>Holdings — <strong>{step2Result?.verified_tickers?.join(', ')}</strong></span>
              </div>
            </div>
            <button onClick={() => { reset(); onClose() }}
              style={{ padding: '12px', borderRadius: 8, background: 'var(--primary)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: 14 }}>
              Done
            </button>
          </div>
        )}

        {/* Privacy note */}
        {!allDone && (
          <p style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.5 }}>
            🔒 We never access your broker account. Screenshots are read by Claude AI and not stored.
          </p>
        )}
      </div>
    </Modal>
  )
}

// ── Small shared components ───────────────────────────────────────────────────

function Accordion({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', border: 'none', cursor: 'pointer', color: 'var(--text)' }}>
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, textAlign: 'left' }}>{title}</span>
        {open ? <IconChevronUp size={14} style={{ color: 'var(--text2)', flexShrink: 0 }} /> : <IconChevronDown size={14} style={{ color: 'var(--text2)', flexShrink: 0 }} />}
      </button>
      {open && <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>}
    </div>
  )
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--primary)', color: 'white', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>{n}</div>
      <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text)', paddingTop: 1 }}>{text}</p>
    </div>
  )
}

function FileDropZone({ file, accept, hint, onChange, onDrop }: {
  file: File | null; accept: string; hint: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDrop: (e: React.DragEvent) => void
}) {
  return (
    <label
      onDragOver={e => e.preventDefault()} onDrop={onDrop}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '24px 16px', borderRadius: 10, cursor: 'pointer', border: `2px dashed ${file ? 'var(--primary)' : 'var(--border)'}`, background: file ? 'rgba(44,110,106,0.06)' : 'var(--surface2)', transition: 'all 0.15s' }}>
      <IconUpload size={22} style={{ color: file ? 'var(--primary)' : 'var(--text2)' }} />
      {file
        ? <span style={{ color: 'var(--text)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>{file.name}</span>
        : <>
            <span style={{ color: 'var(--text)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>{hint}</span>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>Drag & drop or click to browse · Max 10MB</span>
          </>
      }
      <input type="file" accept={accept} style={{ display: 'none' }} onChange={onChange} />
    </label>
  )
}

function ResultBanner({ ok, title, body }: { ok: boolean; title: string; body: string }) {
  return (
    <div style={{ background: ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)', border: `1px solid ${ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {ok ? <IconCheck size={16} style={{ color: 'var(--green)' }} /> : <IconX size={16} style={{ color: 'var(--red)' }} />}
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, color: ok ? 'var(--green)' : 'var(--red)' }}>{title}</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{body}</p>
    </div>
  )
}

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  width: '100%', padding: '12px', borderRadius: 8, border: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer',
  background: 'var(--primary)', color: 'white',
  fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14,
  opacity: disabled ? 0.45 : 1, transition: 'opacity 0.15s',
})

const ghostBtnStyle: React.CSSProperties = {
  padding: '11px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text)', cursor: 'pointer',
  fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13,
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
