// Home loan maths for the Home Loan page, worked out from the loan account's
// own transactions where possible. On a loan account, repayments arrive as
// credits (positive) and interest is charged as debits (negative).

export interface LoanTx { amount: number; date: string; description?: string | null }

export type Frequency = 'weekly' | 'fortnightly' | 'monthly'
export const PER_YEAR: Record<Frequency, number> = { weekly: 52, fortnightly: 26, monthly: 12 }

export interface Repayment { amount: number; frequency: Frequency; perYear: number; monthly: number; count: number }

const isInterest = (t: LoanTx) => /interest/i.test(t.description || '')
const isFee = (t: LoanTx) => /\bfee\b/i.test(t.description || '')

/** The regular repayment: the most common credit amount, seen at least twice, and how often it comes. */
export function detectRepayment(txs: LoanTx[]): Repayment | null {
  const credits = txs.filter(t => t.amount > 0 && !isInterest(t))
  // Some banks show repayments as debits instead; use those only if there are no credits.
  const pool = credits.length ? credits : txs.filter(t => t.amount < 0 && !isInterest(t) && !isFee(t))
  const counts = new Map<string, LoanTx[]>()
  for (const t of pool) {
    const k = Math.abs(t.amount).toFixed(2)
    counts.set(k, [...(counts.get(k) ?? []), t])
  }
  const [amountKey, hits] = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? []
  if (!amountKey || !hits || hits.length < 2) return null

  const days = hits.map(t => Date.parse(t.date)).filter(Number.isFinite).sort((a, b) => a - b)
  const gaps = days.slice(1).map((d, i) => (d - days[i]) / 86_400_000).sort((a, b) => a - b)
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 30
  const frequency: Frequency = median <= 10 ? 'weekly' : median <= 20 ? 'fortnightly' : 'monthly'
  const amount = Number(amountKey)
  return { amount, frequency, perYear: PER_YEAR[frequency], monthly: (amount * PER_YEAR[frequency]) / 12, count: hits.length }
}

export interface InterestSummary { total: number; since: string | null; lastMonth: number | null; impliedRate: number | null }

/** Interest charged in the transactions we have, and the rate those charges imply on the current balance. */
export function summariseInterest(txs: LoanTx[], balance: number): InterestSummary {
  const charges = txs.filter(t => t.amount < 0 && isInterest(t)).sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  const total = charges.reduce((s, t) => s + Math.abs(t.amount), 0)
  const since = charges.length ? charges[charges.length - 1].date : null
  // Average the last three monthly charges, so one short month doesn't skew the rate.
  const recent = charges.slice(0, 3).map(t => Math.abs(t.amount))
  const lastMonth = recent.length ? recent[0] : null
  const avg = recent.length ? recent.reduce((s, a) => s + a, 0) / recent.length : null
  const impliedRate = avg && balance > 0 ? Math.round(((avg * 12) / balance) * 1000) / 10 : null
  return { total, since, lastMonth, impliedRate: impliedRate && impliedRate > 0.5 && impliedRate < 20 ? impliedRate : null }
}

export interface YearRow { year: number; paid: number; principal: number; interest: number; endBalance: number }
export interface Projection { payoffDate: Date; years: number; months: number; totalInterest: number; byYear: YearRow[] }

/** Pays the balance down at `payment` every period from today. Null if the payment doesn't cover the interest. */
export function projectPayoff(balance: number, annualRate: number, payment: number, perYear: number, from = new Date()): Projection | null {
  if (balance <= 0 || payment <= 0) return null
  const r = annualRate / 100 / perYear
  if (balance * r >= payment) return null
  let remaining = balance
  let totalInterest = 0
  let periods = 0
  const byYear: YearRow[] = []
  while (remaining > 0.005 && periods < perYear * 60) {
    const interest = remaining * r
    const paid = Math.min(payment, remaining + interest)
    remaining = remaining + interest - paid
    totalInterest += interest
    periods++
    const year = Math.ceil(periods / perYear)
    const row = byYear[year - 1] ?? (byYear[year - 1] = { year, paid: 0, principal: 0, interest: 0, endBalance: 0 })
    row.paid += paid
    row.interest += interest
    row.principal += paid - interest
    row.endBalance = Math.max(0, remaining)
  }
  const totalMonths = Math.ceil((periods * 12) / perYear)
  const payoffDate = new Date(from)
  payoffDate.setMonth(payoffDate.getMonth() + totalMonths)
  return { payoffDate, years: Math.floor(totalMonths / 12), months: totalMonths % 12, totalInterest, byYear }
}

/** The standard monthly repayment that clears `balance` in `months`. */
export function scheduledMonthly(balance: number, annualRate: number, months: number) {
  const r = annualRate / 100 / 12
  if (months <= 0) return balance
  if (r === 0) return balance / months
  return (balance * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1)
}
