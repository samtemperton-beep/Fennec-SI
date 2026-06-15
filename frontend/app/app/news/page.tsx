'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Modal } from '@/components/shared/Modal'
import { timeAgo } from '@/lib/utils'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { IconExternalLink } from '@tabler/icons-react'
import { toast } from 'sonner'

interface NewsItem {
  id: number; headline: string; summary?: string; source: string; url: string
  datetime: number; sentiment: 'positive' | 'negative' | 'neutral'; ticker?: string
}

const SENT_COLORS = { positive: 'var(--green)', negative: 'var(--red)', neutral: 'var(--amber)' }
const FILTERS = ['All', 'Positive', 'Negative']

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [selected, setSelected] = useState<NewsItem | null>(null)
  const [deepDive, setDeepDive] = useState<any>(null)
  const [diving, setDiving] = useState(false)
  const [digest, setDigest] = useState<any>(null)
  const [portfolio, setPortfolio] = useState<string[]>([])
  const supabase = createClient()

  useEffect(() => {
    init()
  }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    let tickers: string[] = []
    if (user) {
      const { data: h } = await supabase.from('holdings').select('ticker').eq('user_id', user.id)
      tickers = h?.map((x: any) => x.ticker) || []
      setPortfolio(tickers)
    }
    setLoading(true)
    try {
      const data = await api.getNews(tickers.slice(0, 5))
      setNews(data)
      if (data.length > 0) {
        const headlines = data.map((n: NewsItem) => n.headline)
        const d = await api.getNewsDigest(headlines, tickers)
        setDigest(d)
      }
    } catch (e: any) {
      toast.error(e.message)
    }
    setLoading(false)
  }

  async function openDeepDive(item: NewsItem) {
    setSelected(item)
    setDeepDive(null)
    setDiving(true)
    try {
      const d = await api.deepDive(item.ticker || 'market', `${item.headline}. ${item.summary || ''}`)
      setDeepDive(d)
    } catch {}
    setDiving(false)
  }

  const filtered = filter === 'All' ? news : news.filter(n => n.sentiment === filter.toLowerCase())
  const sentCounts = { positive: news.filter(n => n.sentiment === 'positive').length, negative: news.filter(n => n.sentiment === 'negative').length, neutral: news.filter(n => n.sentiment === 'neutral').length }
  const pieData = [
    { name: 'Positive', value: sentCounts.positive, color: 'var(--green)' },
    { name: 'Negative', value: sentCounts.negative, color: 'var(--red)' },
    { name: 'Neutral', value: sentCounts.neutral, color: 'var(--amber)' },
  ].filter(d => d.value > 0)

  return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }} className="grid-cols-1 xl:grid-cols-[1fr_280px]">
      <div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 20 }}>Market News</h1>

        <div className="flex gap-2 mb-4">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', background: filter === f ? 'var(--accent)' : 'var(--surface)', color: filter === f ? 'white' : 'var(--text2)', border: filter === f ? 'none' : '1px solid var(--border)' }}
            >{f}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><LoadingSpinner size={32} /></div>
        ) : (
          <div className="space-y-3">
            {filtered.map((n, i) => (
              <div key={i} className="card hover:border-accent transition-colors cursor-pointer" onClick={() => openDeepDive(n)} style={{ transition: 'border-color 0.2s' }}>
                <div className="flex items-start gap-3">
                  <div style={{ width: 3, flexShrink: 0, alignSelf: 'stretch', borderRadius: 2, background: SENT_COLORS[n.sentiment] }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, lineHeight: 1.4, marginBottom: 4 }}>{n.headline}</p>
                    {n.summary && <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 6 }}>{n.summary.slice(0, 150)}{n.summary.length > 150 ? '…' : ''}</p>}
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif' }}>{n.source}</span>
                      {n.ticker && <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--accent2)' }}>{n.ticker}</span>}
                      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: `${SENT_COLORS[n.sentiment]}18`, color: SENT_COLORS[n.sentiment], fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'capitalize' }}>{n.sentiment}</span>
                      <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>{timeAgo(n.datetime)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4 hidden xl:block">
        {pieData.length > 0 && (
          <div className="card">
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Sentiment</p>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={3}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: any, name: any) => [v, name]} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontFamily: 'DM Mono, monospace' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center gap-1">
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {digest && (
          <div className="card">
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 10, fontSize: 14 }}>AI Digest</p>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text2)', marginBottom: 10 }}>{digest.summary}</p>
            {digest.action && (
              <div style={{ padding: '8px 12px', background: 'rgba(91,106,255,0.1)', border: '1px solid rgba(91,106,255,0.2)', borderRadius: 8, fontSize: 12 }}>
                💡 {digest.action}
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="News Deep Dive" wide>
        {selected && (
          <div>
            <h4 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 12, lineHeight: 1.4 }}>{selected.headline}</h4>
            <a href={selected.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mb-6" style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'Syne, sans-serif' }}>
              <IconExternalLink size={13} /> View original article
            </a>
            {diving ? (
              <div className="flex justify-center py-8"><LoadingSpinner size={32} /></div>
            ) : deepDive ? (
              <div className="space-y-4">
                {[
                  { label: 'What happened', value: deepDive.what_happened },
                  { label: 'Why it matters', value: deepDive.why_it_matters },
                  { label: 'Portfolio impact', value: deepDive.portfolio_impact },
                  { label: 'Action suggestion', value: deepDive.action_suggestion },
                ].map(s => s.value && (
                  <div key={s.label}>
                    <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</p>
                    <p style={{ fontSize: 14, lineHeight: 1.7 }}>{s.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  )
}
