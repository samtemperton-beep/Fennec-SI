'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { IconMessageReport, IconX, IconPhoto } from '@tabler/icons-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

export type FeedbackKind = 'bug' | 'idea' | 'premium' | 'other'
const EVENT = 'fennec:feedback'

/** Opens the feedback form from anywhere, e.g. a "Request Premium" button. */
export function openFeedback(kind: FeedbackKind = 'bug') {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { kind } }))
}

const KIND_LABELS: Record<FeedbackKind, string> = { bug: 'Something broke', idea: 'Idea', premium: 'Request Premium', other: 'Other' }
const PLACEHOLDERS: Record<FeedbackKind, string> = {
  bug: 'What were you doing, and what went wrong?',
  idea: 'What would make Fennec better for you?',
  premium: 'Anything you’d like to tell Sam? (optional)',
  other: 'Tell us anything.',
}
const MAX_SHOT = 4 * 1024 * 1024

// The floating Feedback button and its form. Sent by email to the admins.
export function Feedback() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [message, setMessage] = useState('')
  const [shot, setShot] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onOpen = (e: Event) => { setKind((e as CustomEvent).detail?.kind || 'bug'); setOpen(true) }
    window.addEventListener(EVENT, onOpen)
    return () => window.removeEventListener(EVENT, onOpen)
  }, [])

  function pickShot(f: File | undefined) {
    if (!f) return
    if (!f.type.startsWith('image/')) return toast.error('Choose an image file.')
    if (f.size > MAX_SHOT) return toast.error('That image is over 4 MB.')
    setShot(f)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim() && kind !== 'premium') return
    setSending(true)
    try {
      let screenshot
      if (shot) {
        const buf = new Uint8Array(await shot.arrayBuffer())
        let bin = ''
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
        screenshot = { name: shot.name, type: shot.type, data: btoa(bin) }
      }
      await api.sendFeedback({ kind, message: message.trim(), page: pathname, screenshot })
      toast.success(kind === 'premium' ? 'Request sent. Sam will be in touch.' : 'Thanks! Your feedback was sent.')
      setOpen(false); setMessage(''); setShot(null)
    } catch (err: any) {
      toast.error(err.message)
    }
    setSending(false)
  }

  return (
    <>
      <button onClick={() => { setKind('bug'); setOpen(true) }} className="feedback-fab" aria-label="Send feedback">
        <IconMessageReport size={16} /> <span className="feedback-fab-label">Feedback</span>
      </button>

      {open && (
        <div onClick={() => !sending && setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <form onSubmit={send} onClick={e => e.stopPropagation()} className="card"
            style={{ width: '100%', maxWidth: 440, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16 }}>Send feedback</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer' }}><IconX size={18} /></button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: -6 }}>Fennec is still in testing. Every report helps.</p>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(KIND_LABELS) as FeedbackKind[]).map(k => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  style={{ padding: '5px 10px', borderRadius: 16, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${kind === k ? 'var(--primary)' : 'var(--border)'}`,
                    background: kind === k ? 'var(--primary)' : 'var(--surface2)', color: kind === k ? 'white' : 'var(--text)' }}>
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>

            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder={PLACEHOLDERS[kind]} rows={5} maxLength={5000} autoFocus
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, resize: 'vertical' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)' }}>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => pickShot(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}>
                <IconPhoto size={14} /> {shot ? 'Change screenshot' : 'Add a screenshot'}
              </button>
              {shot && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{shot.name} <button type="button" onClick={() => setShot(null)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>remove</button></span>}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text3)' }}>Sent with the page you&apos;re on ({pathname}) and your email, so Sam can reply.</p>

            <button type="submit" disabled={sending || (!message.trim() && kind !== 'premium')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', opacity: sending || (!message.trim() && kind !== 'premium') ? 0.6 : 1 }}>
              {sending && <LoadingSpinner size={14} />} {kind === 'premium' ? 'Send request' : 'Send'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
