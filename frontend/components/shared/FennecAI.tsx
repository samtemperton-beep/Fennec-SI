'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { IconX, IconSend, IconRefresh } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'
import { usePathname } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message { role: 'user' | 'assistant'; content: string; streaming?: boolean }

interface FennecContext {
  // Investing
  portfolioSummary?: string
  watchlistSummary?: string
  recentNews?: string[]
  // Finance
  accountsSummary?: string
  monthlySpend?: string
  goalsSummary?: string
  kiwiSaverSummary?: string
  // Meta
  pageHint: string
}

// ── Page config ───────────────────────────────────────────────────────────────

function getPageConfig(pathname: string): {
  pageHint: string
  label: string
  description: string
  suggestions: string[]
  loadInvesting: boolean
  loadFinance: boolean
} {
  if (pathname.includes('/finance/kiwisaver')) return {
    pageHint: 'kiwisaver',
    label: 'Fennec AI',
    description: 'Ask about your KiwiSaver, NZ retirement planning, or contribution strategies.',
    suggestions: [
      'Am I on track for retirement?',
      'Should I increase my contribution rate?',
      'What fund type suits my age?',
      'How much will I have at 65?',
      'Explain the government MTC',
    ],
    loadInvesting: false, loadFinance: true,
  }
  if (pathname.includes('/finance/budget')) return {
    pageHint: 'budget',
    label: 'Fennec AI',
    description: 'Ask about your spending, budgets, or how to cut costs.',
    suggestions: [
      'Am I on track this month?',
      'Where am I overspending?',
      'How should I allocate my income?',
      'What\'s a good savings rate for my situation?',
      'Explain the 50/30/20 rule',
    ],
    loadInvesting: false, loadFinance: true,
  }
  if (pathname.includes('/finance/goals')) return {
    pageHint: 'goals',
    label: 'Fennec AI',
    description: 'Ask about your savings goals or how to reach them faster.',
    suggestions: [
      'Am I on track with my goals?',
      'How can I hit my goals faster?',
      'Should I prioritise paying off debt or saving?',
      'What\'s a realistic emergency fund target for NZ?',
    ],
    loadInvesting: false, loadFinance: true,
  }
  if (pathname.includes('/finance/transactions')) return {
    pageHint: 'transactions',
    label: 'Fennec AI',
    description: 'Ask about your spending patterns, categories, or where your money goes.',
    suggestions: [
      'What are my biggest spending categories?',
      'How does my spending compare to last month?',
      'Tips to reduce discretionary spending?',
      'What\'s a healthy debt-to-income ratio?',
    ],
    loadInvesting: false, loadFinance: true,
  }
  if (pathname.includes('/finance/bills')) return {
    pageHint: 'bills',
    label: 'Fennec AI',
    description: 'Ask about managing recurring bills, subscriptions, or household costs.',
    suggestions: [
      'How can I reduce my monthly bills?',
      'What bills are worth negotiating in NZ?',
      'Should I fix or float my mortgage?',
      'Tips for reducing power bills in NZ?',
    ],
    loadInvesting: false, loadFinance: true,
  }
  if (pathname.includes('/finance')) return {
    pageHint: 'finance',
    label: 'Fennec AI',
    description: 'Ask about your accounts, net worth, or household finances.',
    suggestions: [
      'How do my accounts look overall?',
      'Am I saving enough?',
      'What\'s a good net worth for my age?',
      'How should I structure my NZ bank accounts?',
      'Explain the NZ tax system briefly',
    ],
    loadInvesting: false, loadFinance: true,
  }
  if (pathname.includes('/news')) return {
    pageHint: 'news',
    label: 'Fennec AI',
    description: 'Ask about today\'s market news, macro trends, or how events affect your portfolio.',
    suggestions: [
      'What are the biggest market themes today?',
      'How does this news affect my holdings?',
      'Explain the macro backdrop right now',
      'Which sectors benefit from current trends?',
    ],
    loadInvesting: true, loadFinance: false,
  }
  if (pathname.includes('/watchlist')) return {
    pageHint: 'watchlist',
    label: 'Fennec AI',
    description: 'Ask about stocks on your watchlist — signals, valuation, or entry points.',
    suggestions: [
      'Which watchlist stock looks best right now?',
      'Give me a quick view on each watchlist stock',
      'What are the key risks I should watch?',
    ],
    loadInvesting: true, loadFinance: false,
  }
  if (pathname.includes('/dashboard')) return {
    pageHint: 'dashboard',
    label: 'Fennec AI',
    description: 'Ask anything about your overall financial health — investing and household.',
    suggestions: [
      'Give me an overview of my financial health',
      'Am I on track to reach my goals?',
      'What should I focus on improving?',
      'How does my net worth compare to NZ averages?',
    ],
    loadInvesting: true, loadFinance: true,
  }
  // Default: portfolio / investing
  return {
    pageHint: 'portfolio',
    label: 'Fennec AI',
    description: 'Ask about your portfolio, signals, valuation, or market outlook.',
    suggestions: [
      'What\'s my best performer?',
      'Should I rebalance?',
      'Explain my BUY signals',
      'Analyse my portfolio risk',
      'How do rising rates affect my holdings?',
    ],
    loadInvesting: true, loadFinance: false,
  }
}

// ── Supabase data loaders ─────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || null
}

async function loadInvestingContext(token: string | null): Promise<Partial<FennecContext>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const [{ data: holdings }, { data: watchlist }] = await Promise.all([
    supabase.from('holdings').select('ticker,shares,buy_price,current_price,signal').eq('user_id', user.id),
    supabase.from('watchlist').select('ticker,name,signal').eq('user_id', user.id),
  ])

  const portfolioSummary = holdings?.length
    ? holdings.map(h => {
        const cost = h.buy_price * h.shares
        const value = (h.current_price || h.buy_price) * h.shares
        const pnlPct = cost > 0 ? ((value - cost) / cost * 100).toFixed(1) : '0'
        const sign = parseFloat(pnlPct) >= 0 ? '+' : ''
        return `${h.ticker} (${h.shares}sh @ $${h.buy_price?.toFixed(2)}, now $${(h.current_price || h.buy_price)?.toFixed(2)}, ${sign}${pnlPct}%${h.signal ? `, signal: ${h.signal}` : ''})`
      }).join('\n')
    : undefined

  const watchlistSummary = watchlist?.length
    ? watchlist.map(w => `${w.ticker}${w.name ? ` (${w.name})` : ''}${w.signal ? ` — ${w.signal}` : ''}`).join(', ')
    : undefined

  let recentNews: string[] | undefined
  try {
    const tickers = [...(holdings || []).map(h => h.ticker), ...(watchlist || []).map(w => w.ticker)].slice(0, 8)
    const url = `${API}/api/news${tickers.length ? `?tickers=${tickers.join(',')}` : ''}`
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (res.ok) {
      const data = await res.json()
      recentNews = (data || []).slice(0, 20).map((n: any) => {
        const ticker = n.ticker ? `[${n.ticker}] ` : ''
        return `${ticker}${n.headline}${n.summary ? ` — ${n.summary.slice(0, 80)}` : ''}`
      })
    }
  } catch {}

  return { portfolioSummary, watchlistSummary, recentNews }
}

async function loadFinanceContext(): Promise<Partial<FennecContext>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

  const [{ data: accounts }, { data: txns }, { data: goals }, { data: ks }] = await Promise.all([
    supabase.from('fin_accounts').select('name, type, current_balance, owner'),
    supabase.from('fin_transactions').select('amount, category_id').gte('date', monthStart),
    supabase.from('fin_goals').select('name, target_amount, current_amount, status').eq('status', 'active'),
    supabase.from('fin_kiwisaver').select('provider, fund_type, current_balance, expected_return, retirement_age').eq('user_id', user.id).maybeSingle(),
  ])

  const fmt = (n: number) => `$${n.toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  let accountsSummary: string | undefined
  if (accounts?.length) {
    const total = accounts.reduce((s, a) => s + (Number(a.current_balance) || 0), 0)
    accountsSummary = `Total bank balance: ${fmt(total)} across ${accounts.length} accounts (${accounts.map(a => `${a.name}: ${fmt(Number(a.current_balance))}`).join(', ')})`
  }

  let monthlySpend: string | undefined
  if (txns) {
    const outflow = txns.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
    const inflow = txns.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0)
    monthlySpend = `This month: ${fmt(outflow)} spent, ${fmt(inflow)} income received`
  }

  let goalsSummary: string | undefined
  if (goals?.length) {
    goalsSummary = goals.map(g => {
      const pct = Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100)
      return `${g.name}: ${fmt(Number(g.current_amount))} of ${fmt(Number(g.target_amount))} (${pct}%)`
    }).join('; ')
  }

  let kiwiSaverSummary: string | undefined
  if (ks) {
    kiwiSaverSummary = `KiwiSaver: ${fmt(Number(ks.current_balance))} with ${ks.provider || 'unknown provider'} (${ks.fund_type} fund, ${ks.expected_return}% expected return, retiring at ${ks.retirement_age})`
  }

  return { accountsSummary, monthlySpend, goalsSummary, kiwiSaverSummary }
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]+?<\/li>)/g, '<ul style="margin:6px 0 6px 16px;padding:0">$1</ul>')
    .replace(/\n{2,}/g, '</p><p style="margin:6px 0">')
    .replace(/\n/g, '<br/>')
}

function Bubble({ msg }: { msg: Message }) {
  if (msg.role === 'user') return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: 10, fontSize: 12, lineHeight: 1.6, background: 'var(--primary)', color: '#fff' }}>
        {msg.content}
      </div>
    </div>
  )
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div style={{ maxWidth: '92%', padding: '10px 12px', borderRadius: 10, fontSize: 12, lineHeight: 1.7, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
        {msg.streaming && !msg.content
          ? <span style={{ opacity: 0.4 }}>▋</span>
          : <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) + (msg.streaming ? ' <span style="opacity:0.4">▋</span>' : '') }} />
        }
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function FennecAI() {
  const pathname = usePathname()
  const pageConfig = getPageConfig(pathname)

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState<FennecContext | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>(pageConfig.suggestions)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const contextLoadedRef = useRef<string>('')  // stores pathname when last loaded

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 80) }, [open])

  // Reset context when page changes
  useEffect(() => {
    if (contextLoadedRef.current !== pathname) {
      contextLoadedRef.current = ''
      setContext(null)
      setSuggestions(getPageConfig(pathname).suggestions)
      setMessages([])
    }
  }, [pathname])

  const loadContext = useCallback(async () => {
    if (contextLoadedRef.current === pathname || contextLoading) return
    setContextLoading(true)
    try {
      const token = await getToken()
      const cfg = getPageConfig(pathname)
      const [investing, finance] = await Promise.all([
        cfg.loadInvesting ? loadInvestingContext(token) : Promise.resolve({}),
        cfg.loadFinance ? loadFinanceContext() : Promise.resolve({}),
      ])
      const ctx: FennecContext = { pageHint: cfg.pageHint, ...investing, ...finance }
      setContext(ctx)
      contextLoadedRef.current = pathname

      // Build dynamic suggestions if we have portfolio data
      if (investing.portfolioSummary) {
        const tickers = (investing.portfolioSummary.match(/^(\w+)/gm) || []).slice(0, 2)
        const dynamic = tickers.length > 0
          ? [`What's the outlook for ${tickers[0]}?`, ...cfg.suggestions.slice(1)]
          : cfg.suggestions
        setSuggestions(dynamic.slice(0, 5))
      }
    } catch {}
    setContextLoading(false)
  }, [pathname, contextLoading])

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
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

  const hasContext = !!(context?.portfolioSummary || context?.accountsSummary || context?.kiwiSaverSummary)

  return (
    <>
      {/* Floating fox button — bottom right */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Ask Fennec AI"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9998,
          width: 52, height: 52, borderRadius: '50%',
          background: open ? 'var(--surface)' : 'var(--primary)',
          border: open ? '1px solid var(--border)' : 'none',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: open ? 'none' : '0 4px 20px rgba(0,0,0,0.25)',
          transition: 'all 0.2s',
          fontSize: open ? 18 : 24,
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
      >
        {open ? <span style={{ fontSize: 16, color: 'var(--text2)' }}>✕</span> : '🦊'}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 88, right: 24, zIndex: 9997,
          width: 400, maxHeight: 560,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 50px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface2)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🦊</span>
              <div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                  {pageConfig.label}
                </div>
                <div style={{ fontSize: 9.5, color: contextLoading ? 'var(--text2)' : hasContext ? 'var(--primary)' : 'var(--text3)' }}>
                  {contextLoading ? 'Loading your data…' : hasContext ? '● Live data loaded' : '● General knowledge'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {context && (
                <button onClick={() => { contextLoadedRef.current = ''; setContext(null); loadContext() }} title="Refresh" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)', lineHeight: 0 }}>
                  <IconRefresh size={13} />
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)', lineHeight: 0 }}>
                <IconX size={15} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ color: 'var(--text2)', fontSize: 11, margin: '0 0 6px', lineHeight: 1.6 }}>
                  {pageConfig.description}
                  {hasContext && <span style={{ color: 'var(--primary)' }}> Your data is loaded.</span>}
                </p>
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                      color: 'var(--text)', fontSize: 11.5, textAlign: 'left',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((msg, i) => <Bubble key={i} msg={msg} />)}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, background: 'var(--surface2)', flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
              placeholder={contextLoading ? 'Loading your data…' : 'Ask anything…'}
              disabled={loading}
              style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 12, outline: 'none' }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              style={{ background: 'var(--primary)', border: 'none', borderRadius: 8, width: 36, height: 36, cursor: loading || !input.trim() ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: loading || !input.trim() ? 0.4 : 1, flexShrink: 0, transition: 'opacity 0.15s' }}
            >
              <IconSend size={15} color="#fff" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
