'use client'
import { useState, useRef, useEffect } from 'react'
import { api } from '@/lib/api'
import { IconSend } from '@tabler/icons-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

interface Msg { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  "What's my best performer?",
  'Should I rebalance?',
  'Explain my BUY signals',
]

export function AIAdvisor({ portfolio }: { portfolio: string[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || streaming) return
    const userMsg: Msg = { role: 'user', content: input.trim() }
    setMsgs(m => [...m, userMsg])
    setInput('')
    setStreaming(true)

    const apiMsgs = [...msgs, userMsg].map(m => ({ role: m.role, content: m.content }))
    let text = ''
    setMsgs(m => [...m, { role: 'assistant', content: '' }])

    try {
      for await (const chunk of api.streamChat(apiMsgs, portfolio)) {
        text += chunk
        setMsgs(m => {
          const copy = [...m]
          copy[copy.length - 1] = { role: 'assistant', content: text }
          return copy
        })
      }
    } catch (e: any) {
      setMsgs(m => {
        const copy = [...m]
        copy[copy.length - 1] = { role: 'assistant', content: `Error: ${e.message}` }
        return copy
      })
    }
    setStreaming(false)
  }

  function ask(q: string) {
    setInput(q)
    setTimeout(() => {
      const form = document.getElementById('advisor-form') as HTMLFormElement
      form?.requestSubmit()
    }, 50)
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 16, boxShadow: 'var(--sh)', overflow: 'hidden', position: 'sticky', top: 24, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
            🦊
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 1 }}>Ask Fennec</p>
            <p style={{ fontSize: 11, color: 'var(--text2)' }}>Your AI investing coach</p>
          </div>
          <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
        </div>
      </div>

      {/* Messages */}
      {msgs.length === 0 ? (
        <div style={{ padding: '20px 18px', color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>
          Hey! Ask me anything about your portfolio — signals, performance, or what to consider next.
        </div>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {msgs.map((m, i) => (
            <div
              key={i}
              style={{
                padding: '12px 15px',
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: m.role === 'user' ? 'var(--primary)' : 'var(--surface2)',
                color: m.role === 'user' ? '#fff' : 'var(--text)',
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
              }}
            >
              {m.content || (streaming && i === msgs.length - 1 ? <LoadingSpinner size={14} /> : '')}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <form id="advisor-form" onSubmit={send} style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about your portfolio…"
          disabled={streaming}
          style={{
            flex: 1, background: 'var(--surface2)', border: '1.5px solid var(--border)',
            borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 12,
            outline: 'none', fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          style={{
            background: 'var(--primary)', color: 'white', border: 'none',
            borderRadius: 8, padding: '9px 12px', cursor: 'pointer', flexShrink: 0,
            opacity: !input.trim() || streaming ? 0.5 : 1,
          }}
        >
          {streaming ? <LoadingSpinner size={14} /> : <IconSend size={14} />}
        </button>
      </form>

      {/* Quick suggestions */}
      {msgs.length === 0 && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => ask(s)}
              style={{ fontSize: 10, fontWeight: 600, padding: '5px 10px', borderRadius: 20, background: 'var(--surface2)', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
