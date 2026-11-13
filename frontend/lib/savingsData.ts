import type { SupabaseClient } from '@supabase/supabase-js'
import { localDate } from '@/lib/utils'
import { api } from '@/lib/api'
import {
  analyseSavings, projectSavings, projectReturn, fromBalances, toMonthly, afterTaxRate,
  RWT_RATES, DEFAULT_RWT, type SavingsAnalysis, type Frequency, type YearPoint,
} from '@/lib/savings'
import { projectKiwiSaver, type ProjectionInput } from '@/lib/kiwisaver'

// Everything the Savings page shows, loaded and worked out in one place so the
// fox (components/shared/FennecAI.tsx) sees the same numbers as the page.

export interface SavingsPrefs {
  rwt?: number          // RWT rate as a fraction (0.3)
  amount?: number       // how much you add to savings, per `freq`
  freq?: Frequency
  rate?: number         // savings interest rate, % a year before tax
  years?: 5 | 10
  investMonthly?: number
  investReturn?: number // % a year, assumed
}

export const DEFAULT_INVEST_RETURN = 7
const DEFAULT_SAVINGS_RATE = 4

export interface SavingsData {
  analysis: SavingsAnalysis
  prefs: SavingsPrefs
  /** Prefs with the gaps filled from your data (or sensible defaults). */
  inputs: Required<SavingsPrefs>
  investments: number | null
  kiwisaver: { balance: number; input: ProjectionInput | null; expectedReturn: number } | null
}

const nearestRwt = (r: number | null) =>
  r == null ? DEFAULT_RWT : RWT_RATES.reduce((best, x) => (Math.abs(x - r) < Math.abs(best - r) ? x : best), RWT_RATES[0])

export async function loadSavingsData(supabase: SupabaseClient): Promise<SavingsData | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const yearAgo = localDate(new Date(Date.now() - 366 * 86_400_000))

  const [{ data: accounts }, { data: txs }, { data: profile }, { data: ks }, net] = await Promise.all([
    supabase.from('fin_accounts').select('id, name, type, current_balance, is_business, is_rental'),
    supabase.from('fin_transactions').select('account_id, date, amount, description, category:fin_categories(name)')
      .gte('date', yearAgo).order('date', { ascending: false }).limit(5000),
    supabase.from('profiles').select('savings_prefs').eq('id', user.id).maybeSingle(),
    supabase.from('fin_kiwisaver').select('*').eq('user_id', user.id).maybeSingle(),
    api.getNetWorth().catch(() => null),
  ])

  const analysis = analyseSavings(
    (accounts ?? []) as any,
    (txs ?? []).map((t: any) => ({ ...t, category: t.category?.name ?? null })),
  )
  const prefs: SavingsPrefs = ((profile as any)?.savings_prefs ?? {}) as SavingsPrefs
  const inputs: Required<SavingsPrefs> = {
    rwt: prefs.rwt ?? nearestRwt(analysis.rwtRate),
    amount: prefs.amount ?? Math.max(0, Math.round(analysis.monthlySaving ?? 0)),
    freq: prefs.freq ?? 'monthly',
    rate: prefs.rate ?? analysis.grossRate ?? DEFAULT_SAVINGS_RATE,
    years: prefs.years ?? 10,
    investMonthly: prefs.investMonthly ?? 0,
    investReturn: prefs.investReturn ?? DEFAULT_INVEST_RETURN,
  }

  const num = (v: any, d: number) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v))
  let kiwisaver: SavingsData['kiwisaver'] = null
  const ksBalance = ks ? num((ks as any).current_balance, 0) : (net as any)?.current?.kiwisaver ?? 0
  if (ks || ksBalance) {
    const s: any = ks ?? {}
    const input: ProjectionInput | null = s.date_of_birth && num(s.annual_salary, 0) > 0 ? {
      dob: s.date_of_birth,
      retirementAge: num(s.retirement_age, 65),
      annualSalary: num(s.annual_salary, 0),
      employeeRate: num(s.employee_rate, 3.5),
      employerRate: num(s.employer_rate, 3.5),
      voluntaryMonthly: num(s.voluntary_monthly, 0),
      expectedReturn: num(s.expected_return, 5.5),
      currentBalance: ksBalance,
    } : null
    kiwisaver = { balance: ksBalance, input, expectedReturn: num(s.expected_return, 5.5) }
  }

  const investments = (net as any)?.current?.investments ?? null
  return { analysis, prefs, inputs, investments, kiwisaver }
}

export async function saveSavingsPrefs(supabase: SupabaseClient, prefs: SavingsPrefs) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('profiles').update({ savings_prefs: prefs }).eq('id', user.id)
  if (error) console.warn('[savings] settings not saved:', error.message)
}

// ── The three pots side by side ──────────────────────────────────────────────

export interface Pot {
  key: 'savings' | 'investing' | 'kiwisaver'
  label: string
  today: number
  monthly: number
  /** The yearly return used, % (after tax for savings and KiwiSaver; before tax for investing). */
  rate: number
  rateNote: string
  points: YearPoint[]
}

/** KiwiSaver balances for the next `years` years from its own projection (contributions included). */
function kiwiSaverPoints(k: NonNullable<SavingsData['kiwisaver']>, years: number, extraMonthly = 0): { points: YearPoint[]; monthly: number } {
  if (!k.input) return { points: projectReturn(k.balance, extraMonthly, k.expectedReturn, years), monthly: extraMonthly }
  const p = projectKiwiSaver({ ...k.input, voluntaryMonthly: k.input.voluntaryMonthly + extraMonthly })
  if (!p) return { points: projectReturn(k.balance, extraMonthly, k.expectedReturn, years), monthly: extraMonthly }
  const yearly = p.points.filter(pt => pt.months % 12 === 0).map(pt => pt.balance).slice(0, years + 1)
  // Past retirement age: no more contributions, the balance keeps its return.
  while (yearly.length < years + 1) yearly.push(Math.round(yearly[yearly.length - 1] * (1 + k.expectedReturn / 100)))
  return { points: fromBalances(yearly, p.contributions.total), monthly: p.contributions.total }
}

export function buildPots(d: SavingsData, inputs: Required<SavingsPrefs>): Pot[] {
  const years = inputs.years
  const pots: Pot[] = []
  const savingsMonthly = toMonthly(inputs.amount, inputs.freq)
  pots.push({
    key: 'savings', label: 'Savings', today: d.analysis.balance, monthly: savingsMonthly,
    rate: afterTaxRate(inputs.rate, inputs.rwt),
    rateNote: `${inputs.rate}% interest less ${Math.round(inputs.rwt * 1000) / 10}% RWT`,
    points: projectSavings(d.analysis.balance, savingsMonthly, inputs.rate, inputs.rwt, years),
  })
  if (d.investments != null && (d.investments > 0 || inputs.investMonthly > 0)) {
    pots.push({
      key: 'investing', label: 'Investing', today: d.investments, monthly: inputs.investMonthly,
      rate: inputs.investReturn, rateNote: 'your assumption, before tax; shares can fall',
      points: projectReturn(d.investments, inputs.investMonthly, inputs.investReturn, years),
    })
  }
  if (d.kiwisaver) {
    const k = kiwiSaverPoints(d.kiwisaver, years)
    pots.push({
      key: 'kiwisaver', label: 'KiwiSaver', today: d.kiwisaver.balance, monthly: k.monthly,
      rate: d.kiwisaver.expectedReturn,
      rateNote: d.kiwisaver.input ? 'your fund’s expected return after fees and tax, with your, employer and government contributions' : 'your fund’s expected return; add your salary on the KiwiSaver page to include contributions',
      points: k.points,
    })
  }
  return pots
}

/** What an extra amount a month would add to each pot by the end of the period. */
export function extraMonthlyGrowth(d: SavingsData, inputs: Required<SavingsPrefs>, extra: number) {
  const years = inputs.years
  const out: { key: Pot['key']; label: string; total: number; note: string }[] = [
    { key: 'savings', label: 'Savings', total: projectSavings(0, extra, inputs.rate, inputs.rwt, years)[years].balance, note: 'available any time' },
    { key: 'investing', label: 'Investing', total: projectReturn(0, extra, inputs.investReturn, years)[years].balance, note: 'could be more or less; shares go up and down' },
  ]
  if (d.kiwisaver?.input) {
    const base = kiwiSaverPoints(d.kiwisaver, years).points[years].balance
    const more = kiwiSaverPoints(d.kiwisaver, years, extra).points[years].balance
    out.push({ key: 'kiwisaver', label: 'KiwiSaver', total: Math.round(more - base), note: 'includes any extra government contribution; locked in until 65 (or a first home)' })
  }
  return out
}

/** A short summary for the fox. */
export function savingsSummaryText(d: SavingsData): string {
  const a = d.analysis
  const i = d.inputs
  const f = (n: number) => `$${Math.round(n).toLocaleString('en-NZ')}`
  const pots = buildPots(d, i)
  const lines = [
    `Savings accounts: ${f(a.balance)}${a.accounts.length ? ` (${a.accounts.map(x => `${x.name} ${f(x.balance)}`).join(', ')})` : ' (no savings or term deposit accounts found)'}.`,
    a.interestYear > 0
      ? `Interest over the last year: ${f(a.interestYear)} before tax, ${f(a.rwtYear)} RWT${a.rwtRate ? ` (about ${Math.round(a.rwtRate * 1000) / 10}%)` : ''}; about ${a.grossRate ?? '?'}% a year on the current balance${a.months < 11 ? ` (from ${a.months} months of history, scaled to a year)` : ''}.`
      : 'No interest payments found in the last year (they may not be categorised as Interest yet).',
    a.monthlySaving != null ? `Net money added to savings accounts: about ${f(a.monthlySaving)} a month over recent months.` : '',
    `Savings page settings: ${i.rate}% interest, ${Math.round(i.rwt * 1000) / 10}% RWT, adding ${f(i.amount)} ${i.freq}, over ${i.years} years.`,
    ...pots.map(p => `${p.label}: ${f(p.today)} now, adding ${f(p.monthly)}/month at ${p.rate}% a year (${p.rateNote}) → about ${f(p.points[i.years].balance)} in ${i.years} years, earning about ${f(p.points[i.years].earnedThisYear)} in that final year.`),
  ]
  return lines.filter(Boolean).join('\n')
}
