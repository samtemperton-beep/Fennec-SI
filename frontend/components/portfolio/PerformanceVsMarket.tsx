'use client'
import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { IconChartLine } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { aggregateSnapshots, buildPerformance, chartRangeFor, BAR_CLOSE_MS, snapshotTime, type BenchBar, type Performance, type SnapshotPoint } from '@/lib/performance'

// Portfolio return vs a market index over the history Fennec has recorded.
// The maths is in lib/performance.ts (tested). It is an estimate: see the notes.

const BENCHMARKS = [
  { symbol: 'SPY', label: 'S&P 500' },
  { symbol: 'QQQ', label: 'Nasdaq 100' },
] as const
type Symbol = (typeof BENCHMARKS)[number]['symbol']

const RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: 'All', days: Infinity },
]

const pct = (n: number, d = 2) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}%`
const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
const DAY = 86400000

export function PerformanceCard({ perf, benchLabel }: { perf: Performance; benchLabel: string }) {
  const ahead = perf.difference >= 0
  const data = perf.points.map(p => ({ date: p.date, portfolio: Math.round(p.portfolio * 100) / 100, benchmark: Math.round(p.benchmark * 100) / 100 }))
  const stat = (label: string, value: string, color?: string) => (
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</p>
      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 18, fontWeight: 500, color }}>{value}</p>
    </div>
  )
  return (
    <>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 8 }}>
        {stat('Your portfolio', pct(perf.portfolioReturn), perf.portfolioReturn >= 0 ? 'var(--green)' : 'var(--red)')}
        {stat(benchLabel, pct(perf.benchmarkReturn), perf.benchmarkReturn >= 0 ? 'var(--green)' : 'var(--red)')}
        {stat(ahead ? 'Ahead by' : 'Behind by', `${Math.abs(perf.difference).toFixed(2)} pts`, ahead ? 'var(--green)' : 'var(--red)')}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
        {shortDate(perf.from)} to {shortDate(perf.to)} · {perf.days} day{perf.days !== 1 ? 's' : ''}
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: 'var(--text2)', fontFamily: 'DM Mono, monospace' }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis width={52} tick={{ fontSize: 11, fill: 'var(--text2)', fontFamily: 'DM Mono, monospace' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} domain={['auto', 'auto']} />
          <ReferenceLine y={0} stroke="var(--text3)" strokeOpacity={0.5} />
          <Tooltip
            labelFormatter={(d: any) => shortDate(String(d))}
            formatter={(v: any, name: any) => [pct(Number(v)), name]}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'DM Mono, monospace', fontSize: 12 }}
            labelStyle={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, color: 'var(--text)' }}
          />
          <Line type="monotone" dataKey="portfolio" name="Your portfolio" stroke="var(--primary)" strokeWidth={2.5} dot={data.length < 15} />
          <Line type="monotone" dataKey="benchmark" name={benchLabel} stroke="var(--text3)" strokeWidth={1.8} strokeDasharray="5 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
      {perf.days < 30 && (
        <p style={{ fontSize: 11, color: 'var(--amber)', lineHeight: 1.6, marginTop: 8 }}>
          Only {perf.days} day{perf.days !== 1 ? 's' : ''} of history so far. A short stretch says very little about how you&apos;re doing against the market; it gets more meaningful over months.
        </p>
      )}
      {(!perf.flowsKnown || perf.largestFlowShare > 0.25) && (
        <p style={{ fontSize: 11, color: 'var(--amber)', lineHeight: 1.6, marginTop: 6 }}>
          {perf.flowsKnown
            ? `A large deposit or withdrawal (${Math.round(perf.largestFlowShare * 100)}% of your portfolio at the time) is in this period, so the estimate is rougher than usual.`
            : "Some days had no cost basis from your broker, so deposits and trades on those days couldn't be separated from performance."}
        </p>
      )}
      <p style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.6, marginTop: 8 }}>
        An estimate. Your line removes the effect of money you add or take out, using changes in your cost basis, so a sale can nudge it by the profit on what was sold. Both lines are price changes only (dividends and cash aren&apos;t included), measured at the same moments, which are when your broker last refreshed its data.
      </p>
    </>
  )
}

export function PerformanceVsMarket({ refreshKey = 0 }: { refreshKey?: number }) {
  const supabase = createClient()
  const [snaps, setSnaps] = useState<SnapshotPoint[] | null>(null)
  const [connected, setConnected] = useState(false)
  const [bench, setBench] = useState<Symbol>('SPY')
  const [range, setRange] = useState('All')
  const [bars, setBars] = useState<{ symbol: Symbol; chart: string; bars: BenchBar[] } | null>(null)
  const [barsError, setBarsError] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [rows, status] = await Promise.all([
        supabase.from('balance_snapshots').select('snapshot_date, currency, value, invested, refreshed_at').eq('kind', 'broker').order('snapshot_date', { ascending: true }),
        supabase.from('akahu_sync_status').select('user_id').maybeSingle(),
      ])
      if (cancelled) return
      setSnaps(aggregateSnapshots((rows.data as any[]) ?? []))
      setConnected(!!status.data)
    })()
    return () => { cancelled = true }
  }, [refreshKey])

  const first = snaps && snaps.length ? snapshotTime(snaps[0]) : null
  const chart = first == null ? null : chartRangeFor(Math.max(0, (Date.now() - first) / DAY) + 1)

  useEffect(() => {
    if (!snaps || snaps.length < 2 || !chart) return
    let cancelled = false
    setBarsError(false)
    api.getChart(bench, chart)
      .then((raw: any[]) => {
        if (cancelled) return
        const b = (Array.isArray(raw) ? raw : []).map(x => ({ t: Number(x.t), c: Number(x.c) }))
        if (b.length === 0) throw new Error('no data')
        setBars({ symbol: bench, chart, bars: b })
      })
      .catch(() => { if (!cancelled) setBarsError(true) })
    return () => { cancelled = true }
  }, [snaps, bench, chart])

  const visibleSnaps = useMemo(() => {
    if (!snaps) return []
    const days = RANGES.find(r => r.label === range)?.days ?? Infinity
    if (!isFinite(days)) return snaps
    const cutoff = new Date(Date.now() - days * DAY).toISOString().slice(0, 10)
    return snaps.filter(s => s.date >= cutoff)
  }, [snaps, range])

  const perf = useMemo(() => {
    if (!bars || bars.symbol !== bench || !chart || bars.chart !== chart) return null
    return buildPerformance(visibleSnaps, bars.bars, BAR_CLOSE_MS[chart])
  }, [bars, bench, chart, visibleSnaps])

  if (snaps === null || (snaps.length === 0 && !connected)) return null

  const benchLabel = BENCHMARKS.find(b => b.symbol === bench)!.label
  const longHistory = !!snaps.length && Date.now() - snapshotTime(snaps[0]) > 35 * DAY

  const chips = (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {BENCHMARKS.map(b => (
        <button key={b.symbol} onClick={() => setBench(b.symbol)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: bench === b.symbol ? 'var(--primary-light)' : 'transparent', color: bench === b.symbol ? 'var(--primary)' : 'var(--text2)' }}>{b.label}</button>
      ))}
      {longHistory && RANGES.map(r => (
        <button key={r.label} onClick={() => setRange(r.label)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: range === r.label ? 'var(--primary-light)' : 'transparent', color: range === r.label ? 'var(--primary)' : 'var(--text2)' }}>{r.label}</button>
      ))}
    </div>
  )

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconChartLine size={17} style={{ color: 'var(--primary)' }} />
          <div>
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 15 }}>Performance vs the market</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Your return compared with the {benchLabel}, from your first recorded day</p>
          </div>
        </div>
        {chips}
      </div>

      {snaps.length < 2 ? (
        <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text3)', fontSize: 13, lineHeight: 1.6 }}>
          {snaps.length === 0
            ? 'No history yet. This compares you with the market from your first recorded day, so it needs a couple of days of data.'
            : `First day recorded: ${shortDate(snaps[0].date)}. The comparison appears once there's a second day to measure against.`}
        </div>
      ) : barsError ? (
        <p style={{ fontSize: 12, color: 'var(--text2)' }}>Market data couldn&apos;t be loaded just now, so the comparison is paused.</p>
      ) : !perf ? (
        <p style={{ fontSize: 12, color: 'var(--text3)' }}>{bars ? 'Not enough overlapping data to compare yet.' : 'Loading market data…'}</p>
      ) : (
        <PerformanceCard perf={perf} benchLabel={benchLabel} />
      )}
    </div>
  )
}
