'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { WatchlistButton } from '@/components/shared/WatchlistButton'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { IconStar, IconRefresh } from '@tabler/icons-react'
import { toast } from 'sonner'

const MARKETS = ['All', 'US', 'ASX', 'NZX']
const TIMEFRAMES = ['3mo', '6mo', '12mo']
const DEV_USER_ID = '851a4abb-27f2-4c32-9fb3-28ef4c22af49'

interface Pick {
  rank: number; ticker: string; name: string; sector: string
  upside_pct: number; reason: string; risk_level: number
}

export default function Top10Page() {
  const [market, setMarket] = useState('US')
  const [timeframe, setTimeframe] = useState('12mo')
  const [picks, setPicks] = useState<Pick[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Pick | null>(null)
  const [deepDive, setDeepDive] = useState<any>(null)
  const [diving, setDiving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [portfolio, setPortfolio] = useState<string[]>([])
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? DEV_USER_ID
      setUserId(uid)
      const [{ data: h }, { data: w }] = await Promise.all([
        supabase.from('holdings').select('ticker').eq('user_id', uid),
        supabase.from('watchlist').select('ticker').eq('user_id', uid),
      ])
      setPortfolio(h?.map((x: any) => x.ticker) || [])
      setWatchlist(w?.map((x: any) => x.ticker) || [])
    })
  }, [])

  async function generate() {
    setLoading(true)
    try {
      const { data } = await api.getTop10(market === 'All' ? 'US' : market, timeframe)
      setPicks(data || [])
    } catch (e: any) {
      toast.error(e.message)
    }
    setLoading(false)
  }

  async function openDeepDive(p: Pick) {
    setSelected(p)
    setDeepDive(null)
    setDiving(true)
    try {
      const d = await api.deepDive(p.ticker, `Sector: ${p.sector}, Upside: ${p.upside_pct}%, ${p.reason}`)
      setDeepDive(d)
    } catch {}
    setDiving(false)
  }

  const portfolioSet = new Set(portfolio)
  const watchlistSet = new Set(watchlist)

  return (
    <div style={{ padding: 24 }}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>
          <IconStar size={22} style={{ display: 'inline', color: 'var(--amber)', marginRight: 8 }} />
          Daily Top 10 Picks
        </h1>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex gap-1">
          {MARKETS.map(m => (
            <button key={m} onClick={() => setMarket(m)}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', background: market === m ? 'var(--accent)' : 'var(--surface)', color: market === m ? 'white' : 'var(--text2)', border: market === m ? 'none' : '1px solid var(--border)' }}
            >{m}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {TIMEFRAMES.map(t => (
            <button key={t} onClick={() => setTimeframe(t)}
              style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', background: timeframe === t ? 'rgba(91,106,255,0.2)' : 'var(--surface)', color: timeframe === t ? 'var(--accent2)' : 'var(--text2)', border: '1px solid var(--border)' }}
            >{t}</button>
          ))}
        </div>
        <button onClick={generate} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg ml-auto"
          style={{ background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}
        >
          {loading ? <LoadingSpinner size={16} /> : <IconRefresh size={16} />}
          Generate Picks
        </button>
      </div>

      {picks.length === 0 && !loading && (
        <div className="card text-center py-16">
          <IconStar size={40} style={{ color: 'var(--text2)', margin: '0 auto 12px' }} />
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 18, marginBottom: 8 }}>Click Generate to get AI picks</p>
          <p style={{ color: 'var(--text2)' }}>AI curates top 10 stocks based on current market conditions</p>
        </div>
      )}

      {picks.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }} className="grid-cols-1 xl:grid-cols-[1fr_320px]">
          <div className="space-y-2">
            {picks.map((p, i) => (
              <div key={i} className="card cursor-pointer hover:border-accent transition-colors"
                style={{ display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color 0.2s' }}>
                {/* Rank */}
                <div onClick={() => openDeepDive(p)} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(91,106,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15, color: 'var(--accent2)', flexShrink: 0, cursor: 'pointer' }}>
                  #{p.rank}
                </div>
                {/* Content */}
                <div onClick={() => openDeepDive(p)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15 }}>{p.ticker}</span>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>{p.sector}</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.4 }}>{p.reason}</p>
                </div>
                {/* Upside + watchlist */}
                <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div onClick={() => openDeepDive(p)}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>+{p.upside_pct}%</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>upside</div>
                  </div>
                  <WatchlistButton
                    ticker={p.ticker} userId={userId}
                    inWatchlist={watchlistSet.has(p.ticker)}
                    inPortfolio={portfolioSet.has(p.ticker)}
                    onAdded={t => setWatchlist(prev => [...prev, t])}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="card hidden xl:block">
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 16, fontSize: 14 }}>Projected Returns</p>
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={picks} layout="vertical" margin={{ left: 0, right: 12 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text2)' }} tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="ticker" tick={{ fontSize: 11, fill: 'var(--text2)', fontFamily: 'DM Mono, monospace' }} axisLine={false} tickLine={false} width={45} />
                <Tooltip formatter={(v: any) => [`+${v}%`, 'Upside']} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'DM Mono, monospace', fontSize: 12 }} />
                <Bar dataKey="upside_pct" radius={[0, 4, 4, 0]}>
                  {picks.map((_, i) => <Cell key={i} fill={`hsl(${140 + i * 10}, 80%, 50%)`} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.ticker} — Deep Dive` : ''} wide>
        {selected && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 18 }}>{selected.ticker}</span>
                <span style={{ fontSize: 13, color: 'var(--text2)', marginLeft: 8 }}>{selected.name}</span>
              </div>
              <WatchlistButton
                ticker={selected.ticker} userId={userId} size="md"
                inWatchlist={watchlistSet.has(selected.ticker)}
                inPortfolio={portfolioSet.has(selected.ticker)}
                onAdded={t => setWatchlist(prev => [...prev, t])}
              />
            </div>
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
                {deepDive.what_to_watch && (
                  <div>
                    <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Watch for</p>
                    <ul style={{ listStyle: 'disc', paddingLeft: 20 }}>
                      {deepDive.what_to_watch.map((w: string, i: number) => (
                        <li key={i} style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 2 }}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  )
}
