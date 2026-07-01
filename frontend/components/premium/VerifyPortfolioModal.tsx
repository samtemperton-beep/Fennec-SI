'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { api } from '@/lib/api'
import { IconUpload, IconCheck, IconX, IconShieldCheck, IconCamera, IconMail, IconFileSpreadsheet, IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { toast } from 'sonner'

type Method = 'csv' | 'screenshot' | 'email'

interface Props {
  open: boolean
  onClose: () => void
  onVerified: (tickers: string[]) => void
}

const CSV_GUIDES: Record<string, { label: string; steps: string[] }> = {
  hatch: {
    label: 'Hatch',
    steps: [
      'Go to app.hatchinvest.nz and sign in',
      'Click your name / avatar in the top right',
      'Select "Statements" from the dropdown',
      'Under "Portfolio export", click Download CSV',
      'Upload that file below',
    ],
  },
  sharesies: {
    label: 'Sharesies',
    steps: [
      'Log in to Sharesies at sharesies.com',
      'Go to Account → Reports',
      'Select "Portfolio" report and choose CSV',
      'Download and upload below',
    ],
  },
  ibkr: {
    label: 'IBKR',
    steps: [
      'Log in to Interactive Brokers',
      'Go to Reports → Flex Queries or Statements',
      'Download your Positions report as CSV',
      'Upload below',
    ],
  },
  other: {
    label: 'Other brokers',
    steps: [
      'Find the Portfolio, Holdings, or Positions section in your broker',
      'Look for an Export or Download option (usually CSV or Excel)',
      'Download and upload below — we\'ll match your tickers automatically',
    ],
  },
}

const SCREENSHOT_GUIDES: Record<string, { label: string; steps: string[] }> = {
  hatch: {
    label: 'Hatch',
    steps: [
      'Open the Hatch app on your phone',
      'Tap Portfolio at the bottom',
      'Scroll down to see all your holdings',
      'Take a screenshot (Power + Volume Down on Android; Side + Volume Up on iPhone)',
      'If you have many holdings, upload one screenshot at a time',
    ],
  },
  sharesies: {
    label: 'Sharesies',
    steps: [
      'Open the Sharesies app or website',
      'Go to Portfolio',
      'Take a screenshot of your holdings list',
    ],
  },
  other: {
    label: 'Other brokers',
    steps: [
      'Navigate to your Portfolio or Holdings page',
      'Take a clear screenshot showing stock names and amounts',
      'Upload below — Claude AI will read it',
    ],
  },
}

export function VerifyPortfolioModal({ open, onClose, onVerified }: Props) {
  const [method, setMethod] = useState<Method>('csv')
  const [broker, setBroker] = useState('hatch')
  const [guideOpen, setGuideOpen] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [brokerEmail, setBrokerEmail] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<{ verified_tickers: string[]; claude_notes: string; status: string } | null>(null)
  const supabase = createClient()

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 10 * 1024 * 1024) { toast.error('File must be under 10MB'); return }
    setFile(f)
    setResult(null)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (!f) return
    if (f.size > 10 * 1024 * 1024) { toast.error('File must be under 10MB'); return }
    setFile(f)
    setResult(null)
  }

  async function verify() {
    setVerifying(true)
    try {
      let res: any
      if (method === 'csv') {
        if (!file) return
        const text = await file.text()
        res = await api.verifyPortfolioCSV(text)
      } else if (method === 'screenshot') {
        if (!file) return
        const base64 = await fileToBase64(file)
        res = await api.verifyPortfolio(base64, file.type || 'image/jpeg')
      } else {
        if (!brokerEmail.trim()) return
        res = await api.verifyPortfolioEmail(brokerEmail.trim())
      }
      const { verification, newBadges } = res
      setResult(verification)
      if (verification.status === 'verified') {
        onVerified(verification.verified_tickers)
        if (newBadges?.length > 0) toast.success(`New badge${newBadges.length > 1 ? 's' : ''} unlocked!`)
      }
    } catch (e: any) {
      toast.error('Verification failed: ' + e.message)
    }
    setVerifying(false)
  }

  function reset() {
    setFile(null)
    setResult(null)
    setBrokerEmail('')
  }

  const canSubmit = method === 'email' ? brokerEmail.trim().includes('@') : !!file

  const csvGuide = CSV_GUIDES[broker] || CSV_GUIDES.other
  const ssGuide = SCREENSHOT_GUIDES[broker] || SCREENSHOT_GUIDES.other
  const activeGuide = method === 'csv' ? csvGuide : ssGuide

  const BROKERS = [
    { id: 'hatch', label: 'Hatch' },
    { id: 'sharesies', label: 'Sharesies' },
    { id: 'ibkr', label: 'IBKR' },
    { id: 'other', label: 'Other' },
  ]

  const METHODS: { id: Method; icon: typeof IconFileSpreadsheet; label: string; sub: string }[] = [
    { id: 'csv', icon: IconFileSpreadsheet, label: 'CSV Export', sub: 'Best for large portfolios' },
    { id: 'screenshot', icon: IconCamera, label: 'Screenshot', sub: 'Quick for small portfolios' },
    { id: 'email', icon: IconMail, label: 'Email Match', sub: 'Fastest — no file needed' },
  ]

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Verify Portfolio">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!result ? (
          <>
            {/* Method selector */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {METHODS.map(m => {
                const Icon = m.icon
                const active = method === m.id
                return (
                  <button key={m.id} onClick={() => { setMethod(m.id); setFile(null); setResult(null) }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 10, border: active ? '2px solid var(--primary)' : '1px solid var(--border)', background: active ? 'var(--primary-light)' : 'var(--surface2)', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <Icon size={20} style={{ color: active ? 'var(--primary)' : 'var(--text2)' }} />
                    <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 12, color: active ? 'var(--primary)' : 'var(--text)' }}>{m.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.3 }}>{m.sub}</span>
                  </button>
                )
              })}
            </div>

            {/* CSV method */}
            {method === 'csv' && (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {BROKERS.map(b => (
                    <button key={b.id} onClick={() => setBroker(b.id)}
                      style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', border: broker === b.id ? 'none' : '1px solid var(--border)', background: broker === b.id ? 'var(--primary)' : 'var(--surface2)', color: broker === b.id ? 'white' : 'var(--text2)', transition: 'all 0.15s' }}>
                      {b.label}
                    </button>
                  ))}
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <button onClick={() => setGuideOpen(o => !o)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', border: 'none', cursor: 'pointer', color: 'var(--text)' }}>
                    <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>How to export from {csvGuide.label}</span>
                    {guideOpen ? <IconChevronUp size={14} style={{ color: 'var(--text2)' }} /> : <IconChevronDown size={14} style={{ color: 'var(--text2)' }} />}
                  </button>
                  {guideOpen && (
                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {csvGuide.steps.map((step, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--primary)', color: 'white', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>{i + 1}</div>
                          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text)', paddingTop: 1 }}>{step}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <FileDropZone file={file} accept=".csv,text/csv" hint="Drag & drop your CSV or click to browse" onFile={f => { setFile(f); setResult(null) }} onDrop={handleDrop} onChange={handleFile} />
              </>
            )}

            {/* Screenshot method */}
            {method === 'screenshot' && (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {BROKERS.map(b => (
                    <button key={b.id} onClick={() => setBroker(b.id)}
                      style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', border: broker === b.id ? 'none' : '1px solid var(--border)', background: broker === b.id ? 'var(--primary)' : 'var(--surface2)', color: broker === b.id ? 'white' : 'var(--text2)', transition: 'all 0.15s' }}>
                      {b.label}
                    </button>
                  ))}
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <button onClick={() => setGuideOpen(o => !o)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', border: 'none', cursor: 'pointer', color: 'var(--text)' }}>
                    <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>How to screenshot {ssGuide.label}</span>
                    {guideOpen ? <IconChevronUp size={14} style={{ color: 'var(--text2)' }} /> : <IconChevronDown size={14} style={{ color: 'var(--text2)' }} />}
                  </button>
                  {guideOpen && (
                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {ssGuide.steps.map((step, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--primary)', color: 'white', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>{i + 1}</div>
                          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text)', paddingTop: 1 }}>{step}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <FileDropZone file={file} accept="image/*,.pdf" hint="Drag & drop your screenshot or click to browse" onFile={f => { setFile(f); setResult(null) }} onDrop={handleDrop} onChange={handleFile} />
              </>
            )}

            {/* Email match method */}
            {method === 'email' && (
              <>
                <div style={{ background: 'rgba(44,110,106,0.08)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                  <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>How this works</p>
                  Enter the email address you used to sign up with your broker (e.g. Hatch, Sharesies). If it matches your Fennec account email, we'll verify your portfolio instantly — no uploads needed.
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Your broker account email</label>
                  <input
                    type="email"
                    value={brokerEmail}
                    onChange={e => { setBrokerEmail(e.target.value); setResult(null) }}
                    placeholder="e.g. sam@gmail.com"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, fontFamily: 'DM Mono, monospace', outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={e => (e.target.style.borderColor = '')}
                  />
                  <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>This must match the email you signed up to Fennec SI with. We never contact your broker — this is just a self-confirmation.</p>
                </div>
              </>
            )}

            <button
              onClick={verify}
              disabled={!canSubmit || verifying}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px', borderRadius: 8, border: 'none', cursor: canSubmit && !verifying ? 'pointer' : 'not-allowed', background: 'var(--primary)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, opacity: canSubmit && !verifying ? 1 : 0.45, transition: 'opacity 0.15s' }}
            >
              {verifying
                ? <><LoadingSpinner size={14} /> {method === 'screenshot' ? 'Reading with Claude AI…' : 'Verifying…'}</>
                : <><IconShieldCheck size={15} /> Verify my portfolio</>
              }
            </button>

            <p style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.5 }}>
              🔒 We never access your broker account. Files are only used to match your holdings and are not stored.
            </p>
          </>
        ) : (
          <div>
            {result.status === 'verified' ? (
              <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <IconCheck size={18} style={{ color: 'var(--green)' }} />
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--green)' }}>Portfolio Verified</span>
                </div>
                {result.verified_tickers?.length > 0 && (
                  <p style={{ fontSize: 13, marginBottom: 8, lineHeight: 1.6 }}>
                    Matched: <strong>{result.verified_tickers.join(', ')}</strong>
                  </p>
                )}
                <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }}>{result.claude_notes}</p>
              </div>
            ) : (
              <div style={{ background: 'rgba(240,84,84,0.08)', border: '1px solid rgba(240,84,84,0.3)', borderRadius: 10, padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <IconX size={18} style={{ color: 'var(--red)' }} />
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--red)' }}>Couldn't verify</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10 }}>{result.claude_notes}</p>
                {method !== 'email' && (
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                    <strong style={{ color: 'var(--text)' }}>Tips:</strong>
                    <ul style={{ listStyle: 'disc', paddingLeft: 18, marginTop: 4 }}>
                      {method === 'csv'
                        ? <>
                            <li>Make sure you're downloading a <strong>holdings/portfolio</strong> export, not a transaction history</li>
                            <li>Check that the ticker symbols in your broker match what you entered in Fennec</li>
                          </>
                        : <>
                            <li>Make sure ticker names and symbols are clearly visible</li>
                            <li>Scroll to show all holdings — don't crop the list</li>
                          </>
                      }
                    </ul>
                  </div>
                )}
              </div>
            )}
            <button onClick={reset}
              style={{ marginTop: 12, width: '100%', padding: '11px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

function FileDropZone({ file, accept, hint, onFile, onDrop, onChange }: {
  file: File | null; accept: string; hint: string
  onFile: (f: File) => void; onDrop: (e: React.DragEvent) => void; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <label
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '28px 16px', borderRadius: 10, cursor: 'pointer', border: `2px dashed ${file ? 'var(--primary)' : 'var(--border)'}`, background: file ? 'rgba(44,110,106,0.06)' : 'var(--surface2)', color: 'var(--text2)', fontSize: 13, transition: 'all 0.15s' }}
    >
      <IconUpload size={22} style={{ color: file ? 'var(--primary)' : 'var(--text2)' }} />
      {file
        ? <span style={{ color: 'var(--text)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>{file.name}</span>
        : <>
            <span style={{ color: 'var(--text)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>{hint}</span>
            <span style={{ fontSize: 11 }}>Max 10MB</span>
          </>
      }
      <input type="file" accept={accept} style={{ display: 'none' }} onChange={onChange} />
    </label>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
