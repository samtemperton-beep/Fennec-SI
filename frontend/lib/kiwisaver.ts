// KiwiSaver projection engine. Pure functions, no React, so it can be tested.
//
// Rules modelled (checked against IRD, current as of the 2025/26 tax year):
//  - Government contribution: 25c per $1 the MEMBER contributes (employee
//    deductions + voluntary; not employer money), max $260.72/yr, only for
//    members aged 16-64 who earn $180,000 or less.
//    https://www.ird.govt.nz/kiwisaver-changes
//  - Employer contributions are taxed (ESCT) before they reach the member's
//    account. The rate depends on salary + gross employer contribution
//    (thresholds from 1 Apr 2025):
//    https://www.ird.govt.nz/pages/campaigns/get-ready-for-new-esct-and-fbt-changes

export const GOVT_MTC_MAX = 260.72
export const GOVT_MTC_RATE = 0.25
/** Member contributions needed in a year to receive the full government contribution. */
export const GOVT_MTC_FULL_AT = 1042.86
export const GOVT_MTC_INCOME_CAP = 180_000
export const GOVT_MTC_MAX_AGE = 65 // paid up to (not including) 65

/** RBNZ's inflation target midpoint; used only for the "today's money" view. */
export const DEFAULT_INFLATION = 2

const ESCT_BANDS: { upTo: number; rate: number }[] = [
  { upTo: 18_720, rate: 0.105 },
  { upTo: 64_200, rate: 0.175 },
  { upTo: 93_720, rate: 0.30 },
  { upTo: 216_000, rate: 0.33 },
  { upTo: Infinity, rate: 0.39 },
]

export function esctRate(salary: number, employerGrossAnnual: number): number {
  const base = salary + employerGrossAnnual
  return ESCT_BANDS.find(b => base <= b.upTo)!.rate
}

const MS_YEAR = 365.25 * 24 * 60 * 60 * 1000

export function currentAge(dob: string, now: Date = new Date()): number {
  return (now.getTime() - new Date(dob).getTime()) / MS_YEAR
}

export function yearsTo(dob: string, targetAge: number, now: Date = new Date()): number {
  const birth = new Date(dob)
  const retire = new Date(birth.getFullYear() + targetAge, birth.getMonth(), birth.getDate())
  return Math.max(0, (retire.getTime() - now.getTime()) / MS_YEAR)
}

export interface ProjectionInput {
  dob: string
  retirementAge: number
  annualSalary: number
  employeeRate: number // %
  employerRate: number // %
  voluntaryMonthly: number
  expectedReturn: number // % per year, effective, after fees and tax
  currentBalance: number
  /** If set, results are in today's money using this annual inflation (%). */
  inflation?: number | null
  now?: Date
}

export interface MonthlyContributions {
  employee: number
  employerGross: number
  employerNet: number
  esctRate: number
  voluntary: number
  govt: number
  total: number
}

export interface ProjectionPoint { year: number; age: number; balance: number; months: number /* from now */ }

export interface Projection {
  points: ProjectionPoint[]
  finalBalance: number
  contributions: MonthlyContributions // what is going in per month today
  /** Member contributions per year (employee + voluntary): the base the government matches. */
  memberAnnual: number
  /** Govt contribution currently being lost because member contributions are below the full-match level. */
  govtShortfallAnnual: number
  /** Where the final balance comes from: start + member + employerNet + govt + growth = finalBalance. */
  totals: { start: number; member: number; employerNet: number; govt: number; growth: number }
}

/** What goes into the account each month for someone of the given age. */
export function monthlyContributions(i: ProjectionInput, age: number): MonthlyContributions {
  const employee = (i.annualSalary * (i.employeeRate / 100)) / 12
  const employerGross = (i.annualSalary * (i.employerRate / 100)) / 12
  const rate = esctRate(i.annualSalary, employerGross * 12)
  const employerNet = employerGross * (1 - rate)
  const voluntary = Number(i.voluntaryMonthly) || 0
  const eligible = age >= 16 && age < GOVT_MTC_MAX_AGE && i.annualSalary <= GOVT_MTC_INCOME_CAP
  const govt = eligible ? Math.min(GOVT_MTC_MAX, GOVT_MTC_RATE * (employee + voluntary) * 12) / 12 : 0
  return { employee, employerGross, employerNet, esctRate: rate, voluntary, govt, total: employee + employerNet + voluntary + govt }
}

export function projectKiwiSaver(i: ProjectionInput): Projection | null {
  if (!i.dob || !(i.annualSalary > 0)) return null
  const now = i.now ?? new Date()

  // Effective annual return -> monthly. (r/12 would overstate a stated annual rate.)
  const annual = i.inflation != null
    ? (1 + i.expectedReturn / 100) / (1 + i.inflation / 100) - 1 // real return; contributions assumed to keep pace with inflation
    : i.expectedReturn / 100
  const monthlyRate = Math.pow(1 + annual, 1 / 12) - 1

  const startAge = currentAge(i.dob, now)
  const totalMonths = Math.round(yearsTo(i.dob, i.retirementAge, now) * 12)

  const points: ProjectionPoint[] = []
  const pointAt = (m: number, balance: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() + m, 1)
    points.push({ year: d.getFullYear(), age: Math.round(startAge + m / 12), balance: Math.round(balance), months: m })
  }

  const start = Number(i.currentBalance) || 0
  let balance = start
  let member = 0, employerNet = 0, govt = 0
  for (let m = 0; m < totalMonths; m++) {
    if (m % 12 === 0) pointAt(m, balance)
    const c = monthlyContributions(i, startAge + m / 12)
    member += c.employee + c.voluntary
    employerNet += c.employerNet
    govt += c.govt
    balance = balance * (1 + monthlyRate) + c.total
  }
  // Always end exactly at retirement, including any part-year at the end.
  pointAt(totalMonths, balance)

  const contributions = monthlyContributions(i, startAge)
  const memberAnnual = (contributions.employee + contributions.voluntary) * 12
  const eligibleNow = startAge < GOVT_MTC_MAX_AGE && i.annualSalary <= GOVT_MTC_INCOME_CAP
  return {
    points,
    finalBalance: Math.round(balance),
    contributions,
    memberAnnual,
    govtShortfallAnnual: eligibleNow ? Math.max(0, GOVT_MTC_MAX - GOVT_MTC_RATE * memberAnnual) : 0,
    totals: { start, member, employerNet, govt, growth: balance - start - member - employerNet - govt },
  }
}

// ── Scenarios and ranges ─────────────────────────────────────────────────────

export const EMPLOYEE_RATES = [3, 3.5, 4, 6, 8, 10]

/** Rough long-run return guides per fund type (after fees and tax). Illustrative, not forecasts. */
export const FUND_RETURNS: Record<string, { label: string; defaultReturn: number }> = {
  conservative: { label: 'Conservative', defaultReturn: 3.5 },
  balanced:     { label: 'Balanced',     defaultReturn: 5.5 },
  growth:       { label: 'Growth',       defaultReturn: 7.0 },
  aggressive:   { label: 'Aggressive',   defaultReturn: 8.5 },
}

/** The range shown around a projection: returns this many points a year lower / higher. */
export const RANGE_SPREAD = 2

export interface Scenario {
  voluntaryMonthly?: number
  employeeRate?: number
  expectedReturn?: number
  retirementAge?: number
}

/** The same inputs with some values changed. Undefined fields keep the base value. */
export function withScenario(base: ProjectionInput, s: Scenario): ProjectionInput {
  return {
    ...base,
    voluntaryMonthly: s.voluntaryMonthly ?? base.voluntaryMonthly,
    employeeRate: s.employeeRate ?? base.employeeRate,
    expectedReturn: s.expectedReturn ?? base.expectedReturn,
    retirementAge: s.retirementAge ?? base.retirementAge,
  }
}

export interface ProjectionRange {
  low: Projection
  expected: Projection
  high: Projection
}

/** Expected projection plus one with returns RANGE_SPREAD lower and one RANGE_SPREAD higher (never below 0%). */
export function projectRange(i: ProjectionInput, spread: number = RANGE_SPREAD): ProjectionRange | null {
  const now = i.now ?? new Date() // shared so all three line up month for month
  const at = (r: number) => projectKiwiSaver({ ...i, now, expectedReturn: Math.max(0, r) })
  const low = at(i.expectedReturn - spread)
  const expected = at(i.expectedReturn)
  const high = at(i.expectedReturn + spread)
  if (!low || !expected || !high) return null
  return { low, expected, high }
}
