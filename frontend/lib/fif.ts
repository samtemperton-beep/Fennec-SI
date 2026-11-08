// NZ foreign investment fund (FIF) awareness: how close the cost of overseas
// shares is to the de minimis threshold, and a rough idea of what the "fair
// dividend rate" method would cost if the FIF rules applied. Pure functions.
//
// Rules, from Inland Revenue:
//  - Individuals whose overseas shares cost less than NZ$50,000 in total
//    don't have to apply the FIF rules (the "de minimis" exemption).
//  - Budget 2026 PROPOSES lifting that to NZ$100,000 from 1 April 2026 (the 2026-27
//    tax year). IRD's information sheet of 28 May 2026 describes it as a proposal
//    that may change in Parliament, so both limits are shown and neither is
//    asserted as law here.
//  - Over the threshold, the usual method (FDR) taxes 5% of the market value at
//    the START of the tax year (1 April) at the person's marginal rate.
//  - Cost means the NZD price paid at purchase. We only know the USD (or other)
//    cost, so the NZD figure uses today's exchange rate and is approximate.
//  - Some Australian-listed companies are exempt, but that depends on conditions
//    we can't check, so ASX holdings are kept out of the total and shown separately.
//    NZX-listed shares are not foreign.
//  https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-income/foreign-investment-funds-fifs

export const FIF_LIMIT_CURRENT = 50_000
export const FIF_LIMIT_PROPOSED = 100_000
export const FDR_RATE = 0.05

/** NZ resident individual marginal rates, for the rough FDR estimate. */
export const MARGINAL_RATES = [0.105, 0.175, 0.30, 0.33, 0.39]

export interface FifInput {
  ticker: string
  name?: string | null
  market?: string | null // 'US' | 'NZX' | 'ASX' | ...
  shares: number
  buyPrice: number // per share, in `currency`
  currentPrice: number
  currency: string
}

export interface FifPosition {
  ticker: string
  name: string
  costNzd: number
  valueNzd: number
}

export interface LimitStatus {
  limit: number
  /** Cost as a fraction of the limit (can exceed 1). */
  used: number
  /** NZD left before reaching the limit (0 if at or over). */
  headroom: number
  over: boolean
  level: 'well-under' | 'getting-close' | 'close' | 'over'
}

export interface FifSummary {
  costNzd: number // approximate NZD cost of the holdings that count
  valueNzd: number // current market value of those holdings
  positions: FifPosition[] // biggest cost first
  /** ASX holdings: exempt only if they meet conditions we can't check. Not in the totals. */
  asx: { positions: FifPosition[]; costNzd: number }
  /** Domestic NZX holdings, which aren't foreign. */
  nzx: string[]
  /** Skipped for lack of an exchange rate. */
  noRate: string[]
  current: LimitStatus
  proposed: LimitStatus
  /** Cost including every ASX holding: the worst case if none of them turn out to be exempt. */
  costWithAsxNzd: number
}

export interface FdrEstimate {
  incomeNzd: number // 5% of the value
  taxNzd: number // at the chosen marginal rate
}

function status(cost: number, limit: number): LimitStatus {
  const used = limit > 0 ? cost / limit : 0
  const over = cost >= limit
  return {
    limit,
    used,
    headroom: Math.max(0, limit - cost),
    over,
    level: over ? 'over' : used >= 0.9 ? 'close' : used >= 0.7 ? 'getting-close' : 'well-under',
  }
}

/** `toNzd(currency)` = NZD per 1 unit of that currency, or null if unknown. */
export function summariseFif(inputs: FifInput[], toNzd: (currency: string) => number | null): FifSummary {
  const counted: FifPosition[] = []
  const asx: FifPosition[] = []
  const nzx: string[] = []
  const noRate: string[] = []

  for (const h of inputs) {
    if (!(h.shares > 0) || !Number.isFinite(h.shares)) continue
    const market = (h.market ?? 'US').toUpperCase()
    if (market === 'NZX') { nzx.push(h.ticker); continue }
    const rate = h.currency.toUpperCase() === 'NZD' ? 1 : toNzd(h.currency)
    if (rate == null || !Number.isFinite(rate) || rate <= 0) { noRate.push(h.ticker); continue }
    const cost = Number.isFinite(h.buyPrice) && h.buyPrice > 0 ? h.shares * h.buyPrice * rate : 0
    const value = Number.isFinite(h.currentPrice) && h.currentPrice > 0 ? h.shares * h.currentPrice * rate : 0
    const pos: FifPosition = { ticker: h.ticker, name: h.name || h.ticker, costNzd: cost, valueNzd: value }
    ;(market === 'ASX' ? asx : counted).push(pos)
  }

  const sum = (a: FifPosition[], k: 'costNzd' | 'valueNzd') => a.reduce((s, p) => s + p[k], 0)
  const costNzd = sum(counted, 'costNzd')
  const asxCost = sum(asx, 'costNzd')
  return {
    costNzd,
    valueNzd: sum(counted, 'valueNzd'),
    positions: counted.sort((a, b) => b.costNzd - a.costNzd),
    asx: { positions: asx.sort((a, b) => b.costNzd - a.costNzd), costNzd: asxCost },
    nzx,
    noRate,
    current: status(costNzd, FIF_LIMIT_CURRENT),
    proposed: status(costNzd, FIF_LIMIT_PROPOSED),
    costWithAsxNzd: costNzd + asxCost,
  }
}

/**
 * Rough FDR cost if the rules applied. Uses today's value as a stand-in for the
 * 1 April opening value, which the real calculation needs, so treat it as a guide.
 */
export function estimateFdr(valueNzd: number, marginalRate: number): FdrEstimate {
  const income = Math.max(0, valueNzd) * FDR_RATE
  const rate = Math.min(1, Math.max(0, marginalRate))
  return { incomeNzd: income, taxNzd: income * rate }
}

/** The NZ tax year (1 April - 31 March) a date falls in. */
export function nzTaxYear(now: Date = new Date()): { label: string; startsOn: string; endsOn: string; daysLeft: number } {
  const y = now.getUTCFullYear()
  const startYear = now.getUTCMonth() >= 3 ? y : y - 1 // April is month 3
  const end = Date.UTC(startYear + 1, 2, 31)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return {
    label: `${startYear}–${String((startYear + 1) % 100).padStart(2, '0')}`,
    startsOn: `${startYear}-04-01`,
    endsOn: `${startYear + 1}-03-31`,
    daysLeft: Math.max(0, Math.round((end - today) / 86400000)),
  }
}
