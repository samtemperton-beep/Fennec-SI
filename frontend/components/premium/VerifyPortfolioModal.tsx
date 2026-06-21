'use client'
import { useState } from 'react'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { api } from '@/lib/api'
import { IconUpload, IconCheck, IconX, IconShieldCheck } from '@tabler/icons-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  onVerified: (tickers: string[]) => void
}

export function VerifyPortfolioModal({ open, onClose, onVerified }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<{ verified_tickers: string[]; claude_notes: string; status: string } | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
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

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Verify Portfolio">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'rgba(91,106,255,0.08)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--text2)' }}>
          <div className="flex items-center gap-2 mb-1">
            <IconShieldCheck size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>How verification works</span>
          </div>
          Upload a screenshot or PDF of your broker account showing your holdings. Claude AI will read the document and verify which stocks match your portfolio — no login or API access needed.
        </div>

        {!result ? (
          <>
            <label
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: '28px 16px', borderRadius: 10, cursor: 'pointer',
                border: `2px dashed ${file ? 'var(--accent)' : 'var(--border)'}`,
                background: file ? 'rgba(91,106,255,0.06)' : 'var(--surface2)',
                color: 'var(--text2)', fontSize: 13,
              }}
            >
              <IconUpload size={22} style={{ color: file ? 'var(--accent)' : 'var(--text2)' }} />
              {file
                ? <span style={{ color: 'var(--text)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>{file.name}</span>
                : <span>Click to upload broker statement (PDF or image)</span>
              }
              <span style={{ fontSize: 11 }}>Max 10MB · Hatch, Sharesies, IBKR, CommSec, etc.</span>
              <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFile} />
            </label>

            <div className="flex gap-3">
              <button
                onClick={verify}
                disabled={!file || verifying}
                className="flex items-center justify-center gap-2"
                style={{
                  flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: file && !verifying ? 'pointer' : 'not-allowed',
                  background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600,
                  opacity: file && !verifying ? 1 : 0.5,
                }}
              >
                {verifying ? <><LoadingSpinner size={14} /> Verifying with Claude...</> : <><IconShieldCheck size={14} /> Verify</>}
              </button>
              {file && !verifying && (
                <button onClick={reset} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>
                  Clear
                </button>
              )}
            </div>
          </>
        ) : (
          <div>
            {result.status === 'verified' ? (
              <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '14px 16px' }}>
                <div className="flex items-center gap-2 mb-2">
                  <IconCheck size={16} style={{ color: 'var(--green)' }} />
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--green)' }}>Portfolio Verified</span>
                </div>
                <p style={{ fontSize: 13, marginBottom: 8 }}>
                  Verified holdings: <strong>{result.verified_tickers.join(', ')}</strong>
                </p>
                <p style={{ fontSize: 12, color: 'var(--text2)' }}>{result.claude_notes}</p>
              </div>
            ) : (
              <div style={{ background: 'rgba(240,84,84,0.08)', border: '1px solid rgba(240,84,84,0.3)', borderRadius: 10, padding: '14px 16px' }}>
                <div className="flex items-center gap-2 mb-2">
                  <IconX size={16} style={{ color: 'var(--red)' }} />
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--red)' }}>Could Not Verify</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text2)' }}>{result.claude_notes}</p>
              </div>
            )}
            <button
              onClick={reset}
              style={{ marginTop: 12, width: '100%', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}
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
      // Strip data URL prefix (data:image/png;base64,...)
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
