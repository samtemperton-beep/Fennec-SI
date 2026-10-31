'use client'
import { useEffect, useRef, useState } from 'react'
import { IconMessageCircle, IconSend, IconX } from '@tabler/icons-react'
import { api } from '@/lib/api'
import { FoxIcon } from '@/components/shared/FoxIcon'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

// "Ask Fennec" for the Akahu step, where people are most likely to get stuck.
// Inline rather than the floating assistant: that one lives inside the app, is
// about their finances, and counts toward the free AI limit.

interface Msg { role: 'user' | 'assistant'; content: string }

const STARTERS = [
  "I can't find the Developers page",
  'What is multi-factor authentication?',
  "My bank won't connect",
  "Is this safe? What can Fennec see?",
]

// Passwords can't be spotted, but tokens can: stop them leaving the browser.
const LOOKS_LIKE_TOKEN = /\b(app_token_|user_token_)\S{6,}/i

export function SetupHelpChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [messages, loading])

  async function send(text: string) {
    const content = text.trim()
    if (!content || loading) return
    if (LOOKS_LIKE_TOKEN.test(content)) {
      setError('That looks like one of your tokens. Please don’t share it here: paste it into the boxes below instead.')
      setInput('')
      return
    }
    setError('')
    const next: Msg[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const { reply } = await api.setupHelp(next)
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 10, background: 'var(--accent-light)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginBottom: 20 }}>
        <IconMessageCircle size={15} style={{ color: 'var(--accent)' }} /> Stuck? Ask Fennec for help
      </button>
    )
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface2)', marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
        <FoxIcon size={20} />
        <span style={{ flex: 1, fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>Ask Fennec</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close help" style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', lineHeight: 0, padding: 2 }}><IconX size={15} /></button>
      </div>

      <div style={{ maxHeight: 260, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <>
            <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, margin: 0 }}>
              Tell me where you&apos;re stuck and what you can see on screen. Please don&apos;t share passwords, codes or tokens here.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {STARTERS.map(s => (
                <button key={s} type="button" onClick={() => send(s)}
                  style={{ padding: '5px 10px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 11.5, cursor: 'pointer', textAlign: 'left' }}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '8px 11px', borderRadius: 10, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: m.role === 'user' ? 'var(--primary)' : 'var(--surface)', color: m.role === 'user' ? 'white' : 'var(--text)' }}>
            {m.content}
          </div>
        ))}
        {loading && <div style={{ alignSelf: 'flex-start', padding: '4px 6px' }}><LoadingSpinner size={14} /></div>}
        {error && <p style={{ fontSize: 12, color: 'var(--red)', margin: 0, lineHeight: 1.45 }}>{error}</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={e => { e.preventDefault(); send(input) }} style={{ display: 'flex', gap: 6, padding: 8, borderTop: '1px solid var(--border)' }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type your question…" autoFocus maxLength={1000}
          style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
        <button type="submit" disabled={!input.trim() || loading} aria-label="Send"
          style={{ padding: '0 11px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', cursor: 'pointer', lineHeight: 0, opacity: !input.trim() || loading ? 0.5 : 1 }}>
          <IconSend size={15} />
        </button>
      </form>
    </div>
  )
}
