// Portfolio balance: how concentrated a portfolio is, compared with rule-of-thumb
// guidelines that loosen as the user's risk tolerance rises. Pure functions, no
// React, so it can be tested.
//
// The guidelines are common rules of thumb, not a standard and not advice. They
// are shown as such and exist to make concentration visible, not to say what to do.
//
// Funds/ETFs are diversified inside, so a large position in a broad ETF is not
// "concentration". The single-stock and sector checks look at individual stocks
// only (as a share of the WHOLE portfolio, so funds dilute them naturally).

export interface ProfileInfo {
  status: 'ok' | 'empty' | 'error'
  industry: string | null
}

export interface BalanceInput {
  ticker: string
  name?: string | null
  market?: string | null // 'US' | 'ASX' | 'NZX' | ...
  /** Position value in ONE common currency. Non-positive or non-finite values are ignored. */
  value: number
  profile?: ProfileInfo | null
  /** Sector already stored on the holding (e.g. from AI analysis); used if there's no profile industry. */
  sector?: string | null
}

export type Kind = 'stock' | 'fund'

export interface Position {
  ticker: string
  name: string
  weight: number // 0..1 of the whole portfolio
  kind: Kind
  sector: string | null // stocks only
  market: string
}

export interface Guidelines {
  label: 'Cautious' | 'Balanced' | 'Growth'
  maxSingleStock: number
  maxSector: number
  minStockPositions: number
}

export interface Check {
  id: 'single' | 'sector' | 'spread'
  title: string
  detail: string
  /** Current value and the guideline limit, as fractions (single, sector) or counts (spread). */
  value: number
  limit: number
  unit: 'percent' | 'count'
  status: 'ok' | 'watch'
}

export interface Bucket { label: string; weight: number }

export interface Balance {
  positions: Position[] // largest first
  stockWeight: number
  fundWeight: number
  sectors: Bucket[]
  markets: Bucket[]
  checks: Check[]
  /** Checks that couldn't be run, and why (shown so a missing check isn't mistaken for a pass). */
  skipped: string[]
  guidelines: Guidelines
  flags: number
}

export const FUNDS_LABEL = 'Funds & ETFs'
export const UNCLASSIFIED_LABEL = 'Unclassified'

export function guidelinesFor(risk: number): Guidelines {
  const r = Number.isFinite(risk) ? Math.min(10, Math.max(1, Math.round(risk))) : 5
  if (r <= 3) return { label: 'Cautious', maxSingleStock: 0.10, maxSector: 0.30, minStockPositions: 12 }
  if (r <= 6) return { label: 'Balanced', maxSingleStock: 0.15, maxSector: 0.40, minStockPositions: 8 }
  return { label: 'Growth', maxSingleStock: 0.25, maxSector: 0.50, minStockPositions: 5 }
}

// "trust" is deliberately absent: it appears in ordinary company names (e.g. Northern Trust).
const FUND_NAME = /\b(etf|fund|index|ishares|vanguard|spdr|invesco|proshares|wisdomtree)\b/i

/** NZ/AU/US listings that Finnhub's company profiles don't cover; "empty" means "unknown" there, not "fund". */
const isUsMarket = (m?: string | null) => !m || m.toUpperCase() === 'US'

export function classify(h: BalanceInput): { kind: Kind; sector: string | null } {
  const p = h.profile
  const fallbackSector = h.sector?.trim() || null
  // Finnhub knows it as a company: a stock (industry if it has one).
  if (p?.status === 'ok') return { kind: 'stock', sector: p.industry ?? fallbackSector }
  if (h.name && FUND_NAME.test(h.name)) return { kind: 'fund', sector: null }
  // Finnhub returns nothing for ETFs, and nothing for symbols it doesn't cover.
  // Only on US tickers is "nothing" good evidence of a fund.
  if (p?.status === 'empty' && isUsMarket(h.market)) return { kind: 'fund', sector: null }
  // Failed lookup, or a market we have no data for: treat as a stock (the safer
  // reading for a concentration check), sector from the holding if it has one.
  return { kind: 'stock', sector: fallbackSector }
}

// Finnhub's industries are fine-grained (~60), so Semiconductors and Technology
// would count as different sectors even though both are tech. Group them into
// broad sectors, in this order; anything unmatched keeps its own label.
const SECTOR_GROUPS: [RegExp, string][] = [
  [/biotech|pharma|health|life sciences|medical/i, 'Health Care'],
  [/semiconductor|technology|software|hardware|internet|it services/i, 'Technology'],
  [/communication|telecom|media|entertainment/i, 'Communication Services'],
  [/bank|financ|insurance|capital markets|asset management/i, 'Financials'],
  [/aerospace|defense|airline|building|construction|electrical equipment|conglomerate|machinery|logistics|transportation|road & rail|marine|commercial services|professional services|trading companies/i, 'Industrials'],
  [/auto|retail|hotel|restaurant|leisure|textile|apparel|luxury|household durables|diversified consumer|distributors|homebuild/i, 'Consumer Discretionary'],
  [/food|beverage|tobacco|consumer products|personal products|staples/i, 'Consumer Staples'],
  [/chemical|metal|mining|paper|forest|packaging|materials/i, 'Materials'],
  [/energy|oil|gas(?!.*utilit)|coal/i, 'Energy'],
  [/utilit/i, 'Utilities'],
  [/real estate|reit/i, 'Real Estate'],
]

export function broadSector(industry: string | null | undefined): string | null {
  const s = industry?.trim()
  if (!s) return null
  return SECTOR_GROUPS.find(([re]) => re.test(s))?.[1] ?? s
}

const round = (n: number) => Math.round(n * 1000) / 1000

export function analyseBalance(inputs: BalanceInput[], risk: number): Balance | null {
  const valid = inputs.filter(h => Number.isFinite(h.value) && h.value > 0)
  const total = valid.reduce((s, h) => s + h.value, 0)
  if (valid.length === 0 || total <= 0) return null

  const g = guidelinesFor(risk)
  const positions: Position[] = valid
    .map(h => {
      const c = classify(h)
      return {
        ticker: h.ticker,
        name: h.name || h.ticker,
        weight: h.value / total,
        kind: c.kind,
        sector: broadSector(c.sector),
        market: (h.market || 'US').toUpperCase(),
      }
    })
    .sort((a, b) => b.weight - a.weight)

  const stocks = positions.filter(p => p.kind === 'stock')
  const stockWeight = stocks.reduce((s, p) => s + p.weight, 0)
  const fundWeight = positions.filter(p => p.kind === 'fund').reduce((s, p) => s + p.weight, 0)

  // Sector buckets: stocks by industry, plus funds and unclassified.
  const sectorMap = new Map<string, number>()
  const add = (m: Map<string, number>, k: string, w: number) => m.set(k, (m.get(k) ?? 0) + w)
  for (const p of positions) add(sectorMap, p.kind === 'fund' ? FUNDS_LABEL : p.sector || UNCLASSIFIED_LABEL, p.weight)
  const toBuckets = (m: Map<string, number>) => [...m.entries()].map(([label, weight]) => ({ label, weight })).sort((a, b) => b.weight - a.weight)
  const sectors = toBuckets(sectorMap)

  const marketMap = new Map<string, number>()
  for (const p of positions) add(marketMap, p.market, p.weight)
  const markets = toBuckets(marketMap)

  const checks: Check[] = []
  const skipped: string[] = []

  // 1. Largest single stock.
  if (stocks.length > 0) {
    const top = stocks[0]
    checks.push({
      id: 'single',
      title: 'Largest single stock',
      detail: `${top.name === top.ticker ? top.ticker : `${top.name} (${top.ticker})`} makes up ${(top.weight * 100).toFixed(1)}% of your portfolio.`,
      value: top.weight,
      limit: g.maxSingleStock,
      unit: 'percent',
      status: round(top.weight) > g.maxSingleStock ? 'watch' : 'ok',
    })
  }

  // 2. Largest sector, only when enough of the stock holdings have a sector.
  const classified = stocks.filter(p => p.sector)
  const classifiedWeight = classified.reduce((s, p) => s + p.weight, 0)
  if (stocks.length > 0) {
    if (stockWeight > 0 && classifiedWeight / stockWeight >= 0.5) {
      const bySector = new Map<string, number>()
      for (const p of classified) add(bySector, p.sector!, p.weight)
      const [label, weight] = toBuckets(bySector).map(b => [b.label, b.weight] as const)[0]
      checks.push({
        id: 'sector',
        title: 'Largest sector',
        detail: `${label} makes up ${(weight * 100).toFixed(1)}% of your portfolio.`,
        value: weight,
        limit: g.maxSector,
        unit: 'percent',
        status: round(weight) > g.maxSector ? 'watch' : 'ok',
      })
    } else {
      skipped.push("Sector check skipped: there isn't sector data for enough of your stocks.")
    }
  }

  // 3. Number of stocks, only when stocks are a meaningful part of the portfolio.
  if (stockWeight >= 0.3) {
    checks.push({
      id: 'spread',
      title: 'Number of stocks',
      detail: `You hold ${stocks.length} individual stock${stocks.length !== 1 ? 's' : ''}.`,
      value: stocks.length,
      limit: g.minStockPositions,
      unit: 'count',
      status: stocks.length < g.minStockPositions ? 'watch' : 'ok',
    })
  }

  return {
    positions,
    stockWeight,
    fundWeight,
    sectors,
    markets,
    checks,
    skipped,
    guidelines: g,
    flags: checks.filter(c => c.status === 'watch').length,
  }
}
