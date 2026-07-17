'use client'
import { useEffect, useState, useCallback } from 'react'
import { Modal } from './Modal'
import { LoadingSpinner } from './LoadingSpinner'
import { WatchlistButton } from './WatchlistButton'
import { api } from '@/lib/api'
import { IconTrendingUp, IconTrendingDown } from '@tabler/icons-react'

const RANGES = ['1d', '5d', '1m', '6m', '1y', '5y'] as const
type Range = typeof RANGES[number]

// Map frontend labels to backend keys
const RANGE_API: Record<Range, string> = {
  '1d': '1d', '5d': '5d', '1m': '1mo', '6m': '6mo', '1y': '1y', '5y': '5y',
}

interface Props {
  ticker: string | null
  name?: string
  userId: string | null
  inWatchlist?: boolean
  inPortfolio?: boolean
  onClose: () => void
  onWatchlistAdd?: (t: string) => void
}

const BUBBLE_COLORS = ['#5B7CF0','#14B8A6','#22C55E','#F59E0B','#EF4444','#A855F7','#F97316','#0EA5E9','#EC4899','#6366F1']
function tickerColor(t: string) {
  let h = 0
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0
  return BUBBLE_COLORS[h % BUBBLE_COLORS.length]
}

function fmtPrice(n: number) {
  return n >= 1000
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toFixed(2)
}

export function StockDetailModal({ ticker, name, userId, inWatchlist, inPortfolio, onClose, onWatchlistAdd }: Props) {
  const [quote, setQuote] = useState<any>(null)
  const [chartData, setChartData] = useState<{ t: number; c: number }[]>([])
  const [range, setRange] = useState<Range>('1y')
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [loadingChart, setLoadingChart] = useState(false)
  const [hovered, setHovered] = useState<{ t: number; c: number } | null>(null)
  const [watching, setWatching] = useState(inWatchlist ?? false)

  useEffect(() => { setWatching(inWatchlist ?? false) }, [inWatchlist])

  useEffect(() => {
    if (!ticker) return
    setLoadingQuote(true)
    setQuote(null)
    setChartData([])
    setHovered(null)
    api.getQuote(ticker)
      .then(q => setQuote(q))
      .catch(() => {})
      .finally(() => setLoadingQuote(false))
  }, [ticker])

  useEffect(() => {
    if (!ticker) return
    setLoadingChart(true)
    setChartData([])
    setHovered(null)
    api.getChart(ticker, RANGE_API[range])
      .then((d: any[]) => {
        // Backend returns [{t (ms), c, o, h, l, v}]
        const pts = (d || []).filter(p => p.c != null).map(p => ({ t: p.t, c: p.c }))
        setChartData(pts)
      })
      .catch(() => {})
      .finally(() => setLoadingChart(false))
  }, [ticker, range])

  const up = !quote ? true : (quote.changePct ?? 0) >= 0
  const trendColor = quote ? (up ? 'var(--green)' : 'var(--red)') : 'var(--text3)'

  const chartLineColor = chartData.length > 1
    ? (chartData[chartData.length - 1].c >= chartData[0].c ? '#22c55e' : '#ef4444')
    : '#22c55e'

  const chartEl = useCallback(() => {
    if (chartData.length < 2) return null
    const prices = chartData.map(p => p.c)
    const minP = Math.min(...prices)
    const maxP = Math.max(...prices)
    const W = 700, H = 180, PAD = 6
    const xScale = (i: number) => PAD + (i / (chartData.length - 1)) * (W - PAD * 2)
    const yScale = (v: number) => H - PAD - ((v - minP) / (maxP - minP || 1)) * (H - PAD * 2)
    const pts = chartData.map((p, i) => `${xScale(i)},${yScale(p.c)}`).join(' ')
    const fillId = `grad-${ticker}`
    const hovIdx = hovered ? chartData.findIndex(p => p.t === hovered.t) : -1

    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 180, display: 'block', cursor: 'crosshair' }}
        onMouseMove={e => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * W
          const idx = Math.round(((x - PAD) / (W - PAD * 2)) * (chartData.length - 1))
          const clamped = Math.max(0, Math.min(chartData.length - 1, idx))
          setHovered(chartData[clamped])
        }}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartLineColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={chartLineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`${PAD},${H} ${pts} ${xScale(chartData.length - 1)},${H}`}
          fill={`url(#${fillId})`}
        />
        <polyline points={pts} fill="none" stroke={chartLineColor} strokeWidth="2" strokeLinejoin="round" />
        {hovered && hovIdx >= 0 && (
          <>
            <line x1={xScale(hovIdx)} y1={PAD} x2={xScale(hovIdx)} y2={H - PAD}
              stroke="var(--border)" strokeWidth="1" strokeDasharray="3,3" />
            <circle cx={xScale(hovIdx)} cy={yScale(hovered.c)} r={4}
              fill={chartLineColor} stroke="var(--surface)" strokeWidth="2" />
          </>
        )}
      </svg>
    )
  }, [chartData, hovered, ticker, chartLineColor])

  const displayPrice = hovered?.c ?? quote?.price
  const displayDate = hovered
    ? new Date(hovered.t).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  if (!ticker) return null

  return (
    <Modal open={!!ticker} onClose={onClose} wide>
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: tickerColor(ticker),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: 'white', flexShrink: 0, letterSpacing: '-.01em',
          }}>
            {ticker.slice(0, 4)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>
              {quote?.name || name || ticker}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>
              {ticker}{quote?.exchange ? ` · ${quote.exchange}` : ''}{quote?.sector ? ` · ${quote.sector}` : ''}
            </div>
          </div>
          <WatchlistButton
            ticker={ticker} userId={userId} size="md"
            inWatchlist={watching} inPortfolio={inPortfolio ?? false}
            onAdded={t => { setWatching(true); onWatchlistAdd?.(t) }}
          />
        </div>

        {/* Price */}
        <div style={{ marginBottom: 20 }}>
          {loadingQuote ? (
            <LoadingSpinner size={24} />
          ) : quote ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 38, fontWeight: 700, lineHeight: 1 }}>
                  {quote.currency === 'USD' ? '$' : quote.currency + ' '}
                  {displayPrice != null ? fmtPrice(displayPrice) : '—'}
                </span>
                {!hovered ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 15, fontWeight: 700, color: trendColor }}>
                    {up ? <IconTrendingUp size={16} /> : <IconTrendingDown size={16} />}
                    {up ? '+' : ''}{(quote.changePct ?? 0).toFixed(2)}%
                    <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 400 }}>today</span>
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>{displayDate}</span>
                )}
              </div>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 24, marginTop: 14, flexWrap: 'wrap' }}>
                {[
                  { label: '52w High', value: quote.w52Hi ? `$${fmtPrice(quote.w52Hi)}` : '—' },
                  { label: '52w Low',  value: quote.w52Lo ? `$${fmtPrice(quote.w52Lo)}` : '—' },
                  { label: 'Mkt Cap',  value: quote.marketCap ? `$${(quote.marketCap / 1e9).toFixed(1)}B` : '—' },
                  { label: 'P/E',      value: quote.pe ? quote.pe.toFixed(1) : '—' },
                  { label: 'Div Yld',  value: quote.divYield ? `${quote.divYield.toFixed(2)}%` : '—' },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{s.label}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600 }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text2)', fontSize: 13 }}>Could not load price data for {ticker}.</p>
          )}
        </div>

        {/* Chart */}
        <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '14px 16px 10px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)}
                style={{
                  padding: '4px 11px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', border: 'none',
                  background: range === r ? 'var(--primary)' : 'transparent',
                  color: range === r ? 'white' : 'var(--text2)',
                  transition: 'all 0.15s',
                }}
              >{r}</button>
            ))}
          </div>

          {loadingChart ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LoadingSpinner size={28} />
            </div>
          ) : chartData.length > 1 ? (
            chartEl()
          ) : (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
              No chart data available for this range
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
