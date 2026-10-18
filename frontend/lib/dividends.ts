// Dividend income estimate. Pure functions, no React, so it can be tested.
//
// It is an ESTIMATE built from what each holding actually paid over the last year,
// slot by slot, projected forward. Companies can cut, raise, suspend or add
// dividends at any time, and nothing here knows the future.

export interface DividendPayment {
  date: string // YYYY-MM-DD
  amount: number // per share, in the holding's currency
}

export type Frequency = 'monthly' | 'quarterly' | 'semi-annual' | 'annual'

export interface IncomeInput {
  ticker: string
  name?: string | null
  market?: string | null // 'US' | 'NZX' | 'ASX' ...
  shares: number
  /** Current value of the holding, in `currency`. */
  value: number
  /** Currency the dividends and value are in. */
  currency: string
  /** null = no data (unknown symbol or failed lookup); [] = confirmed not paying. */
  payments: DividendPayment[] | null
}

export interface ScheduledPayment {
  date: string // expected payment date
  amount: number // total for the holding, in the common currency, after any withholding
}

export interface HoldingIncome {
  ticker: string
  name: string
  frequency: Frequency
  paymentsPerYear: number
  annual: number // common currency, after any withholding
  yieldPct: number | null // annual / current value
  lastPaid: DividendPayment
  schedule: ScheduledPayment[] // expected payments over the next 12 months, by date
  next: ScheduledPayment
  confidence: 'high' | 'medium' | 'low'
  /** Latest regular payment vs the one a year earlier. null if there isn't one to compare. */
  trend: 'rising' | 'falling' | 'steady' | null
  hadSpecial: boolean
}

export interface IncomeEstimate {
  payers: HoldingIncome[] // biggest first
  nonPayers: string[] // confirmed no dividends in the data window
  lapsed: string[] // paid before but not recently, so assumed stopped
  noData: string[] // couldn't look up
  noRate: string[] // left out: no exchange rate to the common currency
  annual: number
  yieldPct: number | null // annual income / total value of everything with a rate
  next: (ScheduledPayment & { ticker: string }) | null
  /** Expected income by calendar month of a typical year, Jan..Dec. Sums to `annual`. */
  byMonth: number[]
}

export interface IncomeOptions {
  /** Multiplier from a holding's currency to the common currency, or null if unknown. */
  toCommon: (currency: string) => number | null
  /** Tax withheld at source on US dividends (0.15 for NZ residents who have filed a W-8BEN). Default 0. */
  usWithholding?: number
  now?: Date
}

const DAY = 86400000
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const ms = (d: string) => Date.parse(d + 'T00:00:00Z')
const addDays = (d: string, n: number) => iso(ms(d) + n * DAY)
const addYears = (d: string, n: number) => {
  const x = new Date(ms(d))
  x.setUTCFullYear(x.getUTCFullYear() + n)
  return iso(x.getTime())
}
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Splits out one-off special dividends: a payment well above BOTH neighbours that
 * is not part of a repeating pattern. A raise (0.01, 0.01, 0.25, 0.25) and an
 * alternating interim/final pattern (0.1, 0.25, 0.1, 0.25) are not specials.
 */
export function splitSpecials(sorted: DividendPayment[]): { regular: DividendPayment[]; specials: DividendPayment[] } {
  const regular: DividendPayment[] = []
  const specials: DividendPayment[] = []
  const n = sorted.length
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1], next = sorted[i + 1]
    const spike = !!prev && !!next && p.amount >= 1.8 * prev.amount && p.amount >= 1.8 * next.amount
    const twoBack = sorted[i - 2], twoFwd = sorted[i + 2]
    const repeats = (!!twoBack && twoBack.amount >= 0.6 * p.amount) || (!!twoFwd && twoFwd.amount >= 0.6 * p.amount)
    if (i > 0 && i < n - 1 && spike && !repeats) specials.push(p)
    else regular.push(p)
  })
  return { regular, specials }
}

export function inferFrequency(regular: DividendPayment[]): { frequency: Frequency; perYear: number } {
  if (regular.length < 2) return { frequency: 'annual', perYear: 1 }
  const recent = regular.slice(-7)
  const gaps = recent.slice(1).map((p, i) => (ms(p.date) - ms(recent[i].date)) / DAY)
  const g = median(gaps)
  if (g <= 45) return { frequency: 'monthly', perYear: 12 }
  if (g <= 135) return { frequency: 'quarterly', perYear: 4 }
  if (g <= 270) return { frequency: 'semi-annual', perYear: 2 }
  return { frequency: 'annual', perYear: 1 }
}

export function estimateIncome(inputs: IncomeInput[], opts: IncomeOptions): IncomeEstimate {
  const now = opts.now ?? new Date()
  const today = iso(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const withholding = Math.min(1, Math.max(0, opts.usWithholding ?? 0))

  const out: IncomeEstimate = { payers: [], nonPayers: [], lapsed: [], noData: [], noRate: [], annual: 0, yieldPct: null, next: null, byMonth: new Array(12).fill(0) }
  let totalValue = 0

  const rollForward = (d: string, step: (x: string) => string) => {
    let x = d
    for (let guard = 0; x <= today && guard < 60; guard++) x = step(x)
    return x
  }

  for (const h of inputs) {
    if (!(h.shares > 0) || !Number.isFinite(h.shares)) continue
    const rate = opts.toCommon(h.currency)
    if (rate == null || !Number.isFinite(rate) || rate <= 0) { out.noRate.push(h.ticker); continue }
    if (Number.isFinite(h.value) && h.value > 0) totalValue += h.value * rate

    if (h.payments == null) { out.noData.push(h.ticker); continue }
    const sorted = [...h.payments]
      .filter(p => Number.isFinite(p.amount) && p.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.date))
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((p, i, a) => i === 0 || p.date !== a[i - 1].date)
    if (sorted.length === 0) { out.nonPayers.push(h.ticker); continue }

    const { regular, specials } = splitSpecials(sorted)
    const { frequency, perYear } = inferFrequency(regular)
    const period = 365 / perYear
    const last = regular[regular.length - 1]

    // Stopped paying: well past when the next one was due.
    const sinceLast = (ms(today) - ms(last.date)) / DAY
    if (sinceLast > period * 1.6 + 20) { out.lapsed.push(h.ticker); continue }

    // Expected payments over the next 12 months.
    const n = regular.length
    const raw: { date: string; amount: number }[] = []
    if (n >= perYear) {
      // Same slots as the last year, a year on.
      for (const p of regular.slice(n - perYear)) raw.push({ date: rollForward(addYears(p.date, 1), x => addYears(x, 1)), amount: p.amount })
    } else {
      // Less than a year of history: repeat the average at the observed spacing.
      const mean = regular.reduce((s, p) => s + p.amount, 0) / n
      let d = last.date
      for (let k = 0; k < perYear; k++) {
        d = rollForward(addDays(d, Math.round(period)), x => addDays(x, Math.round(period)))
        raw.push({ date: d, amount: mean })
      }
    }

    const usTax = (h.market ?? 'US').toUpperCase() === 'US' ? 1 - withholding : 1
    const schedule: ScheduledPayment[] = raw
      .map(r => ({ date: r.date, amount: r.amount * h.shares * rate * usTax }))
      .sort((a, b) => a.date.localeCompare(b.date))
    const annual = schedule.reduce((s, p) => s + p.amount, 0)

    // Trend: latest regular payment vs the one a year earlier.
    let trend: HoldingIncome['trend'] = null
    if (n > perYear) {
      const ratio = last.amount / regular[n - 1 - perYear].amount
      trend = ratio >= 1.03 ? 'rising' : ratio <= 0.97 ? 'falling' : 'steady'
    }

    const confidence: HoldingIncome['confidence'] = n < 2 || n < perYear ? 'low' : n >= Math.max(perYear + 1, 4) ? 'high' : 'medium'
    const valueCommon = Number.isFinite(h.value) && h.value > 0 ? h.value * rate : 0

    out.payers.push({
      ticker: h.ticker,
      name: h.name || h.ticker,
      frequency,
      paymentsPerYear: perYear,
      annual,
      yieldPct: valueCommon > 0 ? (annual / valueCommon) * 100 : null,
      lastPaid: last,
      schedule,
      next: schedule[0],
      confidence,
      trend,
      hadSpecial: specials.length > 0,
    })
  }

  out.payers.sort((a, b) => b.annual - a.annual)
  out.annual = out.payers.reduce((s, p) => s + p.annual, 0)
  out.yieldPct = totalValue > 0 ? (out.annual / totalValue) * 100 : null

  for (const p of out.payers) {
    for (const s of p.schedule) out.byMonth[Number(s.date.slice(5, 7)) - 1] += s.amount
    if (!out.next || p.next.date < out.next.date) out.next = { ...p.next, ticker: p.ticker }
  }
  return out
}

/** Yahoo symbol for a holding: NZX and ASX tickers carry an exchange suffix. */
export function yahooSymbol(ticker: string, market?: string | null): string {
  const t = ticker.trim().toUpperCase()
  const m = (market || 'US').toUpperCase()
  if (m === 'NZX') return t.endsWith('.NZ') ? t : `${t}.NZ`
  if (m === 'ASX') return t.endsWith('.AX') ? t : `${t}.AX`
  return t
}
