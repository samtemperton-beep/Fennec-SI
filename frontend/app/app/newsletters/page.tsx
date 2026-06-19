'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { timeAgo } from '@/lib/utils'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconMail, IconToggleLeft, IconToggleRight } from '@tabler/icons-react'

const SOURCES = [
  { id: 'robinhood',    name: 'Robinhood Snacks',          color: '#00c805' },
  { id: 'motley-fool', name: 'Motley Fool',                color: '#8b1a1a' },
  { id: 'seeking-alpha',name: 'Seeking Alpha',             color: '#f5a623' },
  { id: 'marketwatch', name: 'MarketWatch Daily',          color: '#1a1a2e' },
  { id: 'morning-brew',name: 'Morning Brew',               color: '#ffdd00' },
  { id: 'hatch',       name: 'Hatch Weekly',               color: '#ff6b35' },
  { id: 'asx',         name: 'ASX Market Update',          color: '#003087' },
  { id: 'sharesies',   name: 'Sharesies Weekly',           color: '#00b14f' },
  { id: 'interest-nz', name: 'Interest.co.nz',             color: '#cc0000' },
  { id: 'daily-upside',name: 'The Daily Upside',           color: '#0066cc' },
  { id: 'finimize',    name: 'Finimize',                   color: '#7b2d8b' },
  { id: 'investopedia',name: 'Investopedia',               color: '#003153' },
]

const CATEGORIES = ['All', 'Picks', 'Macro', 'Earnings']

export default function NewslettersPage() {
  const [digests, setDigests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('All')
  const [enabled, setEnabled] = useState(new Set(SOURCES.map(s => s.id)))
  const [holdings, setHoldings] = useState<string[]>([])
  const [watchlist, setWatchlist] = useState<string[]>([])
  const supabase = createClient()

  useEffect(() => {
    init()
  }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const [{ data: h }, { data: w }] = await Promise.all([
        supabase.from('holdings').select('ticker').eq('user_id', user.id),
        supabase.from('watchlist').select('ticker').eq('user_id', user.id),
      ])
      setHoldings(h?.map((x: any) => x.ticker) || [])
      setWatchlist(w?.map((x: any) => x.ticker) || [])
    }

    const { data } = await supabase.from('newsletter_digests').select('*').order('received_at', { ascending: false }).limit(100)
    setDigests(data || [])
    setLoading(false)
  }

  function toggle(id: string) {
    setEnabled(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const filtered = digests.filter(d =>
    enabled.has(d.source_id) &&
    (category === 'All' || d.category?.toLowerCase() === category.toLowerCase())
  )

  return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }} className="grid-cols-1 xl:grid-cols-[220px_1fr]">
      {/* Sources panel */}
      <div className="card self-start hidden xl:block">
        <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, marginBottom: 14, fontSize: 14 }}>Sources</p>
        {SOURCES.map(s => (
          <div key={s.id} className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
              <span style={{ fontSize: 13, fontFamily: 'Syne, sans-serif' }}>{s.name}</span>
            </div>
            <button onClick={() => toggle(s.id)} style={{ color: enabled.has(s.id) ? 'var(--accent)' : 'var(--text2)' }}>
              {enabled.has(s.id) ? <IconToggleRight size={22} /> : <IconToggleLeft size={22} />}
            </button>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>
            <IconMail size={22} style={{ display: 'inline', color: 'var(--accent)', marginRight: 8 }} />
            Newsletters
          </h1>
          <div className="flex gap-2">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', background: category === c ? 'var(--accent)' : 'var(--surface)', color: category === c ? 'white' : 'var(--text2)', border: category === c ? 'none' : '1px solid var(--border)' }}
              >{c}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><LoadingSpinner size={32} /></div>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-16">
            <IconMail size={40} style={{ color: 'var(--text2)', margin: '0 auto 12px' }} />
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 18, marginBottom: 8 }}>No newsletters yet</p>
            <p style={{ color: 'var(--text2)', fontSize: 14 }}>Newsletter digests are populated automatically by a background job. Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((d, i) => {
              const inPortfolio = d.tickers?.some((t: string) => holdings.includes(t))
              const inWatchlist = d.tickers?.some((t: string) => watchlist.includes(t))
              return (
                <div key={i} className="card">
                  <div className="flex items-start gap-3 mb-2">
                    <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: d.source_color || 'var(--accent)', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 600, color: 'var(--text2)' }}>{d.source_name}</span>
                        {d.category && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'var(--surface2)', color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase' }}>{d.category}</span>}
                        {inPortfolio && <span title="In your portfolio">★</span>}
                        {inWatchlist && <span title="In your watchlist">👁</span>}
                        <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>{timeAgo(d.received_at)}</span>
                      </div>
                      <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, lineHeight: 1.4, marginBottom: 6 }}>{d.headline}</p>
                      {d.insight && <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 6 }}>{d.insight}</p>}
                      {d.actionable && (
                        <div style={{ padding: '6px 10px', background: 'rgba(91,106,255,0.1)', border: '1px solid rgba(91,106,255,0.2)', borderRadius: 6, fontSize: 12, marginTop: 6 }}>
                          💡 {d.actionable}
                        </div>
                      )}
                      {d.tickers?.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {d.tickers.map((t: string) => (
                            <span key={t} style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', padding: '2px 6px', background: 'var(--surface2)', borderRadius: 4, color: holdings.includes(t) ? 'var(--green)' : 'var(--text2)' }}>{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
