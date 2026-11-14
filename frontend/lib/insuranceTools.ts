import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAboutYou } from '@/lib/aboutYou'

// Finance → Insurance estimators: life cover needed, health cover costs over
// time, and whether comprehensive car cover is worth it. Rough estimates from
// the person's own figures; general information, not advice.

// ── Life ───────────────────────────────────────────────────────────────────

export interface LifeInputs {
  mortgages: number        // home and rental loans
  otherDebts: number       // credit cards and other loans
  dependants: boolean      // does anyone rely on your income?
  annualIncome: number     // after tax, what the household lives on
  incomeShare: number      // % of it to replace
  years: number            // for how long
  children: number
  perChild: number         // education and getting started, each
  finalCosts: number       // funeral and estate
  savings: number
  kiwisaver: number
  existingCover: number
}

export function lifeNeed(i: LifeInputs) {
  const income = i.dependants ? i.annualIncome * (i.incomeShare / 100) * i.years : 0
  const education = i.children * i.perChild
  const needs = i.mortgages + i.otherDebts + income + education + i.finalCosts
  const have = i.savings + i.kiwisaver + i.existingCover
  return { income, education, needs, have, gap: Math.max(0, Math.round(needs - have)) }
}

/** Figures Fennec already has, to start the life estimate with. */
export async function loadLifeDefaults(supabase: SupabaseClient): Promise<Partial<LifeInputs> & { notes: string[] }> {
  const notes: string[] = []
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
  const [{ data: accts }, { data: hl }, { data: rentals }, { data: ks }, { data: cats }, { data: pols }, about] = await Promise.all([
    supabase.from('fin_accounts').select('id, type, current_balance, is_business, is_rental'),
    supabase.from('home_loan').select('balance').maybeSingle(),
    supabase.from('rental_properties').select('loan_balance, loan_account_id'),
    supabase.from('fin_kiwisaver').select('current_balance').maybeSingle(),
    supabase.from('fin_categories').select('id, name').eq('scope', 'household').eq('kind', 'income'),
    supabase.from('insurance_policies').select('sum_insured, holder').eq('kind', 'life'),
    loadAboutYou(supabase),
  ])
  const a = ((accts ?? []) as any[]).filter(x => !x.is_business)
  const bal = (x: any) => Number(x.current_balance) || 0
  const loans = a.filter(x => x.type === 'LOAN').reduce((s, x) => s + Math.abs(Math.min(0, bal(x)) || bal(x)), 0)
  const cards = a.filter(x => x.type === 'CREDITCARD').reduce((s, x) => s + Math.abs(Math.min(0, bal(x))), 0)
  let mortgages = loans
  if (!mortgages && (hl as any)?.balance) { mortgages = Number((hl as any).balance); notes.push('Mortgage from your Home Loan page.') }
  else if (loans) notes.push('Mortgages from your loan accounts.')
  const rentalExtra = ((rentals ?? []) as any[]).filter(r => !r.loan_account_id && r.loan_balance).reduce((s, r) => s + Number(r.loan_balance), 0)
  if (rentalExtra) { mortgages += rentalExtra; notes.push('Plus rental loans entered on Rental.') }
  const savings = a.filter(x => !x.is_rental && ['SAVINGS', 'CHECKING', 'TERMDEPOSIT'].includes(String(x.type).toUpperCase()))
    .reduce((s, x) => s + Math.max(0, bal(x)), 0)
  const incomeCats = ((cats ?? []) as any[]).filter(c => !/interest/i.test(c.name)).map(c => c.id)
  let annualIncome = 0
  if (incomeCats.length) {
    const { data: inc } = await supabase.from('fin_transactions').select('amount, account:fin_accounts!inner(is_business, is_rental)')
      .in('category_id', incomeCats).gt('amount', 0).gte('date', yearAgo)
      .eq('account.is_business', false).eq('account.is_rental', false).limit(5000)
    annualIncome = Math.round(((inc ?? []) as any[]).reduce((s, t) => s + Number(t.amount), 0))
    if (annualIncome) notes.push('Income from your Income transactions over the last year.')
  }
  if (!annualIncome && about.household?.takeHome) { annualIncome = Math.round(about.household.takeHome * 12); notes.push('Income from the take-home pay you gave Fennec.') }
  const children = about.household?.children ?? 0
  const existingCover = ((pols ?? []) as any[]).filter(p => p.holder !== 'partner').reduce((s, p) => s + (Number(p.sum_insured) || 0), 0)
  return {
    mortgages: Math.round(mortgages), otherDebts: Math.round(cards), savings: Math.round(savings),
    kiwisaver: Math.round(Number((ks as any)?.current_balance) || 0), annualIncome, children, existingCover,
    dependants: children > 0 || (about.household?.adults ?? 1) > 1, notes,
  }
}

// ── Health ─────────────────────────────────────────────────────────────────

export interface HealthInputs { monthly: number; rise: number; years: number; growth: number; procedure: number }

/** Premiums paid over the years if they rise each year, and what the same money could grow to saved instead. */
export function healthCost(i: HealthInputs) {
  let premium = i.monthly * 12, paid = 0, fund = 0
  const byYear: { year: number; premium: number; paid: number; fund: number }[] = []
  for (let y = 1; y <= i.years; y++) {
    paid += premium
    fund = (fund + premium) * (1 + i.growth / 100)
    byYear.push({ year: y, premium: Math.round(premium), paid: Math.round(paid), fund: Math.round(fund) })
    premium *= 1 + i.rise / 100
  }
  const coverYear = i.procedure > 0 ? byYear.find(r => r.fund >= i.procedure)?.year ?? null : null
  return { byYear, paid: Math.round(paid), fund: Math.round(fund), coverYear }
}

// ── Car ────────────────────────────────────────────────────────────────────

export interface CarInputs { value: number; comprehensive: number; excess: number; thirdPartyFT: number; thirdParty: number }

export function carCompare(i: CarInputs) {
  const maxPayout = Math.max(0, i.value - i.excess)
  const extra = i.thirdPartyFT > 0 ? i.comprehensive - i.thirdPartyFT : i.thirdParty > 0 ? i.comprehensive - i.thirdParty : null
  const ratio = extra !== null && maxPayout > 0 ? extra / maxPayout : null
  const yearsToSelfInsure = extra && extra > 0 ? Math.ceil(maxPayout / extra) : null
  let verdict: 'keep' | 'consider' | 'unclear' = 'unclear'
  if (ratio !== null) verdict = ratio >= 0.1 ? 'consider' : 'keep'
  return { maxPayout, extra, ratio, yearsToSelfInsure, verdict, premiumShare: i.value > 0 ? i.comprehensive / i.value : null }
}
