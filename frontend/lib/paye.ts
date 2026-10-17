// NZ pay maths for one main job (tax code M / ME, optionally with SL). Pure
// functions, no React. Figures are for the 2026/27 tax year (1 April 2026 –
// 31 March 2027), checked against IRD:
//  - Income tax rates (unchanged since 31 July 2024):
//    https://www.ird.govt.nz/income-tax/income-tax-for-individuals/tax-codes-and-tax-rates-for-individuals/tax-rates-for-individuals
//  - ACC earners' levy $1.75 per $100 up to $156,641:
//    https://www.ird.govt.nz/income-tax/income-tax-for-individuals/acc-clients-and-carers/acc-earners-levy-rates
//  - Student loan: 12% of income over $24,128:
//    https://www.ird.govt.nz/student-loans/living-in-new-zealand-with-a-student-loan/repaying-my-student-loan-when-i-earn-salary-or-wages
//  - Independent earner tax credit: $520 between $24,000 and $66,000, reducing
//    by 13c per dollar to nil at $70,000; paid through PAYE only on code ME:
//    https://www.ird.govt.nz/income-tax/income-tax-for-individuals/individual-tax-credits/independent-earner-tax-credit-ietc
// Update these each April.

export const TAX_YEAR = '2026/27'

const BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 15_600, rate: 0.105 },
  { upTo: 53_500, rate: 0.175 },
  { upTo: 78_100, rate: 0.30 },
  { upTo: 180_000, rate: 0.33 },
  { upTo: Infinity, rate: 0.39 },
]
export const ACC_RATE = 0.0175
export const ACC_MAX_EARNINGS = 156_641
export const STUDENT_LOAN_THRESHOLD = 24_128
export const STUDENT_LOAN_RATE = 0.12
const IETC_MAX = 520
const IETC_FROM = 24_000
const IETC_FULL_TO = 66_000
const IETC_TO = 70_000
const IETC_ABATEMENT = 0.13

export const PERIODS = {
  weekly:      { label: 'Weekly',      perYear: 52 },
  fortnightly: { label: 'Fortnightly', perYear: 26 },
  fourWeekly:  { label: 'Four-weekly', perYear: 13 },
  monthly:     { label: 'Monthly',     perYear: 12 },
  annual:      { label: 'Annual',      perYear: 1 },
} as const
export type Period = keyof typeof PERIODS

export function incomeTax(annual: number): number {
  let tax = 0
  let lower = 0
  for (const b of BRACKETS) {
    if (annual <= lower) break
    tax += (Math.min(annual, b.upTo) - lower) * b.rate
    lower = b.upTo
  }
  return tax
}

export function accLevy(annual: number): number {
  return Math.min(Math.max(annual, 0), ACC_MAX_EARNINGS) * ACC_RATE
}

export function studentLoanRepayment(annual: number): number {
  return Math.max(0, annual - STUDENT_LOAN_THRESHOLD) * STUDENT_LOAN_RATE
}

export function ietc(annual: number): number {
  if (annual < IETC_FROM || annual >= IETC_TO) return 0
  if (annual <= IETC_FULL_TO) return IETC_MAX
  return Math.max(0, IETC_MAX - (annual - IETC_FULL_TO) * IETC_ABATEMENT)
}

export interface PayOptions {
  /** Employee KiwiSaver %, 0 if not contributing. */
  kiwisaverRate: number
  studentLoan: boolean
  /** On tax code ME, so the IETC comes through each pay. */
  meCode: boolean
}

export interface PayBreakdown {
  gross: number
  tax: number
  acc: number
  studentLoan: number
  kiwisaver: number
  /** IETC received through pay (reduces tax). */
  ietcCredit: number
  net: number
}

/** Annual figures for a given annual gross. */
export function payFromGross(gross: number, o: PayOptions): PayBreakdown {
  const g = Math.max(0, gross)
  const ietcCredit = o.meCode ? ietc(g) : 0
  const tax = Math.max(0, incomeTax(g) - ietcCredit)
  const acc = accLevy(g)
  const sl = o.studentLoan ? studentLoanRepayment(g) : 0
  const ks = g * (o.kiwisaverRate / 100)
  return { gross: g, tax, acc, studentLoan: sl, kiwisaver: ks, ietcCredit, net: g - tax - acc - sl - ks }
}

/** Annual gross that produces the given annual take-home (what lands in your bank). */
export function grossFromNet(netAnnual: number, o: PayOptions): number {
  if (netAnnual <= 0) return 0
  // Take-home rises with gross everywhere (no marginal rate reaches 100%), so bisect.
  let lo = netAnnual
  let hi = netAnnual * 3 + 10_000
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (payFromGross(mid, o).net < netAnnual) lo = mid
    else hi = mid
  }
  return Math.round(hi * 100) / 100
}

export function perPeriod(b: PayBreakdown, period: Period): PayBreakdown {
  const n = PERIODS[period].perYear
  return {
    gross: b.gross / n, tax: b.tax / n, acc: b.acc / n, studentLoan: b.studentLoan / n,
    kiwisaver: b.kiwisaver / n, ietcCredit: b.ietcCredit / n, net: b.net / n,
  }
}
