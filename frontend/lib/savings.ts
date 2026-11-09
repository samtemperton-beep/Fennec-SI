// Savings: what your savings earn now, where they could be in 5-10 years, and
// how that compares with investing and KiwiSaver. Pure functions, no React, so
// they can be tested (and the fox gets the same numbers as the page).
//
// NZ rules used:
//  - Bank interest has resident withholding tax (RWT) taken off at the rate you
//    chose with your bank: 10.5%, 17.5%, 30%, 33% or 39%.
//    https://www.ird.govt.nz/income-tax/withholding-taxes/resident-withholding-tax-rwt
//  - Most bank savings accounts pay interest monthly, so growth compounds monthly.

export const RWT_RATES = [0.105, 0.175, 0.30, 0.33, 0.39]
export const DEFAULT_RWT = 0.30

/** Account types (Akahu's) that hold savings. */
export const SAVINGS_TYPES = new Set(['SAVINGS', 'TERMDEPOSIT'])
/** Activity in these isn't household cash: loans, KiwiSaver and investments are counted elsewhere. */
const NON_CASH_TYPES = new Set(['LOAN', 'KIWISAVER', 'INVESTMENT', 'WALLET'])

export const INTEREST_CATEGORY = 'Interest'
export const RWT_CATEGORY = 'Withholding tax'

/** Bank wording for interest paid to you (not interest charged on a loan or overdraft). */
export function looksLikeInterest(description: string): boolean {
  const d = description.toLowerCase()
  return /\binterest\b|\bint (paid|credit)\b/.test(d) && !/withholding|debit int|loan|overdraft|charge|fee|mortgage/.test(d)
}
/** Bank wording for resident withholding tax. */
export function looksLikeRwt(description: string): boolean {
  return /withholding|\brwt\b|w\/h tax|wht\b/i.test(description)
}

export interface SavingsAccount { id: string; name: string; type: string; current_balance: number | string | null; is_business?: boolean | null }
export interface SavingsTx { account_id: string; date: string; amount: number | string; description: string | null; category?: string | null }

export interface SavingsAnalysis {
  /** Total in savings and term deposit accounts. */
  balance: number
  accounts: { id: string; name: string; balance: number }[]
  /** Interest paid to you and RWT taken, over the period, scaled to a year when there's less than a year of history. */
  interestYear: number
  rwtYear: number
  /** How many months of history the yearly figures are based on (up to 12). */
  months: number
  /** RWT as a share of interest, when both are known. */
  rwtRate: number | null
  /** Interest per year as a % of the savings balance, before tax. */
  grossRate: number | null
  /** Average money added to savings accounts each month (net of withdrawals; interest and tax left out). */
  monthlySaving: number | null
}

const DAY = 86_400_000
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Reads savings from accounts and the last year of transactions. Transactions
 * count as interest or RWT if they're in that category, or (uncategorised) if
 * the bank's wording says so.
 */
export function analyseSavings(accounts: SavingsAccount[], txs: SavingsTx[], now: Date = new Date()): SavingsAnalysis {
  const household = accounts.filter(a => !a.is_business && !NON_CASH_TYPES.has(String(a.type).toUpperCase()))
  const savings = household.filter(a => SAVINGS_TYPES.has(String(a.type).toUpperCase()))
  const householdIds = new Set(household.map(a => a.id))
  const savingsIds = new Set(savings.map(a => a.id))
  const balance = savings.reduce((s, a) => s + (Number(a.current_balance) || 0), 0)

  const yearAgo = new Date(now.getTime() - 365 * DAY)
  const inYear = txs.filter(t => householdIds.has(t.account_id) && new Date(t.date) >= yearAgo && new Date(t.date) <= now)
  const earliest = inYear.reduce<number | null>((m, t) => { const d = new Date(t.date).getTime(); return m === null || d < m ? d : m }, null)
  const months = earliest === null ? 0 : Math.min(12, Math.max(0, (now.getTime() - earliest) / (DAY * 30.44)))

  const isInterest = (t: SavingsTx) => Number(t.amount) > 0 &&
    (t.category === INTEREST_CATEGORY || (!t.category && looksLikeInterest(t.description ?? '')))
  const isRwt = (t: SavingsTx) => Number(t.amount) < 0 &&
    (t.category === RWT_CATEGORY || (!t.category && looksLikeRwt(t.description ?? '')))

  let interest = 0, rwt = 0
  const interestMonths = new Set<string>(), rwtMonths = new Set<string>()
  for (const t of inYear) {
    if (isInterest(t)) { interest += Number(t.amount); interestMonths.add(t.date.slice(0, 7)) }
    else if (isRwt(t)) { rwt += -Number(t.amount); rwtMonths.add(t.date.slice(0, 7)) }
  }
  // Nearly a year of history: the total is the year. Less: scale up by the
  // months interest was actually paid in (most banks pay monthly), and with
  // under 2 months there's too little to say what a year looks like.
  const scaleFor = (paidMonths: number) =>
    months >= 11 ? 1 : paidMonths >= 2 ? 12 / Math.min(12, Math.max(paidMonths, months)) : 0
  const interestYear = round2(interest * scaleFor(interestMonths.size))
  const rwtYear = round2(rwt * scaleFor(rwtMonths.size))

  // Money moved into savings accounts over the last 6 months (or what history there is).
  const sixAgo = new Date(now.getTime() - 182 * DAY)
  const flows = txs.filter(t => savingsIds.has(t.account_id) && new Date(t.date) >= sixAgo && new Date(t.date) <= now && !isInterest(t) && !isRwt(t))
  const flowStart = flows.reduce<number | null>((m, t) => { const d = new Date(t.date).getTime(); return m === null || d < m ? d : m }, null)
  const flowMonths = flowStart === null ? 0 : Math.min(6, (now.getTime() - flowStart) / (DAY * 30.44))
  const monthlySaving = flowMonths >= 1 ? round2(flows.reduce((s, t) => s + Number(t.amount), 0) / Math.max(1, flowMonths)) : null

  return {
    balance: round2(balance),
    accounts: savings.map(a => ({ id: a.id, name: a.name, balance: Number(a.current_balance) || 0 })),
    interestYear,
    rwtYear,
    months: Math.round(months * 10) / 10,
    rwtRate: interestYear > 0 && rwtYear > 0 ? Math.round((rwtYear / interestYear) * 1000) / 1000 : null,
    grossRate: balance > 0 && interestYear > 0 ? Math.round((interestYear / balance) * 10000) / 100 : null,
    monthlySaving,
  }
}

// ── Projections ──────────────────────────────────────────────────────────────

export type Frequency = 'weekly' | 'fortnightly' | 'monthly'
export const PER_YEAR: Record<Frequency, number> = { weekly: 52, fortnightly: 26, monthly: 12 }
export const toMonthly = (amount: number, f: Frequency) => (amount * PER_YEAR[f]) / 12

export interface YearPoint {
  year: number // years from now (0 = today)
  balance: number
  /** Money you've put in since today. */
  added: number
  /** Growth (interest or returns) earned during this year. */
  earnedThisYear: number
  /** Growth earned since today. */
  earned: number
}

/**
 * A pot growing at an annual rate with a monthly top-up, year by year.
 * `monthlyRate` is the rate applied each month: savings use the bank's
 * nominal rate / 12 (interest paid monthly); investments use the effective
 * annual return converted to monthly.
 */
function grow(start: number, monthly: number, monthlyRate: number, years: number): YearPoint[] {
  const points: YearPoint[] = [{ year: 0, balance: round2(start), added: 0, earnedThisYear: 0, earned: 0 }]
  let balance = start, added = 0, earned = 0
  for (let y = 1; y <= years; y++) {
    let thisYear = 0
    for (let m = 0; m < 12; m++) {
      const g = balance * monthlyRate
      balance += g + monthly
      added += monthly
      thisYear += g
    }
    earned += thisYear
    points.push({ year: y, balance: round2(balance), added: round2(added), earnedThisYear: round2(thisYear), earned: round2(earned) })
  }
  return points
}

/** Savings: interest at `grossRate`% a year, paid monthly, with RWT at `rwtRate` taken off. */
export function projectSavings(start: number, monthly: number, grossRate: number, rwtRate: number, years: number): YearPoint[] {
  const afterTax = (Math.max(0, grossRate) / 100) * (1 - Math.min(1, Math.max(0, rwtRate)))
  return grow(start, monthly, afterTax / 12, years)
}

/** Investments or a fund: `annualReturn`% a year, effective (compounded), with a monthly top-up. */
export function projectReturn(start: number, monthly: number, annualReturn: number, years: number): YearPoint[] {
  const monthlyRate = Math.pow(1 + annualReturn / 100, 1 / 12) - 1
  return grow(start, monthly, monthlyRate, years)
}

/** The after-tax yearly rate savings earn, as a %. */
export const afterTaxRate = (grossRate: number, rwtRate: number) => Math.round(grossRate * (1 - rwtRate) * 100) / 100

/** Balances (from year 0) as YearPoints, for a projection made elsewhere (KiwiSaver). */
export function fromBalances(balances: number[], monthlyAdded: number): YearPoint[] {
  return balances.map((b, i) => {
    const added = monthlyAdded * 12 * i
    const earned = b - balances[0] - added
    const prevEarned = i === 0 ? 0 : balances[i - 1] - balances[0] - monthlyAdded * 12 * (i - 1)
    return { year: i, balance: round2(b), added: round2(added), earnedThisYear: round2(i === 0 ? 0 : earned - prevEarned), earned: round2(earned) }
  })
}
