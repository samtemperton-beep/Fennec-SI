// Portfolio performance vs a market benchmark. Pure functions, no React.
//
// The portfolio line is a time-weighted return built from the daily value
// snapshots Fennec records. Deposits and trades change the value without being
// performance, so each period's flow is estimated from the change in cost basis
// (buying adds to both value and cost; the flow is removed before the return is
// calculated). That makes it an ESTIMATE:
//  - a sale shifts the figure by the realised gain on what was sold
//  - cash and dividends are outside "holdings value", so this is price return,
//    which is also what the benchmark's price series is
//  - values are as of the provider's last refresh, so each snapshot is paired
//    with the benchmark price at that same moment

export interface SnapshotPoint {
  date: string // YYYY-MM-DD (NZ date of the provider's data)
  value: number // holdings value
  invested: number | null // cost basis
  refreshedAt: string | null // ISO time the provider's data is as of
}

export interface BenchBar {
  t: number // bar start, ms
  c: number // close
}

export interface PerfPoint {
  date: string
  at: number // ms the snapshot is as of
  portfolio: number // % change since the first point
  benchmark: number // % change since the first point
}

export interface Performance {
  points: PerfPoint[]
  portfolioReturn: number // %
  benchmarkReturn: number // %
  difference: number // percentage points, portfolio minus benchmark
  days: number // calendar days covered
  from: string
  to: string
  /** Largest single-period deposit/withdrawal as a share of the starting value; large flows make the estimate rougher. */
  largestFlowShare: number
  /** false if some periods had no cost basis, so their flows were assumed to be zero. */
  flowsKnown: boolean
}

/** One row per date. Multiple accounts on a date are added together. Rows in other currencies are dropped. */
export function aggregateSnapshots(rows: { snapshot_date: string; currency: string; value: number | string; invested: number | string | null; refreshed_at: string | null }[]): SnapshotPoint[] {
  if (rows.length === 0) return []
  const currency = rows[0].currency
  const byDate = new Map<string, { value: number; invested: number; complete: boolean; at: string | null }>()
  for (const r of rows.filter(x => x.currency === currency)) {
    const e = byDate.get(r.snapshot_date) ?? { value: 0, invested: 0, complete: true, at: null }
    e.value += Number(r.value)
    if (r.invested === null) e.complete = false
    else e.invested += Number(r.invested)
    if (r.refreshed_at && (!e.at || r.refreshed_at > e.at)) e.at = r.refreshed_at
    byDate.set(r.snapshot_date, e)
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, e]) => ({ date, value: Math.round(e.value * 100) / 100, invested: e.complete ? Math.round(e.invested * 100) / 100 : null, refreshedAt: e.at }))
}

const HOUR = 3600000
const DAY = 24 * HOUR
/** How long after a bar's start its close is known. Daily US bars close 6.5h after they open. */
export const BAR_CLOSE_MS: Record<string, number> = { '5d': 15 * 60000, '1mo': HOUR, '6mo': 6.5 * HOUR, '1y': 6.5 * HOUR, '5y': 4 * DAY + 6.5 * HOUR }

/** Which chart range to request so the benchmark covers a history of this age. */
export function chartRangeFor(ageDays: number): '5d' | '1mo' | '6mo' | '1y' | '5y' {
  if (ageDays <= 4) return '5d'
  if (ageDays <= 27) return '1mo'
  if (ageDays <= 165) return '6mo'
  if (ageDays <= 355) return '1y'
  return '5y'
}

/** The moment a snapshot's data is as of. Falls back to the end of its NZ day. */
export function snapshotTime(s: SnapshotPoint): number {
  if (s.refreshedAt) {
    const t = Date.parse(s.refreshedAt)
    if (Number.isFinite(t)) return t
  }
  return Date.parse(s.date + 'T11:00:00Z') // 00:00 the next day in NZ summer time
}

/** Close of the latest bar that had finished by time `t`, or null if the data doesn't reach back that far. */
export function priceAt(bars: BenchBar[], t: number, closeMs: number): number | null {
  let lo = 0, hi = bars.length - 1, found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (bars[mid].t + closeMs <= t) { found = mid; lo = mid + 1 } else hi = mid - 1
  }
  return found >= 0 ? bars[found].c : null
}

export function buildPerformance(snapshots: SnapshotPoint[], bars: BenchBar[], closeMs: number): Performance | null {
  const snaps = snapshots
    .filter(s => Number.isFinite(s.value) && s.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  const clean = bars.filter(b => Number.isFinite(b.t) && Number.isFinite(b.c) && b.c > 0).sort((a, b) => a.t - b.t)
  if (snaps.length < 2 || clean.length === 0) return null

  // Start at the first snapshot the benchmark data reaches back to.
  const priced = snaps.map(s => ({ s, at: snapshotTime(s), bench: priceAt(clean, snapshotTime(s), closeMs) }))
  const start = priced.findIndex(p => p.bench !== null)
  if (start < 0) return null
  const series = priced.slice(start).filter((p, i, a) => i === 0 || p.at > a[i - 1].at) // times must advance
  if (series.length < 2) return null

  let index = 100
  const bench0 = series[0].bench!
  let largestFlowShare = 0
  let flowsKnown = true
  const points: PerfPoint[] = [{ date: series[0].s.date, at: series[0].at, portfolio: 0, benchmark: 0 }]

  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].s, cur = series[i].s
    let flow = 0
    if (prev.invested !== null && cur.invested !== null) flow = cur.invested - prev.invested
    else flowsKnown = false
    // A flow that would leave nothing to grow is a sign the cost basis moved for another reason: ignore it.
    if (cur.value - flow <= 0) { flow = 0; flowsKnown = false }
    largestFlowShare = Math.max(largestFlowShare, Math.abs(flow) / prev.value)
    index *= (cur.value - flow) / prev.value
    points.push({ date: cur.date, at: series[i].at, portfolio: index - 100, benchmark: (series[i].bench! / bench0 - 1) * 100 })
  }

  const last = points[points.length - 1]
  return {
    points,
    portfolioReturn: last.portfolio,
    benchmarkReturn: last.benchmark,
    difference: last.portfolio - last.benchmark,
    days: Math.max(1, Math.round((last.at - points[0].at) / DAY)),
    from: points[0].date,
    to: last.date,
    largestFlowShare,
    flowsKnown,
  }
}
