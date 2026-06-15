'use client'
import { useState, useRef, useEffect } from 'react'
import { api } from '@/lib/api'
import { IconSend, IconRobot } from '@tabler/icons-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

interface Msg { role: 'user' | 'assistant'; content: string }

export function AIAdvisor({ portfolio }: { portfolio: string[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', content: `Hi! I'm your Fennec SI advisor. I can see you hold: ${portfolio.join(', ')}. Ask me anything about your portfolio, market conditions, or investment strategy.` }
  ])
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ background: 'rgba(91,106,255,0.15)', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconRobot size={16} style={{ color: 'var(--accent)' }} />
        </div>
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14 }}>AI Advisor</span>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', marginLeft: 'auto' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div
              style={{
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: m.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.content || (streaming && i === msgs.length - 1 ? <LoadingSpinner size={14} /> : '')}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about your portfolio…"
          disabled={streaming}
          style={{
            flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13,
            fontFamily: 'DM Mono, monospace', outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          style={{
            background: 'var(--accent)', color: 'white', border: 'none',
            borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
            opacity: !input.trim() || streaming ? 0.5 : 1,
          }}
        >
          {streaming ? <LoadingSpinner size={16} /> : <IconSend size={16} />}
        </button>
      </form>
    </div>
  )
}
