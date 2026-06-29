'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconCalendar, IconChartBar, IconFileText, IconTrendingUp, IconExternalLink } from '@tabler/icons-react'

type Tab = 'ipos' | 'earnings' | 'asx' | 'analyst'

const REC_COLOR: Record<string, string> = {
  STRONG_BUY: 'var(--green)', WATCH: 'var(--amber)', SKIP: 'var(--red)',
}

interface IPO {
  symbol?: string; name?: string; date?: string; price?: string
  shares?: string; exchange?: string; status?: string
}

function countdown(dateStr?: string) {
  if (!dateStr) return '—'
  const diff = new Date(dateStr).getTime() - Date.now()
  const days = Math.ceil(diff / 86400_000)
  if (days < 0) return 'Listed'
  if (days === 0) return 'Today'
  return `${days}d`
}

function daysUntilLabel(dateStr: string) {
  const d = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (d < 0) return 'Past'
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  return `${d}d`
}

function urgencyColor(dateStr: string) {
  const d = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (d <= 3) return 'var(--red)'
  if (d <= 7) return 'var(--amber)'
  return 'var(--text2)'
}

const TABS: { id: Tab; label: string; icon: typeof IconCalendar }[] = [
  { id: 'ipos', label: 'IPO Calendar', icon: IconCalendar },
  { id: 'earnings', label: 'Earnings Dates', icon: IconChartBar },
  { id: 'asx', label: 'ASX Filings', icon: IconFileText },
  { id: 'analyst', label: 'Analyst Ratings', icon: IconTrendingUp },
]

export default function EventsPage() {
  const [tab, setTab] = useState<Tab>('ipos')
  const [ipos, setIpos] = useState<IPO[]>([])
  const [earnings, setEarnings] = useState<any[]>([])
  const [asxAnnouncements, setAsxAnnouncements] = useState<any[]>([])
  const [analyst, setAnalyst] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<IPO | null>(null)
  const [analysis, setAnalysis] = useState<any>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    init()
  }, [])

  async function init() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const [ipoResult, holdingsResult, watchlistResult] = await Promise.allSettled([
      api.getIPOs(),
      user ? supabase.from('holdings').select('ticker').eq('user_id', user.id) : Promise.resolve({ data: [] }),
      user ? supabase.from('watchlist').select('ticker').eq('user_id', user.id) : Promise.resolve({ data: [] }),
    ])
    if (ipoResult.status === 'fulfilled') setIpos(Array.isArray(ipoResult.value) ? ipoResult.value : [])

    const holdings = holdingsResult.status === 'fulfilled' ? (holdingsResult.value as any)?.data || [] : []
    const watchlist = watchlistResult.status === 'fulfilled' ? (watchlistResult.value as any)?.data || [] : []
    const allTickers: string[] = [...new Set([...holdings, ...watchlist].map((x: any) => x.ticker).filter(Boolean))]
    const asxTickers = allTickers.filter(t => /\.(AX|ASX)$/i.test(t))

    if (allTickers.length) {
      const [earningsResult, analystResult, asxResult] = await Promise.allSettled([
        api.getEarningsCalendar(allTickers),
        api.getAnalystRecommendations(allTickers),
        asxTickers.length ? api.getASXAnnouncements(asxTickers) : Promise.resolve([]),
      ])
      if (earningsResult.status === 'fulfilled') setEarnings(earningsResult.value || [])
      if (analystResult.status === 'fulfilled') setAnalyst(analystResult.value || [])
      if (asxResult.status === 'fulfilled') setAsxAnnouncements(asxResult.value || [])
    }
    setLoading(false)
  }

  async function openAnalysis(ipo: IPO) {
    setSelected(ipo); setAnalysis(null); setAnalyzing(true)
    try {
      const { data } = await api.analyzeIPO(ipo)
      setAnalysis(data)
    } catch {}
    setAnalyzing(false)
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Events Calendar</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>Upcoming IPOs, earnings dates, ASX filings and analyst ratings</p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 20, border: tab === t.id ? 'none' : '1px solid var(--border)', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 600, background: tab === t.id ? 'var(--primary)' : 'var(--surface)', color: tab === t.id ? 'white' : 'var(--text2)', transition: 'all 0.15s' }}>
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <LoadingSpinner size={32} />
        </div>
      ) : (
        <>
          {/* IPOs tab */}
          {tab === 'ipos' && (
            ipos.length === 0 ? (
              <EmptyState icon={<IconCalendar size={40} />} title="No upcoming IPOs" sub="Check back later for new listings" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {ipos.map((ipo, i) => (
                  <div key={i} onClick={() => openAnalysis(ipo)} className="card" style={{ cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--primary)'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = ''}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div>
                        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16 }}>{ipo.symbol || ipo.name}</span>
                        {ipo.symbol && <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{ipo.name}</p>}
                      </div>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>{countdown(ipo.date)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      {ipo.date && <MetaField label="DATE" value={ipo.date} />}
                      {ipo.price && <MetaField label="PRICE" value={ipo.price} />}
                      {ipo.exchange && <MetaField label="EXCHANGE" value={ipo.exchange} />}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--primary)', marginTop: 12, fontFamily: 'Syne, sans-serif' }}>Click for AI analysis →</p>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Earnings tab */}
          {tab === 'earnings' && (
            earnings.length === 0 ? (
              <EmptyState icon={<IconChartBar size={40} />} title="No upcoming earnings" sub="Earnings dates appear here for stocks in your portfolio and watchlist" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {earnings.map((e, i) => {
                  const timeLabel = e.hour === 'bmo' ? 'Before open' : e.hour === 'amc' ? 'After close' : e.hour === 'dmh' ? 'During hours' : '—'
                  return (
                    <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
                      <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--primary-light)', border: '1px solid rgba(44,110,106,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 800, fontSize: 16, color: urgencyColor(e.date), lineHeight: 1 }}>{daysUntilLabel(e.date)}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15 }}>{e.symbol}</span>
                          <span style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--surface2)', padding: '2px 7px', borderRadius: 6 }}>Q{e.quarter} {e.year}</span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text2)' }}>{timeLabel} · {new Date(e.date).toLocaleDateString('en-NZ', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {e.epsEstimate != null && <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 700 }}>EPS est. <span style={{ color: 'var(--primary)' }}>${e.epsEstimate.toFixed(2)}</span></p>}
                        {e.revenueEstimate != null && <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Rev. ${(e.revenueEstimate / 1e6).toFixed(0)}M</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* ASX Filings tab */}
          {tab === 'asx' && (
            asxAnnouncements.length === 0 ? (
              <EmptyState icon={<IconFileText size={40} />} title="No ASX announcements" sub="Add ASX stocks (.AX) to your portfolio or watchlist to see company announcements here" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {asxAnnouncements.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                    onClick={e => !a.url && e.preventDefault()}
                  >
                    <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 20px', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--primary)'}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = ''}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 11, color: '#0EA5E9' }}>{a.symbol.replace(/\.(AX|ASX)$/i, '')}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, lineHeight: 1.4, marginBottom: 4 }}>{a.title}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {a.category && <span style={{ fontSize: 10, background: 'var(--surface2)', color: 'var(--text2)', padding: '2px 7px', borderRadius: 6, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>{a.category}</span>}
                          {a.sensitive && <span style={{ fontSize: 10, background: 'rgba(239,68,68,0.1)', color: 'var(--red)', padding: '2px 7px', borderRadius: 6, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>Price Sensitive</span>}
                          {a.date && <span style={{ fontSize: 11, color: 'var(--text2)' }}>{new Date(a.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                        </div>
                      </div>
                      <IconExternalLink size={14} style={{ color: 'var(--text2)', flexShrink: 0, marginTop: 2 }} />
                    </div>
                  </a>
                ))}
              </div>
            )
          )}

          {/* Analyst ratings tab */}
          {tab === 'analyst' && (
            analyst.length === 0 ? (
              <EmptyState icon={<IconTrendingUp size={40} />} title="No analyst data" sub="Analyst ratings appear here for US-listed stocks in your portfolio and watchlist" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {analyst.map((a, i) => (
                  <div key={i} className="card" style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16 }}>{a.symbol}</span>
                        {a.consensus && (
                          <span style={{
                            fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700,
                            padding: '3px 10px', borderRadius: 8,
                            background: a.consensus === 'BUY' ? 'rgba(34,197,94,0.12)' : a.consensus === 'SELL' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                            color: a.consensus === 'BUY' ? 'var(--green)' : a.consensus === 'SELL' ? 'var(--red)' : 'var(--amber)',
                          }}>{a.consensus}</span>
                        )}
                        {a.total > 0 && <span style={{ fontSize: 11, color: 'var(--text2)' }}>{a.total} analysts</span>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {a.targetMean && <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color: 'var(--primary)' }}>${a.targetMean.toFixed(2)}</p>}
                        {a.targetLow != null && a.targetHigh != null && (
                          <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>${a.targetLow.toFixed(0)} – ${a.targetHigh.toFixed(0)}</p>
                        )}
                      </div>
                    </div>
                    {a.total > 0 && (
                      <>
                        <div style={{ display: 'flex', gap: 2, height: 8, borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
                          <div style={{ flex: (a.strongBuy || 0) + (a.buy || 0), background: 'var(--green)', minWidth: 2 }} title={`Strong Buy + Buy: ${(a.strongBuy||0) + (a.buy||0)}`} />
                          <div style={{ flex: a.hold || 0, background: 'var(--amber)', minWidth: 2 }} title={`Hold: ${a.hold || 0}`} />
                          <div style={{ flex: (a.sell || 0) + (a.strongSell || 0), background: 'var(--red)', minWidth: 2 }} title={`Sell + Strong Sell: ${(a.sell||0) + (a.strongSell||0)}`} />
                        </div>
                        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text2)' }}>
                          <span style={{ color: 'var(--green)' }}>▲ Buy {(a.strongBuy || 0) + (a.buy || 0)}</span>
                          <span style={{ color: 'var(--amber)' }}>◆ Hold {a.hold || 0}</span>
                          <span style={{ color: 'var(--red)' }}>▼ Sell {(a.sell || 0) + (a.strongSell || 0)}</span>
                          {a.bullPct != null && <span style={{ marginLeft: 'auto' }}>{a.bullPct}% bullish</span>}
                        </div>
                      </>
                    )}
                    {a.lastUpdated && <p style={{ fontSize: 10, color: 'var(--text2)', marginTop: 6 }}>Updated {new Date(a.lastUpdated).toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' })}</p>}
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* IPO Analysis Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.symbol || selected.name} — IPO Analysis` : ''} wide>
        {analyzing ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}><LoadingSpinner size={32} /></div>
        ) : analysis ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ padding: '6px 16px', borderRadius: 8, background: `${REC_COLOR[analysis.recommendation] || 'var(--text2)'}20`, color: REC_COLOR[analysis.recommendation] || 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16 }}>
                {analysis.recommendation?.replace('_', ' ')}
              </div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 20, fontWeight: 700 }}>{analysis.score}/10</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { label: 'Business Model', value: analysis.business_model },
                { label: 'Valuation', value: analysis.valuation_analysis },
                { label: 'Action', value: analysis.action },
              ].map(s => s.value && (
                <div key={s.label}>
                  <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</p>
                  <p style={{ fontSize: 14, lineHeight: 1.7 }}>{s.value}</p>
                </div>
              ))}
              {analysis.risks && (
                <div>
                  <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Risks</p>
                  <ul style={{ listStyle: 'disc', paddingLeft: 20 }}>
                    {analysis.risks.map((r: string, i: number) => (
                      <li key={i} style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--red)', marginBottom: 2 }}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 12, fontFamily: 'DM Mono, monospace' }}>{value}</p>
    </div>
  )
}

function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ color: 'var(--text2)', display: 'flex', justifyContent: 'center', marginBottom: 12 }}>{icon}</div>
      <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 18, marginBottom: 8 }}>{title}</p>
      <p style={{ color: 'var(--text2)', fontSize: 14 }}>{sub}</p>
    </div>
  )
}
