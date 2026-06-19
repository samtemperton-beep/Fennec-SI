'use client'
import { useState, useRef, useEffect } from 'react'
import { IconX, IconSend, IconChevronDown, IconSparkles } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

const SUGGESTIONS = [
  'What is a P/E ratio?',
  'How do dividends work?',
  'What is market cap?',
  'What does EPS mean?',
  'Explain ETFs simply',
]

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

async function getToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || null
}

export function StockHelper() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  async function send(text: string) {
    const question = text.trim()
    if (!question || loading) return
    setInput('')

    const nextMessages: Message[] = [...messages, { role: 'user', content: question }]
    setMessages([...nextMessages, { role: 'assistant', content: '', streaming: true }])
    setLoading(true)

    try {
      const token = await getToken()
      const res = await fetch(`${API}/api/ai/helper`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: nextMessages }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6)
            if (payload === '[DONE]') break
            try {
              const { text } = JSON.parse(payload)
              if (text) {
                assistantText += text
                setMessages(prev => {
                  const copy = [...prev]
                  copy[copy.length - 1] = { role: 'assistant', content: assistantText, streaming: true }
                  return copy
                })
              }
            } catch {}
          }
        }
      }

      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: assistantText, streaming: false }
        return copy
      })
    } catch (e: any) {
      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: 'Sorry, something went wrong. Please try again.', streaming: false }
        return copy
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed', bottom: 24, left: 24, zIndex: 9998,
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--accent)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(91,106,255,0.4)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
        title="Stock Helper"
      >
        {open
          ? <IconChevronDown size={20} color="#fff" />
          : <IconSparkles size={20} color="#fff" />}
      </button>

      {/* Chat drawer */}
      {open && (
        <div
          style={{
            position: 'fixed', bottom: 84, left: 24, zIndex: 9997,
            width: 360, maxHeight: 520,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, display: 'flex', flexDirection: 'column',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--surface2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconSparkles size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14 }}>
                Stock Helper
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text2)', lineHeight: 0 }}
            >
              <IconX size={16} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ color: 'var(--text2)', fontSize: 12, margin: 0 }}>
                  Ask me anything about stocks, investing terms, or market concepts.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      style={{
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
                        color: 'var(--text)', fontSize: 12, textAlign: 'left',
                        fontFamily: 'DM Mono, monospace', transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '85%', padding: '8px 12px', borderRadius: 10, fontSize: 12,
                    lineHeight: 1.6, whiteSpace: 'pre-wrap',
                    background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                  }}
                >
                  {msg.content}
                  {msg.streaming && <span style={{ opacity: 0.5 }}> ▋</span>}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px', borderTop: '1px solid var(--border)',
            display: 'flex', gap: 8, background: 'var(--surface2)',
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
              placeholder="Ask a question..."
              disabled={loading}
              style={{
                flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '7px 10px', color: 'var(--text)',
                fontSize: 12, fontFamily: 'DM Mono, monospace', outline: 'none',
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              style={{
                background: 'var(--accent)', border: 'none', borderRadius: 8,
                width: 34, height: 34, cursor: loading || !input.trim() ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: loading || !input.trim() ? 0.5 : 1, flexShrink: 0,
                transition: 'opacity 0.15s',
              }}
            >
              <IconSend size={15} color="#fff" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
