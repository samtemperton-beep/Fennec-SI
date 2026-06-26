'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase'
import { loadPrefs, topInterests } from '@/lib/newsPrefs'
import { LoadingSpinner, SkeletonCard } from '@/components/shared/LoadingSpinner'
import { IconBrain, IconRefresh, IconPlus } from '@tabler/icons-react'
import { toast } from 'sonner'

interface Opp {
  ticker: string; name: string; market: string; sector: string
  market_cap_category: 'Small' | 'Mid' | 'Large'
  theme: string; why_under_radar: string; catalyst: string
  time_horizon: 'Short' | 'Medium' | 'Long'
  reason: string; risk_level: number
  upside_min_pct: number; upside_max_pct: number
}

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

const SIGNAL_STYLE: Record<string, React.CSSProperties> = {
  BUY:   { background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' },
  HOLD:  { background: 'rgba(232,117,78,0.15)', color: 'var(--accent)', border: '1px solid rgba(232,117,78,0.3)' },
  WATCH: { background: 'rgba(148,163,184,0.12)', color: 'var(--text2)', border: '1px solid var(--border)' },
}

type FilterKey = 'All' | 'Momentum' | 'Value plays' | 'NZX' | 'ASX' | 'Small cap'
const FILTERS: FilterKey[] = ['All', 'Momentum', 'Value plays', 'NZX', 'ASX', 'Small cap']

function applyFilter(opps: Opp[], filter: FilterKey): Opp[] {
  if (filter === 'All') return opps
  if (filter === 'NZX') return opps.filter(o => o.market === 'NZX')
  if (filter === 'ASX') return opps.filter(o => o.market === 'ASX')
  if (filter === 'Small cap') return opps.filter(o => o.market_cap_category === 'Small')
  if (filter === 'Momentum') return opps.filter(o => o.theme?.toLowerCase().includes('momentum') || o.upside_min_pct >= 20)
  if (filter === 'Value plays') return opps.filter(o => o.theme?.toLowerCase().includes('value') || o.upside_min_pct >= 10)
  return opps
}

const DEV_USER_ID = '851a4abb-27f2-4c32-9fb3-28ef4c22af49'

export default function DiscoverPage() {
  const [opps, setOpps] = useState<Opp[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('All')
  const [riskLevel] = useState(7)
  const [holdings, setHoldings] = useState<string[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [limited, setLimited] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? DEV_USER_ID
      setUserId(uid)
      const { data: h } = await supabase.from('holdings').select('ticker').eq('user_id', uid)
      if (h) setHoldings(h.map((x: any) => x.ticker))
    })
  }, [])

  async function generate() {
    setLoading(true)
    try {
      let newsContext: string | undefined
      let interests: { topSectors: string[]; topTickers: string[] } | undefined
      try {
        if (userId) {
          const prefs = loadPrefs(userId)
          interests = topInterests(prefs)
          const newsData = await api.getNews(holdings.slice(0, 8))
          const headlines = (newsData?.news || [])
            .filter((n: any) => (n.relevance || 0) >= 50)
            .slice(0, 15)
            .map((n: any) => n.headline)
          if (headlines.length > 0) newsContext = headlines.join('\n')
        }
      } catch {}
      const result = await api.getOpportunities(riskLevel, holdings, 'All', 'US', newsContext, interests)
      setOpps(result.data || [])
      setLimited(result.limited === true)
    } catch (e: any) {
      toast.error(e.message)
    }
    setLoading(false)
  }

  async function addToWatchlist(o: Opp) {
    if (!userId) return
    const t = o.ticker.toUpperCase()
    const { data: existing } = await supabase.from('watchlist').select('id').eq('user_id', userId).eq('ticker', t)
    if (existing && existing.length > 0) return toast.error(`${t} is already in your watchlist`)
    const { error } = await supabase.from('watchlist').insert({ user_id: userId, ticker: t, market: o.market || 'US' })
    if (error) return toast.error(error.message)
    toast.success(`${t} added to watchlist`)
  }

  const visible = applyFilter(opps, filter)

  return (
    <div style={{ padding: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Discover</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Stocks flagged by AI as having strong momentum or undervalued potential</p>
        </div>
        <button onClick={generate} disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? <LoadingSpinner size={14} /> : <IconRefresh size={14} />} Refresh
        </button>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer',
              background: filter === f ? 'var(--primary)' : 'var(--surface)',
              color: filter === f ? 'white' : 'var(--text2)',
              border: filter === f ? 'none' : '1px solid var(--border)',
            }}
          >{f}</button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : opps.length === 0 ? (
        <div className="card text-center py-16">
          <IconBrain size={40} style={{ color: 'var(--text2)', margin: '0 auto 12px' }} />
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 18, marginBottom: 8 }}>No picks yet</p>
          <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Click Refresh to get AI-curated stock picks</p>
          <button onClick={generate} style={{ background: 'var(--primary)', color: 'white', padding: '10px 24px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Find opportunities
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="card text-center py-12">
          <p style={{ color: 'var(--text2)', fontSize: 14 }}>No picks match this filter — try a different category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((o, i) => {
            const signal = deriveSignal(o.upside_min_pct)
            const color = tickerColor(o.ticker)
            return (
              <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: Math.max(8, 13 - Math.max(0, o.ticker.length - 3)), color: 'white', letterSpacing: -0.5 }}>
                        {o.ticker.slice(0, 5)}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15 }}>{o.name || o.ticker}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
                        {o.market && o.market !== 'US' ? `${o.market} · ` : ''}{o.market_cap_category}-cap
                      </div>
                    </div>
                  </div>
                  <span style={{ ...SIGNAL_STYLE[signal], fontSize: 10, fontFamily: 'Syne, sans-serif', fontWeight: 700, padding: '4px 9px', borderRadius: 6 }}>
                    {signal}
                  </span>
                </div>

                {/* Description */}
                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.65, flexGrow: 1 }}>{o.reason}</p>

                {/* Metrics row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  {[
                    { label: 'Upside', value: `+${o.upside_min_pct}%`, color: 'var(--green)' },
                    { label: 'Risk', value: `${o.risk_level}/10`, color: o.risk_level <= 3 ? 'var(--green)' : o.risk_level <= 6 ? 'var(--amber)' : 'var(--red)' },
                    { label: 'Horizon', value: o.time_horizon, color: 'var(--text)' },
                  ].map(m => (
                    <div key={m.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{m.label}</p>
                      <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 13, color: m.color }}>{m.value}</p>
                    </div>
                  ))}
                </div>

                {/* Add to watchlist */}
                <button onClick={() => addToWatchlist(o)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8, background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }}
                >
                  <IconPlus size={14} /> Add to watchlist
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Premium teaser */}
      {limited && opps.length > 0 && (
        <div style={{ marginTop: 24, padding: '20px 24px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(44,110,106,0.08))', border: '1px solid rgba(251,191,36,0.3)', textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>🔒</div>
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>More picks available</p>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 14 }}>Upgrade to Premium to see all picks including the highest-conviction opportunities.</p>
          <a href="/settings" style={{ display: 'inline-block', padding: '9px 20px', borderRadius: 8, background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#1a1a1a', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
            ✦ Upgrade to Premium
          </a>
        </div>
      )}
    </div>
  )
}
