'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { timeAgo } from '@/lib/utils'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconMail, IconToggleLeft, IconToggleRight } from '@tabler/icons-react'
import { WatchlistButton } from '@/components/shared/WatchlistButton'

const SOURCES = [
  { id: 'robinhood',    name: 'Robinhood Snacks',  color: '#00c805' },
  { id: 'motley-fool', name: 'Motley Fool',         color: '#8b1a1a' },
  { id: 'seeking-alpha',name: 'Seeking Alpha',      color: '#f5a623' },
  { id: 'marketwatch', name: 'MarketWatch',          color: '#1a1a2e' },
  { id: 'morning-brew',name: 'Morning Brew',         color: '#ffdd00' },
  { id: 'hatch',       name: 'Hatch Weekly',         color: '#ff6b35' },
  { id: 'asx',         name: 'ASX Market Update',    color: '#003087' },
  { id: 'sharesies',   name: 'Sharesies Weekly',     color: '#00b14f' },
  { id: 'interest-nz', name: 'Interest.co.nz',       color: '#cc0000' },
  { id: 'daily-upside',name: 'The Daily Upside',     color: '#0066cc' },
  { id: 'finimize',    name: 'Finimize',              color: '#7b2d8b' },
  { id: 'investopedia',name: 'Investopedia',          color: '#003153' },
  { id: 'hustle',      name: 'The Hustle',            color: '#ff4500' },
  { id: 'bloomberg',   name: 'Bloomberg Markets',     color: '#000000' },
  { id: 'axios',       name: 'Axios Markets',         color: '#ff5f57' },
  { id: 'cnbc',        name: 'CNBC Daily Open',       color: '#0099cc' },
  { id: 'barrons',     name: "Barron's Daily",        color: '#c8102e' },
  { id: 'nzx',         name: 'NZX Market Update',     color: '#004B87' },
  { id: 'commsec',     name: 'CommSec Daily',         color: '#FFCC00' },
  { id: 'moby',        name: 'Moby',                  color: '#6366f1' },
  { id: 'asr',         name: 'Australian Stock Report', color: '#003366' },
]

const CATEGORIES = ['All', 'Picks', 'Macro', 'Earnings']
const SENT_COLORS: Record<string, string> = { positive: 'var(--green)', negative: 'var(--red)', neutral: 'var(--amber)' }

export default function NewslettersPage() {
  const [digests, setDigests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('All')
  const [enabled, setEnabled] = useState(new Set(SOURCES.map(s => s.id)))
  const [holdings, setHoldings] = useState<string[]>([])
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const supabase = createClient()
  const DEV_USER_ID = '851a4abb-27f2-4c32-9fb3-28ef4c22af49'

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const uid = user?.id ?? DEV_USER_ID
    setUserId(uid)
    const [{ data: h }, { data: w }] = await Promise.all([
      supabase.from('holdings').select('ticker').eq('user_id', uid),
      supabase.from('watchlist').select('ticker').eq('user_id', uid),
    ])
    setHoldings(h?.map((x: any) => x.ticker) || [])
    setWatchlist(w?.map((x: any) => x.ticker) || [])
    const { data } = await supabase.from('newsletter_digests').select('*').order('received_at', { ascending: false }).limit(100)
    setDigests(data || [])
    setLoading(false)
  }

  function toggle(id: string) {
    setEnabled(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const filtered = digests.filter(d =>
    enabled.has(d.source_id) &&
    (category === 'All' || d.category?.toLowerCase() === category.toLowerCase())
  )

  return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 220px', gap: 20 }} className="grid-cols-1 xl:grid-cols-[1fr_220px]">
      {/* Main content */}
      <div>
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div style={{ marginBottom: 4 }}>
            <h1 style={{ fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Newsletters</h1>
            <p style={{ color: 'var(--text2)', fontSize: 13 }}>AI-summarised digests from 20+ finance newsletters</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                style={{ padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: category === c ? 'var(--primary)' : 'var(--surface2)', color: category === c ? 'white' : 'var(--text2)', border: category === c ? 'none' : '1px solid var(--border)', transition: 'all 0.15s' }}
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
            <p style={{ color: 'var(--text2)', fontSize: 14 }}>Newsletter digests are populated automatically. Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((d, i) => {
              const inPortfolio = d.tickers?.some((t: string) => holdings.includes(t))
              const inWatchlist = d.tickers?.some((t: string) => watchlist.includes(t))
              const sentColor = SENT_COLORS[d.sentiment] || 'var(--text2)'
              return (
                <div key={i} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Coloured top bar */}
                  <div style={{ height: 3, background: d.source_color || 'var(--accent)' }} />
                  <div style={{ padding: '14px 16px' }}>
                    {/* Meta row */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: d.source_color || 'var(--accent)' }}>{d.source_name}</span>
                      {d.category && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'var(--surface2)', color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase' }}>{d.category}</span>
                      )}
                      {d.sentiment && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: `${sentColor}18`, color: sentColor, fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'capitalize' }}>{d.sentiment}</span>
                      )}
                      {inPortfolio && <span title="In your portfolio" style={{ fontSize: 12 }}>★</span>}
                      {inWatchlist && <span title="In your watchlist" style={{ fontSize: 12 }}>👁</span>}
                      <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>{timeAgo(d.received_at)}</span>
                    </div>

                    {/* Headline + insight side by side on wider screens */}
                    <div className="flex gap-4 items-start" style={{ flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 220px' }}>
                        <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, lineHeight: 1.4, marginBottom: 0 }}>{d.headline}</p>
                      </div>
                      {d.insight && (
                        <div style={{ flex: '2 1 300px', borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
                          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>{d.insight}</p>
                        </div>
                      )}
                    </div>

                    {/* Tickers */}
                    {d.tickers?.length > 0 && (
                      <div className="flex gap-2 flex-wrap mt-3">
                        {d.tickers.map((t: string) => (
                          <div key={t} className="flex items-center gap-1">
                            <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: 700, color: holdings.includes(t) ? 'var(--green)' : 'var(--accent2)' }}>{t}</span>
                            <WatchlistButton
                              ticker={t} userId={userId}
                              inWatchlist={watchlist.includes(t)}
                              inPortfolio={holdings.includes(t)}
                              onAdded={tk => setWatchlist(prev => [...prev, tk])}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actionable tip — full width below everything */}
                    {d.actionable && (
                      <div style={{ marginTop: 10, padding: '7px 12px', background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 6, fontSize: 12, color: 'var(--primary)', opacity: 0.9 }}>
                        💡 {d.actionable}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Sources sidebar */}
      <div className="hidden xl:block self-start">
        <div className="card">
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, marginBottom: 14, fontSize: 14 }}>Sources</p>
          {SOURCES.map(s => (
            <div key={s.id} className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontFamily: 'Syne, sans-serif' }}>{s.name}</span>
              </div>
              <button onClick={() => toggle(s.id)} style={{ color: enabled.has(s.id) ? 'var(--primary)' : 'var(--text2)', flexShrink: 0 }}>
                {enabled.has(s.id) ? <IconToggleRight size={20} /> : <IconToggleLeft size={20} />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
