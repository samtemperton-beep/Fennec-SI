'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useMemo } from 'react'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Modal } from '@/components/shared/Modal'
import {
  IconCalendar, IconChartBar, IconChevronLeft, IconChevronRight,
  IconBrain, IconExternalLink, IconBell,
} from '@tabler/icons-react'

type Tab = 'earnings' | 'ipos'

// ── Helpers ───────────────────────────────────────────────────────────────────

const BUBBLE_COLORS = ['#5B7CF0','#14B8A6','#22C55E','#F59E0B','#EF4444','#A855F7','#F97316','#0EA5E9','#EC4899','#6366F1']
function tickerColor(t: string) {
  let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0
  return BUBBLE_COLORS[h % BUBBLE_COLORS.length]
}

function formatDate(d: Date) {
  return d.toISOString().split('T')[0]
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

// Build a 6-row × 7-col calendar grid for a given year/month
function buildGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  // getDay(): 0=Sun, need Mon-first → remap
  const startDow = (first.getDay() + 6) % 7 // 0=Mon
  const grid: (Date | null)[] = []
  for (let i = 0; i < startDow; i++) grid.push(null)
  for (let d = 1; d <= last.getDate(); d++) grid.push(new Date(year, month, d))
  while (grid.length % 7 !== 0) grid.push(null)
  return grid
}

const REC_STYLE: Record<string, { bg: string; color: string }> = {
  STRONG_BUY: { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
  WATCH:      { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
  SKIP:       { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const [tab, setTab] = useState<Tab>('earnings')

  // Calendar data
  const [earnings, setEarnings] = useState<any[]>([])
  const [portfolioTickers, setPortfolioTickers] = useState<Set<string>>(new Set())
  const [watchlistTickers, setWatchlistTickers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  // Calendar navigation
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  // Selected day detail
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Deep dive
  const [diveEvent, setDiveEvent] = useState<any>(null)
  const [diveResult, setDiveResult] = useState<any>(null)
  const [diving, setDiving] = useState(false)

  // IPOs
  const [ipos, setIpos] = useState<any[]>([])
  const [ipoAnalyses, setIpoAnalyses] = useState<Record<string, any>>({})
  const [analyzingIpo, setAnalyzingIpo] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const [ipoRes, holdingsRes, watchlistRes] = await Promise.allSettled([
      api.getIPOs(),
      user ? supabase.from('holdings').select('ticker').eq('user_id', user.id) : Promise.resolve({ data: [] }),
      user ? supabase.from('watchlist').select('ticker').eq('user_id', user.id) : Promise.resolve({ data: [] }),
    ])

    if (ipoRes.status === 'fulfilled') setIpos(Array.isArray(ipoRes.value) ? ipoRes.value : [])

    const holdings: string[] = holdingsRes.status === 'fulfilled' ? ((holdingsRes.value as any)?.data || []).map((h: any) => h.ticker) : []
    const watchlist: string[] = watchlistRes.status === 'fulfilled' ? ((watchlistRes.value as any)?.data || []).map((w: any) => w.ticker) : []
    setPortfolioTickers(new Set(holdings))
    setWatchlistTickers(new Set(watchlist))

    const allTickers = [...new Set([...holdings, ...watchlist])]
    if (allTickers.length) {
      try {
        const data = await api.getEarningsCalendar(allTickers)
        setEarnings(data || [])
      } catch {}
    }
    setLoading(false)
  }

  // Map earnings by date string
  const earningsByDate = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const e of earnings) {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    }
    return map
  }, [earnings])

  const grid = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
    setSelectedDate(null)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
    setSelectedDate(null)
  }

  const todayStr = formatDate(today)
  const selectedEvents = selectedDate ? (earningsByDate[selectedDate] || []) : []

  // All upcoming earnings sorted (for list below calendar)
  const upcoming = earnings
    .filter(e => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10)

  async function openDive(event: any) {
    setDiveEvent(event)
    setDiveResult(null)
    setDiving(true)
    const isPast = event.date < todayStr
    const context = isPast
      ? `${event.symbol} just reported Q${event.quarter} ${event.year} earnings. EPS estimate was ${event.epsEstimate != null ? '$' + event.epsEstimate.toFixed(2) : 'unknown'}. Revenue estimate was ${event.revenueEstimate != null ? '$' + (event.revenueEstimate / 1e6).toFixed(0) + 'M' : 'unknown'}. Analyse whether the actual results are likely to have been positive or negative for the stock, based on current price action and any news.`
      : `${event.symbol} reports Q${event.quarter} ${event.year} earnings on ${event.date}. EPS estimate: ${event.epsEstimate != null ? '$' + event.epsEstimate.toFixed(2) : 'unknown'}. Revenue estimate: ${event.revenueEstimate != null ? '$' + (event.revenueEstimate / 1e6).toFixed(0) + 'M' : 'unknown'}. What should investors watch for?`
    try {
      const result = await api.deepDive(event.symbol, context)
      setDiveResult(result)
    } catch {}
    setDiving(false)
  }

  async function analyzeIpo(ipo: any) {
    const key = ipo.symbol || ipo.name || ''
    if (ipoAnalyses[key] || analyzingIpo === key) return
    setAnalyzingIpo(key)
    try {
      const { data } = await api.analyzeIPO(ipo)
      setIpoAnalyses(prev => ({ ...prev, [key]: data }))
    } catch {}
    setAnalyzingIpo(null)
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Events Calendar</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>Earnings dates for your portfolio and watchlist</p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, background: 'var(--surface)', borderRadius: 12, padding: 4, border: '1px solid var(--border)', width: 'fit-content' }}>
        {([
          { id: 'earnings' as Tab, label: 'Earnings Calendar', icon: IconChartBar },
          { id: 'ipos' as Tab,     label: 'IPO Calendar',      icon: IconCalendar },
        ]).map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 600, background: tab === t.id ? 'var(--primary)' : 'transparent', color: tab === t.id ? 'white' : 'var(--text2)', transition: 'all 0.15s' }}>
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><LoadingSpinner size={32} /></div>
      ) : (
        <>
          {/* ── Earnings calendar ── */}
          {tab === 'earnings' && (
            <div>
              {earnings.length === 0 ? (
                <EmptyState
                  icon={<IconChartBar size={40} />}
                  title="No earnings data"
                  sub="Add stocks to your portfolio or watchlist to see their earnings dates here"
                />
              ) : (
                <>
                  {/* Legend + notification hint */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text2)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                        Portfolio
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#5b7cf0', display: 'inline-block' }} />
                        Watchlist
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(91,124,240,0.2)', border: '1px solid var(--primary)', display: 'inline-block' }} />
                        Today
                      </span>
                    </div>
                    <a href="/app/alerts" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--primary)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textDecoration: 'none' }}>
                      <IconBell size={13} /> Set earnings alerts
                    </a>
                  </div>

                  {/* Calendar card */}
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {/* Month nav */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                      <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4, borderRadius: 6, display: 'flex' }}>
                        <IconChevronLeft size={18} />
                      </button>
                      <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15 }}>{MONTHS[viewMonth]} {viewYear}</span>
                      <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4, borderRadius: 6, display: 'flex' }}>
                        <IconChevronRight size={18} />
                      </button>
                    </div>

                    {/* Day-of-week headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--border)' }}>
                      {DOW.map(d => (
                        <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          {d}
                        </div>
                      ))}
                    </div>

                    {/* Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                      {grid.map((day, idx) => {
                        if (!day) return <div key={idx} style={{ minHeight: 72, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }} />
                        const ds = formatDate(day)
                        const isToday = ds === todayStr
                        const isPast = ds < todayStr
                        const events = earningsByDate[ds] || []
                        const isSelected = ds === selectedDate
                        return (
                          <div key={idx}
                            onClick={() => events.length ? setSelectedDate(isSelected ? null : ds) : undefined}
                            style={{
                              minHeight: 72, padding: '6px 6px 4px',
                              borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                              cursor: events.length ? 'pointer' : 'default',
                              background: isSelected ? 'rgba(91,124,240,0.08)' : isToday ? 'rgba(91,124,240,0.04)' : 'transparent',
                              outline: isToday ? '2px solid var(--primary)' : isSelected ? '2px solid var(--primary)' : 'none',
                              outlineOffset: -2,
                              transition: 'background 0.1s',
                              position: 'relative',
                            }}
                          >
                            <div style={{
                              fontSize: 12, fontWeight: isToday ? 800 : 500,
                              color: isToday ? 'var(--primary)' : isPast ? 'var(--text3)' : 'var(--text)',
                              marginBottom: 4, lineHeight: 1,
                            }}>
                              {day.getDate()}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                              {events.slice(0, 4).map((ev: any, i: number) => {
                                const inPortfolio = portfolioTickers.has(ev.symbol)
                                const dotColor = inPortfolio ? '#22c55e' : '#5b7cf0'
                                return (
                                  <span key={i} title={`${ev.symbol} — Q${ev.quarter} ${ev.year}${ev.hour === 'bmo' ? ' (before open)' : ev.hour === 'amc' ? ' (after close)' : ''}`} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9, fontWeight: 700,
                                    fontFamily: 'Syne, sans-serif', padding: '2px 5px', borderRadius: 5,
                                    background: inPortfolio ? 'rgba(34,197,94,0.12)' : 'rgba(91,124,240,0.12)',
                                    color: dotColor, border: `1px solid ${inPortfolio ? 'rgba(34,197,94,0.25)' : 'rgba(91,124,240,0.25)'}`,
                                    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {ev.symbol}
                                  </span>
                                )
                              })}
                              {events.length > 4 && <span style={{ fontSize: 9, color: 'var(--text3)', padding: '2px 3px' }}>+{events.length - 4}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Selected day panel */}
                  {selectedDate && selectedEvents.length > 0 && (
                    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--text2)' }}>
                        {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </div>
                      {selectedEvents.map((ev: any, i: number) => {
                        const inPortfolio = portfolioTickers.has(ev.symbol)
                        const isPast = ev.date < todayStr
                        const timeLabel = ev.hour === 'bmo' ? 'Before open' : ev.hour === 'amc' ? 'After close' : ev.hour === 'dmh' ? 'During hours' : '—'
                        return (
                          <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
                            <div style={{ width: 44, height: 44, borderRadius: 10, background: inPortfolio ? 'rgba(34,197,94,0.12)' : 'rgba(91,124,240,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 11, color: inPortfolio ? '#22c55e' : '#5b7cf0' }}>{ev.symbol}</span>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15 }}>{ev.symbol}</span>
                                <span style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--surface2)', padding: '2px 7px', borderRadius: 6 }}>Q{ev.quarter} {ev.year}</span>
                                <span style={{ fontSize: 11, color: inPortfolio ? '#22c55e' : '#5b7cf0', fontWeight: 600 }}>{inPortfolio ? 'Portfolio' : 'Watchlist'}</span>
                              </div>
                              <p style={{ fontSize: 12, color: 'var(--text2)' }}>{timeLabel}</p>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 12 }}>
                              {ev.epsEstimate != null && <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 700 }}>EPS est. <span style={{ color: ev.epsEstimate >= 0 ? '#22c55e' : '#ef4444' }}>${ev.epsEstimate.toFixed(2)}</span></p>}
                              {ev.revenueEstimate != null && <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Rev. ${(ev.revenueEstimate / 1e6).toFixed(0)}M</p>}
                            </div>
                            <button onClick={() => openDive(ev)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, background: isPast ? 'var(--primary)' : 'var(--surface2)', color: isPast ? 'white' : 'var(--text)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, border: isPast ? 'none' : '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }}
                            >
                              <IconBrain size={13} />
                              {isPast ? 'Results analysis' : 'Preview'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Upcoming earnings list */}
                  {upcoming.length > 0 && (
                    <div style={{ marginTop: 28 }}>
                      <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', fontSize: 11 }}>
                        Next up
                      </h2>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {upcoming.map((ev, i) => {
                          const inPortfolio = portfolioTickers.has(ev.symbol)
                          const daysAway = Math.ceil((new Date(ev.date).getTime() - today.getTime()) / 86400000)
                          const timeLabel = ev.hour === 'bmo' ? 'Before open' : ev.hour === 'amc' ? 'After close' : '—'
                          return (
                            <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', cursor: 'pointer' }}
                              onClick={() => { setViewYear(new Date(ev.date).getFullYear()); setViewMonth(new Date(ev.date).getMonth()); setSelectedDate(ev.date) }}
                            >
                              <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 800, fontSize: 14, color: daysAway <= 3 ? '#ef4444' : daysAway <= 7 ? '#f59e0b' : 'var(--primary)', minWidth: 36, textAlign: 'center' }}>
                                {daysAway === 0 ? 'Today' : daysAway === 1 ? 'Tmrw' : `${daysAway}d`}
                              </div>
                              <div style={{ flex: 1 }}>
                                <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, marginRight: 8 }}>{ev.symbol}</span>
                                <span style={{ fontSize: 11, color: 'var(--text2)' }}>Q{ev.quarter} {ev.year} · {timeLabel} · {new Date(ev.date + 'T12:00:00').toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 600, color: inPortfolio ? '#22c55e' : '#5b7cf0', flexShrink: 0 }}>{inPortfolio ? 'Portfolio' : 'Watchlist'}</span>
                              {ev.epsEstimate != null && (
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: ev.epsEstimate >= 0 ? '#22c55e' : '#ef4444', flexShrink: 0 }}>EPS ${ev.epsEstimate.toFixed(2)}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── IPO tab ── */}
          {tab === 'ipos' && (
            ipos.length === 0 ? (
              <EmptyState icon={<IconCalendar size={40} />} title="No upcoming IPOs" sub="Check back later for new listings" />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
                {ipos.map((ipo, i) => {
                  const key = ipo.symbol || ipo.name || ''
                  const ticker = ipo.symbol || (ipo.name || '').slice(0, 4).toUpperCase()
                  const color = tickerColor(ticker)
                  const analysis = ipoAnalyses[key]
                  const isAnalyzing = analyzingIpo === key
                  const rec = analysis?.recommendation
                  const recStyle = rec ? REC_STYLE[rec] : null
                  const diff = ipo.date ? Math.ceil((new Date(ipo.date).getTime() - Date.now()) / 86400000) : null
                  const cdLabel = diff === null ? '—' : diff < 0 ? 'Listed' : diff === 0 ? 'Today' : `${diff}d`
                  const cdColor = diff !== null && diff <= 0 ? 'var(--text3)' : diff !== null && diff <= 7 ? '#f59e0b' : 'var(--primary)'
                  return (
                    <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 10, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontWeight: 800, fontSize: Math.max(8, 13 - Math.max(0, ticker.length - 3)), color: 'white', letterSpacing: -0.5 }}>{ticker.slice(0, 5)}</span>
                          </div>
                          <div>
                            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15 }}>{ipo.name || ipo.symbol}</div>
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>{ipo.exchange || 'IPO'}{ipo.symbol ? ` · ${ipo.symbol}` : ''}</div>
                          </div>
                        </div>
                        {recStyle ? (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 6, background: recStyle.bg, color: recStyle.color, border: `1px solid ${recStyle.color}33` }}>
                            {rec.replace('_', ' ')} · {analysis.score}/10
                          </span>
                        ) : (
                          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 700, color: cdColor, background: 'var(--surface2)', padding: '4px 9px', borderRadius: 6, border: '1px solid var(--border)' }}>
                            {cdLabel}
                          </span>
                        )}
                      </div>
                      {analysis?.business_model && (
                        <p style={{ fontSize: 13, lineHeight: 1.65 }}>{analysis.business_model.slice(0, 180)}{analysis.business_model.length > 180 ? '…' : ''}</p>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                        {[
                          { label: 'Date', value: ipo.date || '—' },
                          { label: 'Price', value: ipo.price || '—' },
                          { label: 'Exchange', value: (ipo.exchange || '—').replace('NASDAQ Global Select', 'NASDAQ').replace('New York Stock Exchange', 'NYSE') },
                        ].map(m => (
                          <div key={m.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--border)' }}>
                            <p style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{m.label}</p>
                            <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 12 }}>{m.value}</p>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{ipo.status === 'priced' ? 'Priced' : 'Expected listing'}</span>
                        <button onClick={() => analyzeIpo(ipo)} disabled={isAnalyzing || !!analysis}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, background: analysis ? 'var(--surface2)' : 'var(--primary)', color: analysis ? 'var(--text2)' : 'white', fontWeight: 600, fontSize: 12, border: analysis ? '1px solid var(--border)' : 'none', cursor: analysis ? 'default' : 'pointer' }}>
                          {isAnalyzing ? <LoadingSpinner size={12} /> : <IconBrain size={13} />}
                          {isAnalyzing ? 'Analysing…' : analysis ? 'Analysed ✓' : 'AI Analysis'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </>
      )}

      {/* ── Deep dive modal ── */}
      <Modal open={!!diveEvent} onClose={() => { setDiveEvent(null); setDiveResult(null) }}
        title={diveEvent ? `${diveEvent.symbol} — Q${diveEvent.quarter} ${diveEvent.year} Earnings` : ''}
        wide
      >
        {diveEvent && (
          <div>
            {/* Header row */}
            <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
              {[
                { label: 'Date', value: new Date(diveEvent.date + 'T12:00:00').toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) },
                { label: 'Timing', value: diveEvent.hour === 'bmo' ? 'Before open' : diveEvent.hour === 'amc' ? 'After close' : '—' },
                { label: 'EPS Estimate', value: diveEvent.epsEstimate != null ? `$${diveEvent.epsEstimate.toFixed(2)}` : '—' },
                { label: 'Rev. Estimate', value: diveEvent.revenueEstimate != null ? `$${(diveEvent.revenueEstimate / 1e6).toFixed(0)}M` : '—' },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{f.label}</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 700 }}>{f.value}</div>
                </div>
              ))}
            </div>

            {diving ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0' }}>
                <LoadingSpinner size={28} />
                <p style={{ color: 'var(--text2)', fontSize: 13 }}>Analysing earnings results…</p>
              </div>
            ) : diveResult ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: diveEvent.date < todayStr ? "What happened" : "What to watch", value: diveResult.what_happened },
                  { label: 'Why it matters', value: diveResult.why_it_matters },
                  { label: 'Portfolio impact', value: diveResult.portfolio_impact },
                  { label: 'Suggested action', value: diveResult.action_suggestion },
                ].map(s => s.value && (
                  <div key={s.label}>
                    <div style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{s.label}</div>
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>{s.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <p style={{ color: 'var(--text2)', fontSize: 13 }}>No analysis available — try again shortly.</p>
              </div>
            )}
          </div>
        )}
      </Modal>
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
