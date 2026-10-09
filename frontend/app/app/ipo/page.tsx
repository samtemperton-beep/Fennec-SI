'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useMemo } from 'react'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Modal } from '@/components/shared/Modal'
import {
  IconCalendar, IconChartBar, IconChevronLeft, IconChevronRight,
  IconBrain, IconBell,
} from '@tabler/icons-react'

// ── Top US stocks always shown on calendar ────────────────────────────────────

const TOP_US_TICKERS = [
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','JPM','V','UNH',
  'JNJ','WMT','MA','PG','HD','LLY','AVGO','COST','ABBV','BAC',
  'XOM','MRK','KO','PEP','NFLX',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date) { return d.toISOString().split('T')[0] }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function buildGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const startDow = (first.getDay() + 6) % 7
  const grid: (Date | null)[] = []
  for (let i = 0; i < startDow; i++) grid.push(null)
  for (let d = 1; d <= last.getDate(); d++) grid.push(new Date(year, month, d))
  while (grid.length % 7 !== 0) grid.push(null)
  return grid
}

function isASX(ticker: string) { return /\.(AX|ASX)$/i.test(ticker) }
function isNZX(ticker: string) { return /\.(NZ|NZX)$/i.test(ticker) }

const REC_STYLE: Record<string, { bg: string; color: string }> = {
  STRONG_BUY: { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
  WATCH:      { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
  SKIP:       { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444' },
}

// Badge style per event source
function badgeStyle(source: 'portfolio' | 'watchlist' | 'topus' | 'ipo') {
  switch (source) {
    case 'portfolio': return { bg: 'rgba(34,197,94,0.13)',  border: 'rgba(34,197,94,0.3)',   color: '#22c55e' }
    case 'watchlist': return { bg: 'rgba(91,124,240,0.13)', border: 'rgba(91,124,240,0.3)',  color: '#5b7cf0' }
    case 'topus':     return { bg: 'rgba(148,163,184,0.12)',border: 'rgba(148,163,184,0.25)',color: 'var(--text3)' }
    case 'ipo':       return { bg: 'rgba(245,158,11,0.13)', border: 'rgba(245,158,11,0.3)',  color: '#f59e0b' }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

type FilterKey = 'portfolio' | 'watchlist' | 'topus' | 'asx' | 'nzx'

export default function EventsPage() {
  // Data
  const [earnings, setEarnings] = useState<any[]>([])
  const [ipos, setIpos] = useState<any[]>([])
  const [portfolioTickers, setPortfolioTickers] = useState<Set<string>>(new Set())
  const [watchlistTickers, setWatchlistTickers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  // Calendar nav
  const today = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  // Toggles — all on by default
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    portfolio: true, watchlist: true, topus: true, asx: true, nzx: true,
  })

  // Selected day
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Deep dive modal
  const [diveEvent,  setDiveEvent]  = useState<any>(null)
  const [diveResult, setDiveResult] = useState<any>(null)
  const [diving,     setDiving]     = useState(false)

  // IPO AI analysis
  const [ipoAnalyses,  setIpoAnalyses]  = useState<Record<string, any>>({})
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

    // Always include top US + user tickers
    const allTickers = [...new Set([...holdings, ...watchlist, ...TOP_US_TICKERS])]
    try {
      const data = await api.getEarningsCalendar(allTickers)
      setEarnings(data || [])
    } catch {}
    setLoading(false)
  }

  // Classify each earning event
  function classify(ticker: string): 'portfolio' | 'watchlist' | 'topus' {
    if (portfolioTickers.has(ticker)) return 'portfolio'
    if (watchlistTickers.has(ticker)) return 'watchlist'
    return 'topus'
  }

  // Should an event be shown given current filters?
  function visible(ticker: string, source: 'portfolio' | 'watchlist' | 'topus'): boolean {
    if (!filters[source]) return false
    if (isASX(ticker) && !filters.asx) return false
    if (isNZX(ticker) && !filters.nzx) return false
    return true
  }

  function ipoVisible(ipo: any): boolean {
    return true // IPOs are always shown when calendar is in unified view
  }

  // Map events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, Array<{ type: 'earnings' | 'ipo'; data: any; source: 'portfolio' | 'watchlist' | 'topus' | 'ipo' }>> = {}

    for (const e of earnings) {
      const src = classify(e.symbol)
      if (!visible(e.symbol, src)) continue
      if (!map[e.date]) map[e.date] = []
      map[e.date].push({ type: 'earnings', data: e, source: src })
    }

    for (const ipo of ipos) {
      if (!ipo.date) continue
      if (!map[ipo.date]) map[ipo.date] = []
      map[ipo.date].push({ type: 'ipo', data: ipo, source: 'ipo' })
    }

    return map
  }, [earnings, ipos, portfolioTickers, watchlistTickers, filters])

  const grid = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) } else setViewMonth(m => m - 1)
    setSelectedDate(null)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) } else setViewMonth(m => m + 1)
    setSelectedDate(null)
  }
  function goToday() { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); setSelectedDate(null) }

  const todayStr = formatDate(today)
  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : []

  const upcoming = earnings
    .filter(e => { const src = classify(e.symbol); return e.date >= todayStr && visible(e.symbol, src) })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 12)

  async function openDive(event: any) {
    setDiveEvent(event)
    setDiveResult(null)
    setDiving(true)
    const isPast = event.date < todayStr
    const context = isPast
      ? `${event.symbol} just reported Q${event.quarter} ${event.year} earnings. EPS estimate was ${event.epsEstimate != null ? '$' + event.epsEstimate.toFixed(2) : 'unknown'}. Revenue estimate was ${event.revenueEstimate != null ? '$' + (event.revenueEstimate / 1e6).toFixed(0) + 'M' : 'unknown'}. Analyse whether the actual results are likely to have been positive or negative for the stock based on current price action and any news.`
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

  const FILTER_LABELS: { key: FilterKey; label: string; color: string; dot: string }[] = [
    { key: 'portfolio', label: 'Portfolio', color: '#22c55e', dot: '#22c55e' },
    { key: 'watchlist', label: 'Watchlist', color: '#5b7cf0', dot: '#5b7cf0' },
    { key: 'topus',     label: 'Top US',    color: 'var(--text2)', dot: '#94a3b8' },
    { key: 'asx',       label: 'ASX',       color: 'var(--text2)', dot: '#0ea5e9' },
    { key: 'nzx',       label: 'NZX',       color: 'var(--text2)', dot: '#a855f7' },
  ]

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Events Calendar</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>Earnings dates and upcoming IPOs for your portfolio, watchlist, and top US stocks</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><LoadingSpinner size={32} /></div>
      ) : (
        <>
          {/* ── Filter toggles ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {FILTER_LABELS.map(f => (
              <button key={f.key} onClick={() => setFilters(p => ({ ...p, [f.key]: !p[f.key] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20,
                  fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${filters[f.key] ? f.dot : 'var(--border)'}`,
                  background: filters[f.key] ? `${f.dot}18` : 'var(--surface)',
                  color: filters[f.key] ? f.dot : 'var(--text3)',
                  transition: 'all 0.15s',
                  opacity: filters[f.key] ? 1 : 0.6,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: filters[f.key] ? f.dot : 'var(--border)', flexShrink: 0 }} />
                {f.label}
              </button>
            ))}
            {/* IPO legend dot (always shown) */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)', fontFamily: 'Syne, sans-serif' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
              IPO
            </span>
            <button onClick={goToday} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: 'Syne, sans-serif', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>
              Today
            </button>
            <a href="/app/alerts" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--primary)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textDecoration: 'none' }}>
              <IconBell size={13} /> Alerts
            </a>
          </div>

          {/* ── Calendar card ── */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
            {/* Month nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 6, borderRadius: 6, display: 'flex' }}>
                <IconChevronLeft size={18} />
              </button>
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15 }}>{MONTHS[viewMonth]} {viewYear}</span>
              <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 6, borderRadius: 6, display: 'flex' }}>
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

            {/* Grid cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
              {grid.map((day, idx) => {
                if (!day) return (
                  <div key={idx} style={{ minHeight: 80, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }} />
                )
                const ds = formatDate(day)
                const isToday = ds === todayStr
                const isPast = ds < todayStr
                const events = eventsByDate[ds] || []
                const isSelected = ds === selectedDate
                const isWeekend = day.getDay() === 0 || day.getDay() === 6

                return (
                  <div key={idx}
                    onClick={() => events.length ? setSelectedDate(isSelected ? null : ds) : undefined}
                    style={{
                      minHeight: 80, padding: '6px 5px 4px',
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      cursor: events.length ? 'pointer' : 'default',
                      background: isSelected
                        ? 'rgba(91,124,240,0.1)'
                        : isToday
                        ? 'rgba(91,124,240,0.04)'
                        : isWeekend
                        ? 'var(--surface2)'
                        : 'transparent',
                      outline: isToday || isSelected ? '2px solid var(--primary)' : 'none',
                      outlineOffset: -2,
                      transition: 'background 0.1s',
                    }}
                  >
                    <div style={{
                      fontSize: 11, fontWeight: isToday ? 800 : 400, lineHeight: 1, marginBottom: 4,
                      color: isToday ? 'var(--primary)' : isPast ? 'var(--text3)' : 'var(--text)',
                    }}>
                      {day.getDate()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {events.slice(0, 3).map((ev, i) => {
                        const label = ev.type === 'ipo'
                          ? `IPO: ${ev.data.symbol || ev.data.name?.slice(0, 6) || 'IPO'}`
                          : ev.data.symbol
                        const s = badgeStyle(ev.source)
                        return (
                          <span key={i} title={ev.type === 'ipo'
                            ? `${ev.data.name || ev.data.symbol} IPO`
                            : `${ev.data.symbol} — Q${ev.data.quarter} ${ev.data.year}${ev.data.hour === 'bmo' ? ' (before open)' : ev.data.hour === 'amc' ? ' (after close)' : ''}`}
                            style={{
                              fontSize: 9, fontWeight: 700, fontFamily: 'Syne, sans-serif',
                              padding: '2px 4px', borderRadius: 4,
                              background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              maxWidth: '100%', display: 'block',
                            }}
                          >
                            {label}
                          </span>
                        )
                      })}
                      {events.length > 3 && (
                        <span style={{ fontSize: 9, color: 'var(--text3)', paddingLeft: 2 }}>+{events.length - 3} more</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Selected day panel ── */}
          {selectedDate && selectedEvents.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--text2)', marginBottom: 10 }}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedEvents.map((ev, i) => {
                  if (ev.type === 'ipo') {
                    const ipo = ev.data
                    const key = ipo.symbol || ipo.name || ''
                    const analysis = ipoAnalyses[key]
                    const isAnalyzing = analyzingIpo === key
                    return (
                      <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 10, color: '#f59e0b' }}>IPO</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15 }}>{ipo.name || ipo.symbol}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>IPO</span>
                            {ipo.symbol && <span style={{ fontSize: 11, color: 'var(--text2)' }}>{ipo.symbol}</span>}
                          </div>
                          <p style={{ fontSize: 12, color: 'var(--text2)' }}>{ipo.exchange || ''}{ipo.price ? ` · Price: ${ipo.price}` : ''}</p>
                        </div>
                        <button onClick={() => analyzeIpo(ipo)} disabled={isAnalyzing || !!analysis}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, background: analysis ? 'var(--surface2)' : 'var(--primary)', color: analysis ? 'var(--text2)' : 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, border: analysis ? '1px solid var(--border)' : 'none', cursor: analysis ? 'default' : 'pointer', flexShrink: 0 }}>
                          {isAnalyzing ? <LoadingSpinner size={12} /> : <IconBrain size={13} />}
                          {isAnalyzing ? 'Analysing…' : analysis ? 'Analysed ✓' : 'AI Analysis'}
                        </button>
                      </div>
                    )
                  }

                  // Earnings event
                  const e = ev.data
                  const isPast = e.date < todayStr
                  const timeLabel = e.hour === 'bmo' ? 'Before open' : e.hour === 'amc' ? 'After close' : e.hour === 'dmh' ? 'During hours' : '—'
                  const s = badgeStyle(ev.source)
                  const sourceLabel = ev.source === 'portfolio' ? 'Portfolio' : ev.source === 'watchlist' ? 'Watchlist' : 'Top US'
                  return (
                    <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 10, color: s.color }}>{e.symbol}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15 }}>{e.symbol}</span>
                          <span style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--surface2)', padding: '2px 7px', borderRadius: 6 }}>Q{e.quarter} {e.year}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{sourceLabel}</span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text2)' }}>{timeLabel}</p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 12 }}>
                        {e.epsEstimate != null && <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 700 }}>EPS est. <span style={{ color: e.epsEstimate >= 0 ? '#22c55e' : '#ef4444' }}>${e.epsEstimate.toFixed(2)}</span></p>}
                        {e.revenueEstimate != null && <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Rev. ${(e.revenueEstimate / 1e6).toFixed(0)}M</p>}
                      </div>
                      <button onClick={() => openDive(e)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, background: isPast ? 'var(--primary)' : 'var(--surface2)', color: isPast ? 'white' : 'var(--text)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, border: isPast ? 'none' : '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }}>
                        <IconBrain size={13} />
                        {isPast ? 'Results' : 'Preview'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Upcoming list ── */}
          {upcoming.length > 0 && (
            <div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, marginBottom: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                Upcoming earnings
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {upcoming.map((ev, i) => {
                  const src = classify(ev.symbol)
                  const s = badgeStyle(src)
                  const daysAway = Math.ceil((new Date(ev.date).getTime() - today.getTime()) / 86400000)
                  const timeLabel = ev.hour === 'bmo' ? 'BMO' : ev.hour === 'amc' ? 'AMC' : ''
                  return (
                    <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', cursor: 'pointer' }}
                      onClick={() => { setViewYear(new Date(ev.date).getFullYear()); setViewMonth(new Date(ev.date).getMonth()); setSelectedDate(ev.date) }}
                    >
                      <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 800, fontSize: 13, minWidth: 38, textAlign: 'center',
                        color: daysAway === 0 ? '#ef4444' : daysAway <= 3 ? '#ef4444' : daysAway <= 7 ? '#f59e0b' : 'var(--primary)' }}>
                        {daysAway === 0 ? 'Today' : daysAway === 1 ? 'Tmrw' : `${daysAway}d`}
                      </div>
                      <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, minWidth: 60 }}>{ev.symbol}</span>
                      <span style={{ fontSize: 11, color: 'var(--text2)', flex: 1 }}>
                        Q{ev.quarter} {ev.year}
                        {timeLabel ? ` · ${timeLabel}` : ''}
                        {' · '}{new Date(ev.date + 'T12:00:00').toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: s.bg, color: s.color, border: `1px solid ${s.border}`, flexShrink: 0 }}>
                        {src === 'portfolio' ? 'Portfolio' : src === 'watchlist' ? 'Watchlist' : 'Top US'}
                      </span>
                      {ev.epsEstimate != null && (
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: ev.epsEstimate >= 0 ? '#22c55e' : '#ef4444', flexShrink: 0 }}>
                          EPS ${ev.epsEstimate.toFixed(2)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Earnings deep dive modal ── */}
      <Modal open={!!diveEvent} onClose={() => { setDiveEvent(null); setDiveResult(null) }}
        title={diveEvent ? `${diveEvent.symbol} — Q${diveEvent.quarter} ${diveEvent.year} Earnings` : ''}
        wide
      >
        {diveEvent && (
          <div>
            <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
              {[
                { label: 'Date',         value: new Date(diveEvent.date + 'T12:00:00').toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) },
                { label: 'Timing',       value: diveEvent.hour === 'bmo' ? 'Before open' : diveEvent.hour === 'amc' ? 'After close' : '—' },
                { label: 'EPS Estimate', value: diveEvent.epsEstimate != null ? `$${diveEvent.epsEstimate.toFixed(2)}` : '—' },
                { label: 'Rev. Estimate',value: diveEvent.revenueEstimate != null ? `$${(diveEvent.revenueEstimate / 1e6).toFixed(0)}M` : '—' },
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
                <p style={{ color: 'var(--text2)', fontSize: 13 }}>Analysing earnings…</p>
              </div>
            ) : diveResult ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: diveEvent.date < todayStr ? 'What happened' : 'What to watch', value: diveResult.what_happened },
                  { label: 'Why it matters',  value: diveResult.why_it_matters },
                  { label: 'Portfolio impact', value: diveResult.portfolio_impact },
                  { label: 'Suggested action', value: diveResult.action_suggestion },
                ].map(s => s.value && (
                  <div key={s.label}>
                    <div style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{s.label}</div>
                    <p style={{ fontSize: 14, lineHeight: 1.7 }}>{s.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No analysis available — try again shortly.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
