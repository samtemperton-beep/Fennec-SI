'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { WatchlistButton } from '@/components/shared/WatchlistButton'
import { IconRefresh, IconExternalLink } from '@tabler/icons-react'
import { timeAgo } from '@/lib/utils'
import { toast } from 'sonner'

const BUBBLE_COLORS = ['#5B7CF0','#14B8A6','#22C55E','#F59E0B','#EF4444','#A855F7','#F97316','#0EA5E9','#EC4899','#6366F1']
function tickerColor(t: string) {
  let h = 0
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0
  return BUBBLE_COLORS[h % BUBBLE_COLORS.length]
}

function deriveSignal(upside: number): 'BUY' | 'HOLD' | 'WATCH' {
  if (upside >= 15) return 'BUY'
  if (upside >= 5) return 'HOLD'
  return 'WATCH'
}

function riskLabel(r: number) {
  if (r <= 3) return 'Low'
  if (r <= 6) return 'Med'
  return 'High'
}
function riskColor(r: number) {
  if (r <= 3) return 'var(--green)'
  if (r <= 6) return 'var(--amber)'
  return 'var(--red)'
}

const SIGNAL_COLOR: Record<string, string> = {
  BUY: 'var(--green)',
  HOLD: 'var(--amber)',
  WATCH: 'var(--primary)',
}
const SIGNAL_BG: Record<string, string> = {
  BUY: 'var(--green-light)',
  HOLD: 'var(--amber-light)',
  WATCH: 'var(--primary-light)',
}

const DEV_USER_ID = '851a4abb-27f2-4c32-9fb3-28ef4c22af49'

interface Pick {
  rank: number; ticker: string; name: string; sector: string
  upside_pct: number; reason: string; risk_level: number; market?: string
  trending_score?: number
}

type ActiveFilter = 'All markets' | 'NZX' | 'ASX' | 'US' | 'Low risk' | 'High upside'
const TIMEFRAMES = ['3mo', '6mo', '12mo']

export default function Top10Page() {
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('All markets')
  const [timeframe, setTimeframe] = useState('12mo')
  const [picks, setPicks] = useState<Pick[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Pick | null>(null)
  const [deepDive, setDeepDive] = useState<any>(null)
  const [diveNews, setDiveNews] = useState<any[]>([])
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
      const marketForApi = (activeFilter === 'All markets' || activeFilter === 'Low risk' || activeFilter === 'High upside') ? 'US' : activeFilter
      const { data } = await api.getTop10(marketForApi, timeframe)
      setPicks(data || [])
    } catch (e: any) {
      toast.error(e.message)
    }
    setLoading(false)
  }

  async function openDeepDive(p: Pick) {
    setSelected(p)
    setDeepDive(null)
    setDiveNews([])
    setDiving(true)
    const [analysisResult, newsResult] = await Promise.allSettled([
      api.deepDive(p.ticker, `Sector: ${p.sector}, Upside: ${p.upside_pct}%, ${p.reason}`),
      api.getNews([p.ticker]),
    ])
    if (analysisResult.status === 'fulfilled') setDeepDive(analysisResult.value)
    if (newsResult.status === 'fulfilled') setDiveNews((newsResult.value || []).slice(0, 5))
    setDiving(false)
  }

  const portfolioSet = new Set(portfolio)
  const watchlistSet = new Set(watchlist)

  const visiblePicks = picks.filter(p => {
    if (activeFilter === 'Low risk') return p.risk_level <= 3
    if (activeFilter === 'High upside') return p.upside_pct >= 20
    return true
  })

  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' }) + ' NZT'

  const FILTERS: ActiveFilter[] = ['All markets', 'NZX', 'ASX', 'US', 'Low risk', 'High upside']

  return (
    <div style={{ padding: 28 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Today's Top 10 Picks</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>
          AI-curated across NZ, ASX &amp; US markets · Updated {timeStr}
        </p>
      </div>

      {/* Filters + generate */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setActiveFilter(f)}
              style={{
                padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: activeFilter === f ? 'var(--primary)' : 'var(--surface2)',
                color: activeFilter === f ? 'white' : 'var(--text2)',
                border: activeFilter === f ? 'none' : '1px solid var(--border)',
                transition: 'all 0.15s',
              }}
            >{f}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {TIMEFRAMES.map(t => (
            <button key={t} onClick={() => setTimeframe(t)}
              style={{
                padding: '7px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: timeframe === t ? 'var(--primary-light)' : 'var(--surface2)',
                color: timeframe === t ? 'var(--primary)' : 'var(--text2)',
                border: timeframe === t ? '1px solid var(--primary)' : '1px solid var(--border)',
              }}
            >{t}</button>
          ))}
        </div>
        <button onClick={generate} disabled={loading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10,
            background: 'var(--primary)', color: 'white', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? <LoadingSpinner size={15} /> : <IconRefresh size={15} />}
          Generate Picks
        </button>
      </div>

      {/* Empty state */}
      {picks.length === 0 && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: '64px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📈</div>
          <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Ready to find your next pick?</p>
          <p style={{ color: 'var(--text2)', marginBottom: 20 }}>AI curates the top 10 stocks based on current market conditions and your timeframe</p>
          <button onClick={generate} disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, background: 'var(--primary)', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer' }}
          >
            {loading ? <LoadingSpinner size={16} /> : <IconRefresh size={16} />}
            Generate Picks
          </button>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
          <LoadingSpinner size={36} />
        </div>
      )}

      {/* Cards grid */}
      {!loading && visiblePicks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
          {visiblePicks.map((p, i) => {
            const signal = deriveSignal(p.upside_pct)
            const barPct = Math.min(100, (p.upside_pct / 40) * 100)
            const barColor = SIGNAL_COLOR[signal]
            return (
              <div
                key={i}
                onClick={() => openDeepDive(p)}
                className="card"
                style={{ padding: 0, overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column', transition: 'box-shadow 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 24px rgba(44,110,106,.15)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--sh)'}
              >
                {/* Card body */}
                <div style={{ padding: '20px 20px 16px' }}>
                  {/* Header: bubble + name + badges */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 11, background: tickerColor(p.ticker),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800, color: 'white', flexShrink: 0, letterSpacing: '-.01em',
                    }}>
                      {p.ticker.slice(0, 4)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                          background: SIGNAL_BG[signal], color: SIGNAL_COLOR[signal],
                        }}>{signal}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>{p.ticker}</span>
                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text3)', display: 'inline-block' }} />
                        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{p.sector}</span>
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--primary)', lineHeight: 1 }}>+{p.upside_pct}%</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>upside</div>
                    </div>
                  </div>

                  {/* Trending badge */}
                  {p.trending_score != null && p.trending_score >= 7 && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8, padding: '3px 8px', borderRadius: 20, background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)' }}>
                      <span style={{ fontSize: 10 }}>🔥</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', letterSpacing: '.04em' }}>TRENDING</span>
                    </div>
                  )}

                  {/* Description */}
                  <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 16 }}>
                    {p.reason}
                  </p>

                  {/* Metric boxes */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 4 }}>
                    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Upside</p>
                      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 15, fontWeight: 600, color: 'var(--primary)' }}>+{p.upside_pct}%</p>
                    </div>
                    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Risk</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: riskColor(p.risk_level), display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: riskColor(p.risk_level), display: 'inline-block', flexShrink: 0 }} />
                        {riskLabel(p.risk_level)}
                      </p>
                    </div>
                    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Buzz</p>
                      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 15, fontWeight: 700, color: p.trending_score && p.trending_score >= 7 ? '#f59e0b' : 'var(--text)' }}>
                        {p.trending_score ?? '—'}<span style={{ fontSize: 10, color: 'var(--text3)' }}>/10</span>
                      </p>
                    </div>
                    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <p style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Rank</p>
                      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>#{p.rank}</p>
                    </div>
                  </div>
                </div>

                {/* Progress bar + watchlist row */}
                <div style={{ marginTop: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 16px 12px' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <WatchlistButton
                      ticker={p.ticker} userId={userId}
                      inWatchlist={watchlistSet.has(p.ticker)}
                      inPortfolio={portfolioSet.has(p.ticker)}
                      onAdded={t => setWatchlist(prev => [...prev, t])}
                    />
                  </div>
                  <div style={{ height: 4, background: 'var(--surface2)' }}>
                    <div style={{ height: '100%', width: `${barPct}%`, background: barColor, transition: 'width 0.8s ease' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Deep dive modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.ticker} — Deep Dive` : ''} wide>
        {selected && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 11, background: tickerColor(selected.ticker), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'white' }}>
                  {selected.ticker.slice(0, 4)}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 18 }}>{selected.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: SIGNAL_BG[deriveSignal(selected.upside_pct)], color: SIGNAL_COLOR[deriveSignal(selected.upside_pct)] }}>
                      {deriveSignal(selected.upside_pct)}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{selected.ticker} · {selected.sector}</span>
                </div>
              </div>
              <WatchlistButton
                ticker={selected.ticker} userId={userId} size="md"
                inWatchlist={watchlistSet.has(selected.ticker)}
                inPortfolio={portfolioSet.has(selected.ticker)}
                onAdded={t => setWatchlist(prev => [...prev, t])}
              />
            </div>
            {diving ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}><LoadingSpinner size={32} /></div>
            ) : deepDive ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: 'What happened', value: deepDive.what_happened },
                  { label: 'Why it matters', value: deepDive.why_it_matters },
                  { label: 'Portfolio impact', value: deepDive.portfolio_impact },
                  { label: 'Action suggestion', value: deepDive.action_suggestion },
                ].map(s => s.value && (
                  <div key={s.label}>
                    <p style={{ fontWeight: 600, fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</p>
                    <p style={{ fontSize: 14, lineHeight: 1.7 }}>{s.value}</p>
                  </div>
                ))}
                {deepDive.what_to_watch && (
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Watch for</p>
                    <ul style={{ listStyle: 'disc', paddingLeft: 20 }}>
                      {deepDive.what_to_watch.map((w: string, i: number) => (
                        <li key={i} style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 2 }}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {diveNews.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ fontWeight: 600, fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Related News</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {diveNews.map((n: any, i: number) => (
                        <a key={i} href={n.url} target="_blank" rel="noopener noreferrer"
                          style={{ textDecoration: 'none', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', transition: 'border-color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--primary)'}
                          onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.borderColor = ''}
                        >
                          <div style={{ flex: 1 }}>
                            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, color: 'var(--text)', lineHeight: 1.45, marginBottom: 4 }}>{n.headline}</p>
                            <p style={{ fontSize: 11, color: 'var(--text2)' }}>{n.source} · {timeAgo(n.datetime)}</p>
                          </div>
                          <IconExternalLink size={13} style={{ color: 'var(--text2)', flexShrink: 0, marginTop: 2 }} />
                        </a>
                      ))}
                    </div>
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
