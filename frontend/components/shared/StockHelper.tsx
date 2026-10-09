'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { IconX, IconSend, IconChevronDown, IconBrain, IconRefresh } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

interface HelperContext {
  portfolioSummary?: string
  watchlistSummary?: string
  recentNews?: string[]
}

async function getToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || null
}

// Minimal markdown → HTML: bold, bullets, line breaks
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]+?<\/li>)/g, '<ul style="margin:6px 0 6px 16px;padding:0">$1</ul>')
    .replace(/\n{2,}/g, '</p><p style="margin:6px 0">')
    .replace(/\n/g, '<br/>')
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '85%', padding: '8px 12px', borderRadius: 10, fontSize: 12,
          lineHeight: 1.6, background: 'var(--accent)', color: '#fff',
        }}>
          {msg.content}
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div style={{
        maxWidth: '92%', padding: '10px 12px', borderRadius: 10, fontSize: 12,
        lineHeight: 1.7, background: 'var(--surface2)', color: 'var(--text)',
        border: '1px solid var(--border)',
      }}>
        {msg.streaming && !msg.content
          ? <span style={{ opacity: 0.4 }}>▋</span>
          : <span
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) + (msg.streaming ? ' <span style="opacity:0.4">▋</span>' : '') }}
            />
        }
      </div>
    </div>
  )
}

export function StockHelper() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState<HelperContext | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([
    'What is a P/E ratio?',
    'How do interest rates affect stocks?',
    'Explain the yield curve',
    'What drives sector rotation?',
    'How do I read earnings reports?',
  ])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const contextLoadedRef = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  const loadContext = useCallback(async () => {
    if (contextLoadedRef.current || contextLoading) return
    setContextLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: holdings }, { data: watchlist }] = await Promise.all([
        supabase.from('holdings').select('ticker,shares,buy_price,current_price,signal').eq('user_id', user.id),
        supabase.from('watchlist').select('ticker,name,signal').eq('user_id', user.id),
      ])

      // Build compact portfolio summary
      let portfolioSummary = ''
      if (holdings?.length) {
        portfolioSummary = holdings.map(h => {
          const cost = h.buy_price * h.shares
          const value = (h.current_price || h.buy_price) * h.shares
          const pnlPct = cost > 0 ? ((value - cost) / cost * 100).toFixed(1) : '0'
          const sign = parseFloat(pnlPct) >= 0 ? '+' : ''
          return `${h.ticker} (${h.shares} shares, avg $${h.buy_price?.toFixed(2)}, now $${(h.current_price || h.buy_price)?.toFixed(2)}, ${sign}${pnlPct}%${h.signal ? `, signal: ${h.signal}` : ''})`
        }).join('\n')
      }

      // Build watchlist summary
      let watchlistSummary = ''
      if (watchlist?.length) {
        watchlistSummary = watchlist.map(w => `${w.ticker}${w.name ? ` (${w.name})` : ''}${w.signal ? ` — ${w.signal}` : ''}`).join(', ')
      }

      // Fetch recent news headlines using the token
      const token = await getToken()
      let recentNews: string[] = []
      try {
        const tickers = [...(holdings || []).map(h => h.ticker), ...(watchlist || []).map(w => w.ticker)].slice(0, 8)
        const url = `${API}/api/news${tickers.length ? `?tickers=${tickers.join(',')}` : ''}`
        const newsRes = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (newsRes.ok) {
          const newsData = await newsRes.json()
          recentNews = (newsData || []).slice(0, 25).map((n: any) => {
            const ticker = n.ticker ? `[${n.ticker}] ` : ''
            const summary = n.summary ? ` — ${n.summary.slice(0, 80)}` : ''
            return `${ticker}${n.headline}${summary}`
          })
        }
      } catch {}

      const ctx: HelperContext = {
        portfolioSummary: portfolioSummary || undefined,
        watchlistSummary: watchlistSummary || undefined,
        recentNews: recentNews.length ? recentNews : undefined,
      }
      setContext(ctx)
      contextLoadedRef.current = true

      // Build context-aware suggestions
      const dynamicSuggestions: string[] = []
      if (holdings?.length) {
        const topHolding = holdings[0]?.ticker
        if (topHolding) dynamicSuggestions.push(`What's the outlook for ${topHolding}?`)
      }
      if (recentNews.length) {
        dynamicSuggestions.push('What are the biggest market themes right now?')
      }
      dynamicSuggestions.push(
        'Analyse my portfolio risk',
        'How do rising interest rates affect my holdings?',
        'Explain what a yield curve inversion means',
      )
      setSuggestions(dynamicSuggestions.slice(0, 5))
    } catch {}
    setContextLoading(false)
  }, [contextLoading])

  useEffect(() => {
    if (open && !contextLoadedRef.current) loadContext()
  }, [open, loadContext])

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
        body: JSON.stringify({ messages: nextMessages, context }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          for (const line of decoder.decode(value, { stream: true }).split('\n')) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6)
            if (payload === '[DONE]') break
            try {
              const { text: chunk } = JSON.parse(payload)
              if (chunk) {
                assistantText += chunk
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
    } catch {
      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.', streaming: false }
        return copy
      })
    } finally {
      setLoading(false)
    }
  }

  function refreshContext() {
    contextLoadedRef.current = false
    setContext(null)
    loadContext()
  }

  const hasContext = !!(context?.portfolioSummary || context?.watchlistSummary || context?.recentNews?.length)

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed', bottom: 24, left: 24, zIndex: 9998,
          width: 50, height: 50, borderRadius: '50%',
          background: open ? 'var(--surface2)' : 'var(--accent)',
          border: open ? '1px solid var(--border)' : 'none',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: open ? 'none' : '0 4px 20px rgba(91,106,255,0.45)',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
        title="Fennec AI Analyst"
      >
        {open
          ? <IconChevronDown size={20} style={{ color: 'var(--text2)' }} />
          : <IconBrain size={22} color="#fff" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 86, left: 24, zIndex: 9997,
          width: 420, maxHeight: 580,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 50px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '13px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--surface2)', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconBrain size={16} style={{ color: 'var(--accent)' }} />
              <div>
                <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>Fennec AI Analyst</span>
                {contextLoading && (
                  <span style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 8 }}>Loading context…</span>
                )}
                {hasContext && !contextLoading && (
                  <span style={{ fontSize: 10, color: 'var(--green)', marginLeft: 8 }}>● Live context</span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {hasContext && (
                <button
                  onClick={refreshContext}
                  title="Refresh context"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text2)', lineHeight: 0 }}
                >
                  <IconRefresh size={14} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text2)', lineHeight: 0 }}
              >
                <IconX size={16} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ color: 'var(--text2)', fontSize: 11, margin: '0 0 4px', lineHeight: 1.5 }}>
                  Expert analysis on your portfolio, current market news, macro trends, and any financial concept.
                  {hasContext && <span style={{ color: 'var(--accent2)' }}> Aware of your holdings and today's news.</span>}
                </p>
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                      color: 'var(--text)', fontSize: 11.5, textAlign: 'left',
                      fontFamily: 'DM Mono, monospace', transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px', borderTop: '1px solid var(--border)',
            display: 'flex', gap: 8, background: 'var(--surface2)', flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
              placeholder={contextLoading ? 'Loading your context…' : 'Ask anything about markets or your portfolio…'}
              disabled={loading}
              style={{
                flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '8px 10px', color: 'var(--text)',
                fontSize: 12, fontFamily: 'DM Mono, monospace', outline: 'none',
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              style={{
                background: 'var(--accent)', border: 'none', borderRadius: 8,
                width: 36, height: 36, cursor: loading || !input.trim() ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: loading || !input.trim() ? 0.4 : 1, flexShrink: 0,
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
