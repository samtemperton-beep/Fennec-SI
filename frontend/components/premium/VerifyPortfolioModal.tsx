'use client'
import { useState } from 'react'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { api } from '@/lib/api'
import { IconUpload, IconCheck, IconX, IconShieldCheck, IconCamera, IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  onVerified: (tickers: string[]) => void
}

const BROKER_GUIDES: Record<string, { steps: string[]; tip?: string }> = {
  hatch: {
    steps: [
      'Open the Hatch app on your phone',
      'Tap the Portfolio tab at the bottom',
      'You\'ll see a list of your holdings — scroll down to show all of them',
      'Take a screenshot (hold Power + Volume Down on Android, or Power + Home/Side button on iPhone)',
      'Upload that screenshot below',
    ],
    tip: 'If you have many holdings, take multiple screenshots and upload one at a time.',
  },
  sharesies: {
    steps: [
      'Open the Sharesies app or website',
      'Go to Portfolio in the navigation',
      'You\'ll see your investments listed with names and amounts',
      'Take a screenshot showing all your holdings',
      'Upload that screenshot below',
    ],
  },
  investnow: {
    steps: [
      'Log in to InvestNow at investnow.co.nz',
      'Click on My Portfolio',
      'Take a screenshot of your holdings',
      'Upload that screenshot below',
    ],
  },
  commsec: {
    steps: [
      'Log in to CommSec online or the app',
      'Go to Portfolio → Holdings',
      'Take a screenshot showing your stock positions',
      'Upload that screenshot below',
    ],
  },
  selfwealth: {
    steps: [
      'Log in to SelfWealth',
      'Go to My Portfolio',
      'Take a screenshot of your holdings page',
      'Upload that screenshot below',
    ],
  },
  ibkr: {
    steps: [
      'Log in to Interactive Brokers (Trader Workstation or the app)',
      'Go to Portfolio → Positions',
      'Take a screenshot or export as PDF',
      'Upload it below',
    ],
  },
}

const DEFAULT_GUIDE = {
  steps: [
    'Open your broker app or website',
    'Navigate to your Portfolio or Holdings section',
    'Take a screenshot showing your stock holdings (names and amounts)',
    'Upload that screenshot below — a phone photo works too',
  ],
}

export function VerifyPortfolioModal({ open, onClose, onVerified }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<{ verified_tickers: string[]; claude_notes: string; status: string } | null>(null)
  const [selectedBroker, setSelectedBroker] = useState<string>('hatch')
  const [guideOpen, setGuideOpen] = useState(true)

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
    if (!file) return
    setVerifying(true)
    try {
      const base64 = await fileToBase64(file)
      const mediaType = file.type || 'image/jpeg'
      const { verification, newBadges } = await api.verifyPortfolio(base64, mediaType)
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
  }

  const guide = BROKER_GUIDES[selectedBroker] || DEFAULT_GUIDE

  const BROKERS = [
    { id: 'hatch', label: 'Hatch' },
    { id: 'sharesies', label: 'Sharesies' },
    { id: 'investnow', label: 'InvestNow' },
    { id: 'commsec', label: 'CommSec' },
    { id: 'selfwealth', label: 'SelfWealth' },
    { id: 'ibkr', label: 'IBKR' },
    { id: 'other', label: 'Other' },
  ]

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Verify Portfolio">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {!result ? (
          <>
            {/* What you need */}
            <div style={{ background: 'rgba(44,110,106,0.08)', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <IconCamera size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, marginBottom: 3 }}>All you need is a screenshot</p>
                <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }}>Just take a screenshot of your holdings in your broker app. No downloads or logins required — Claude AI reads the image and matches your stocks.</p>
              </div>
            </div>

            {/* Broker selector */}
            <div>
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Which broker are you using?</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {BROKERS.map(b => (
                  <button key={b.id} onClick={() => { setSelectedBroker(b.id); setGuideOpen(true) }}
                    style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', border: selectedBroker === b.id ? 'none' : '1px solid var(--border)', background: selectedBroker === b.id ? 'var(--primary)' : 'var(--surface2)', color: selectedBroker === b.id ? 'white' : 'var(--text2)', transition: 'all 0.15s' }}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Step-by-step guide */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <button onClick={() => setGuideOpen(o => !o)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', border: 'none', cursor: 'pointer', color: 'var(--text)' }}>
                <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>
                  How to get your {BROKERS.find(b => b.id === selectedBroker)?.label || 'broker'} screenshot
                </span>
                {guideOpen ? <IconChevronUp size={15} style={{ color: 'var(--text2)' }} /> : <IconChevronDown size={15} style={{ color: 'var(--text2)' }} />}
              </button>
              {guideOpen && (
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {guide.steps.map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', color: 'white', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        {i + 1}
                      </div>
                      <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text)', paddingTop: 2 }}>{step}</p>
                    </div>
                  ))}
                  {guide.tip && (
                    <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6 }}>
                      💡 {guide.tip}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Upload area */}
            <label
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: '28px 16px', borderRadius: 10, cursor: 'pointer',
                border: `2px dashed ${file ? 'var(--primary)' : 'var(--border)'}`,
                background: file ? 'rgba(44,110,106,0.06)' : 'var(--surface2)',
                color: 'var(--text2)', fontSize: 13, transition: 'all 0.15s',
              }}
            >
              <IconUpload size={22} style={{ color: file ? 'var(--primary)' : 'var(--text2)' }} />
              {file
                ? <span style={{ color: 'var(--text)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>{file.name}</span>
                : <>
                    <span style={{ color: 'var(--text)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>Upload your screenshot here</span>
                    <span style={{ fontSize: 11 }}>Drag &amp; drop or click to browse · PNG, JPG, or PDF · Max 10MB</span>
                  </>
              }
              <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFile} />
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={verify}
                disabled={!file || verifying}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px', borderRadius: 8, border: 'none',
                  cursor: file && !verifying ? 'pointer' : 'not-allowed',
                  background: 'var(--primary)', color: 'white',
                  fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14,
                  opacity: file && !verifying ? 1 : 0.5,
                }}
              >
                {verifying ? <><LoadingSpinner size={14} /> Verifying with Claude AI…</> : <><IconShieldCheck size={15} /> Verify my portfolio</>}
              </button>
              {file && !verifying && (
                <button onClick={reset} style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer' }}>
                  Clear
                </button>
              )}
            </div>

            {/* Direct linking note */}
            <p style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.5 }}>
              🔒 We never access your broker account — screenshots stay private and are only used to match your holdings.
              {' '}<span style={{ color: 'var(--text3)' }}>Direct account linking (no screenshot needed) is coming soon as brokers open up API access.</span>
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
                <p style={{ fontSize: 13, marginBottom: 8, lineHeight: 1.6 }}>
                  Matched holdings: <strong>{result.verified_tickers.join(', ')}</strong>
                </p>
                <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }}>{result.claude_notes}</p>
              </div>
            ) : (
              <div style={{ background: 'rgba(240,84,84,0.08)', border: '1px solid rgba(240,84,84,0.3)', borderRadius: 10, padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <IconX size={18} style={{ color: 'var(--red)' }} />
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--red)' }}>Couldn't verify</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10 }}>{result.claude_notes}</p>
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--text)' }}>Tips for a better screenshot:</strong>
                  <ul style={{ listStyle: 'disc', paddingLeft: 18, marginTop: 4 }}>
                    <li>Make sure stock names and ticker symbols are visible</li>
                    <li>Scroll to show all holdings — don't crop them</li>
                    <li>Ensure the image is clear and not blurry</li>
                    <li>Include the full portfolio page, not just a summary</li>
                  </ul>
                </div>
              </div>
            )}
            <button
              onClick={reset}
              style={{ marginTop: 12, width: '100%', padding: '11px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
