'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase'
import { loadPrefs, topInterests } from '@/lib/newsPrefs'
import { LoadingSpinner, SkeletonCard } from '@/components/shared/LoadingSpinner'
import { IconBrain, IconSearch, IconPlus, IconClock, IconTrendingUp } from '@tabler/icons-react'
import { toast } from 'sonner'

interface Opp {
  ticker: string; name: string; market: string; sector: string
  market_cap_category: 'Small' | 'Mid' | 'Large'
  theme: string; why_under_radar: string; catalyst: string
  time_horizon: 'Short' | 'Medium' | 'Long'
  reason: string; risk_level: number
  upside_min_pct: number; upside_max_pct: number
}

const SECTORS = ['All', 'Technology', 'Healthcare', 'Energy', 'Financials', 'Consumer', 'Mining & Resources', 'Industrials', 'Real Estate', 'Biotech']
const MARKETS = ['US', 'ASX', 'NZX', 'Global']
const RISK_COLOR = (r: number) => r <= 3 ? 'var(--green)' : r <= 6 ? 'var(--amber)' : 'var(--red)'
const RISK_LABEL = (r: number) => r <= 3 ? 'Low' : r <= 6 ? 'Med' : 'High'
const CAP_COLOR = (c: string) => c === 'Small' ? 'var(--primary)' : c === 'Mid' ? 'var(--amber)' : 'var(--text2)'
const HORIZON_ICON = (h: string) => h === 'Short' ? '⚡' : h === 'Medium' ? '📈' : '🔭'

const DEV_USER_ID = '851a4abb-27f2-4c32-9fb3-28ef4c22af49'

export default function OpportunitiesPage() {
  const [opps, setOpps] = useState<Opp[]>([])
  const [loading, setLoading] = useState(false)
  const [riskLevel, setRiskLevel] = useState(7)
  const [sector, setSector] = useState('All')
  const [market, setMarket] = useState('US')
  const [holdings, setHoldings] = useState<string[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [limited, setLimited] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? DEV_USER_ID
      setUserId(uid)
      const [{ data: profile }, { data: h }] = await Promise.all([
        supabase.from('profiles').select('risk_level').eq('id', uid).single(),
        supabase.from('holdings').select('ticker').eq('user_id', uid),
      ])
      if (profile?.risk_level) setRiskLevel(profile.risk_level)
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
      const result = await api.getOpportunities(riskLevel, holdings, sector, market, newsContext, interests)
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
    const { error } = await supabase.from('watchlist').insert({ user_id: userId, ticker: t, market: o.market || market })
    if (error) return toast.error(error.message)
    toast.success(`${t} added to watchlist`)
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Hidden Gems</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Under-the-radar opportunities with specific catalysts — not your typical top-10 stocks</p>
        </div>
        <button onClick={generate} disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'var(--primary)', color: 'white', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? <LoadingSpinner size={16} /> : <IconSearch size={16} />} Find Hidden Gems
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6" style={{ padding: '16px 20px' }}>
        <div className="flex flex-wrap gap-6 items-center">
          {/* Market */}
          <div>
            <p style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Market</p>
            <div className="flex gap-2">
              {MARKETS.map(m => (
                <button key={m} onClick={() => setMarket(m)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer',
                    background: market === m ? 'var(--primary)' : 'var(--surface2)',
                    color: market === m ? 'white' : 'var(--text2)',
                    border: market === m ? 'none' : '1px solid var(--border)',
                  }}
                >{m}</button>
              ))}
            </div>
          </div>

          {/* Sector */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Sector</p>
            <div className="flex flex-wrap gap-2">
              {SECTORS.map(s => (
                <button key={s} onClick={() => setSector(s)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer',
                    background: sector === s ? 'var(--primary-light)' : 'var(--surface2)',
                    color: sector === s ? 'var(--primary)' : 'var(--text2)',
                    border: sector === s ? '1px solid var(--primary)' : '1px solid var(--border)',
                  }}
                >{s}</button>
              ))}
            </div>
          </div>

          {/* Risk */}
          <div>
            <p style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Risk Tolerance — <span style={{ color: RISK_COLOR(riskLevel) }}>{RISK_LABEL(riskLevel)} ({riskLevel}/10)</span>
            </p>
            <input type="range" min={1} max={10} value={riskLevel} onChange={e => setRiskLevel(Number(e.target.value))}
              style={{ width: 140, accentColor: 'var(--primary)' }} />
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : opps.length === 0 ? (
        <div className="card text-center py-16">
          <IconBrain size={40} style={{ color: 'var(--text2)', margin: '0 auto 12px' }} />
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 18, marginBottom: 8 }}>No gems surfaced yet</p>
          <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Set your filters above and click Find Hidden Gems</p>
          <button onClick={generate} style={{ background: 'var(--primary)', color: 'white', padding: '10px 24px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            Find Hidden Gems
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {opps.map((o, i) => (
            <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Top row */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20 }}>{o.ticker}</span>
                    {o.market && o.market !== 'US' && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>{o.market}</span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{o.name}</p>
                </div>
                <button onClick={() => addToWatchlist(o)} title="Add to Watchlist"
                  style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--primary-light)', border: '1px solid var(--primary)', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}
                >
                  <IconPlus size={12} /> Watch
                </button>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: `${RISK_COLOR(o.risk_level)}18`, color: RISK_COLOR(o.risk_level), fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>
                  {RISK_LABEL(o.risk_level)} Risk
                </span>
                {o.market_cap_category && (
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: 'var(--surface2)', color: CAP_COLOR(o.market_cap_category), fontFamily: 'Syne, sans-serif', fontWeight: 700, border: '1px solid var(--border)' }}>
                    {o.market_cap_category}-cap
                  </span>
                )}
                {o.sector && (
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, border: '1px solid var(--border)' }}>
                    {o.sector}
                  </span>
                )}
              </div>

              {/* Theme */}
              <div style={{ fontSize: 11, color: 'var(--primary)', fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {o.theme}
              </div>

              {/* Analysis */}
              <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.65, flexGrow: 1 }}>{o.reason}</p>

              {/* Why under radar */}
              {o.why_under_radar && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--primary-light)', border: '1px solid rgba(44,110,106,0.25)' }}>
                  <p style={{ fontSize: 11, color: 'var(--primary)', fontFamily: 'Syne, sans-serif', fontWeight: 700, marginBottom: 3 }}>WHY IT'S OVERLOOKED</p>
                  <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{o.why_under_radar}</p>
                </div>
              )}

              {/* Catalyst */}
              {o.catalyst && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <p style={{ fontSize: 11, color: 'var(--green)', fontFamily: 'Syne, sans-serif', fontWeight: 700, marginBottom: 3 }}>CATALYST</p>
                  <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{o.catalyst}</p>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between" style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                <div className="flex items-center gap-1" style={{ fontSize: 12, color: 'var(--text2)' }}>
                  <IconClock size={12} />
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>{o.time_horizon}-term</span>
                </div>
                <div className="flex items-center gap-1">
                  <IconTrendingUp size={12} style={{ color: 'var(--green)' }} />
                  <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--green)', fontSize: 13 }}>
                    +{o.upside_min_pct}% – +{o.upside_max_pct}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Premium teaser for free users */}
      {limited && opps.length > 0 && (
        <div style={{ marginTop: 24, padding: '20px 24px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(91,106,255,0.08))', border: '1px solid rgba(251,191,36,0.3)', textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>🔒</div>
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
            4 more hidden gems available
          </p>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 14 }}>
            Upgrade to Premium to see all 6 picks including the highest-conviction opportunities.
          </p>
          <a href="/settings" style={{ display: 'inline-block', padding: '9px 20px', borderRadius: 8, background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#1a1a1a', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
            ✦ Upgrade to Premium
          </a>
        </div>
      )}
    </div>
  )
}
