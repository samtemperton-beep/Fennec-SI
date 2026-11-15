import type { SupabaseClient } from '@supabase/supabase-js'

// Finance → Rental (rental_migration.sql). Accounts linked to a property keep
// their transactions out of the household budget and use these categories.
// The notification check in backend/src/services/notify.ts (rentLate) uses the
// same rent detection; keep them in step.

export type RentFrequency = 'weekly' | 'fortnightly' | 'monthly'

export interface RentalProperty {
  id: string
  name: string
  value: number | null
  value_note: string | null
  purchase_price: number | null
  purchase_date: string | null
  loan_balance: number | null
  interest_rate: number | null
  rent_amount: number | null
  rent_frequency: RentFrequency
  ownership_pct: number
  new_build: boolean
  interest_by_year: Record<string, number>
  /** A loan account read for the live balance and interest, not moved out of household. */
  loan_account_id?: string | null
  /** The property manager's fee as a % of rent (agent_statements_migration.sql), for months without a statement. */
  agent_fee_pct?: number | null
  agent_fee_plus_gst?: boolean
}

/** One line of a property manager's statement. Amounts are positive and include GST. */
export interface StatementItem {
  date: string; kind: 'rent' | 'utilities' | 'other_income' | 'fee' | 'expense' | 'payment'
  label: string; amount: number
  /** For rent and bills the agent paid: the fee taken on it, including GST. */
  fee?: number
  fee_type?: string
  /** For bills: the IR3 line. */
  line?: string
}

export interface AgentStatement {
  id: string; property_id: string; agent: string | null; period_start: string | null; period_end: string
  rent: number; fees: number; expenses: number; utilities: number; other_income: number; paid_to_owner: number
  items: StatementItem[]
}

export interface RentalAccount { id: string; name: string; type: string; rental_property_id: string | null; is_business: boolean; current_balance?: number | null }
export interface LoanTx { date: string; description: string | null; amount: number }
export interface RentalTx {
  id: string; date: string; description: string | null; amount: number; category_id: string | null; account_id: string
  /** Made from a property manager's statement ('statement') or estimated from their fee ('estimate'), not a bank transaction. */
  synthetic?: 'statement' | 'estimate'
}
export interface RentalCategory { id: string; name: string; kind: string }

/** What a category means for coverage and tax. */
export type Role = 'rent' | 'other_income' | 'mortgage' | 'interest' | 'expense' | 'capital' | 'transfer' | 'passthrough'

export const RENTAL_CATEGORIES: { name: string; kind: 'income' | 'spending'; role: Role; line?: string; hint: string }[] = [
  { name: 'Rent received',          kind: 'income',   role: 'rent',         hint: 'Rent from tenants, or from your property manager' },
  { name: 'Other rental income',    kind: 'income',   role: 'other_income', hint: 'Insurance payouts, bond kept for damage, letting fees' },
  { name: 'Mortgage repayments',    kind: 'spending', role: 'mortgage',     hint: 'Loan repayments (principal and interest together)' },
  { name: 'Mortgage interest',      kind: 'spending', role: 'interest',     line: 'Interest', hint: 'Interest charged on its own, if your bank shows it separately' },
  { name: 'Rates',                  kind: 'spending', role: 'expense',      line: 'Rates', hint: 'Council rates' },
  { name: 'Water',                  kind: 'spending', role: 'expense',      line: 'Rates', hint: 'Water rates and charges' },
  { name: 'Insurance',              kind: 'spending', role: 'expense',      line: 'Insurance', hint: 'Landlord and building insurance' },
  { name: 'Property management',    kind: 'spending', role: 'expense',      line: "Agent's fees", hint: "Property manager's fees and letting fees" },
  { name: 'Repairs & maintenance',  kind: 'spending', role: 'expense',      line: 'Repairs and maintenance', hint: 'Fixing and maintaining what is already there' },
  { name: 'Body corporate',         kind: 'spending', role: 'expense',      line: 'Other expenses', hint: 'Body corporate levies' },
  { name: 'Accounting & legal',     kind: 'spending', role: 'expense',      line: 'Legal and accounting fees', hint: 'Accountant, tax agent and legal fees' },
  { name: 'Bank fees',              kind: 'spending', role: 'expense',      line: 'Other expenses', hint: 'Account, overdraft and other bank fees on this account' },
  { name: 'Other costs',            kind: 'spending', role: 'expense',      line: 'Other expenses', hint: 'Travel to the property, smoke alarms, healthy homes checks' },
  { name: 'Improvements',           kind: 'spending', role: 'capital',      hint: "Renovations and additions: capital, so not a deductible expense" },
  { name: 'Tenant utilities',       kind: 'spending', role: 'passthrough',  hint: "Power, broadband and water you pay for the tenants, and what they pay you back. Only the difference counts" },
  { name: 'Transfers',              kind: 'spending', role: 'transfer',     hint: "Money moved between your own accounts. Left out of everything" },
  { name: 'Personal (not rental)',  kind: 'spending', role: 'transfer',     hint: "Something personal paid from this account by mistake, and the money you put back. Left out of everything" },
]
const BY_NAME = new Map(RENTAL_CATEGORIES.map(c => [c.name, c]))
export const TAX_LINES = ['Rates', 'Insurance', 'Interest', 'Repairs and maintenance', "Agent's fees", 'Legal and accounting fees', 'Other expenses']

/** A category's meaning. Ones people make themselves count as an expense (or other income). */
export function roleOf(cat: RentalCategory | undefined): { role: Role; line?: string } {
  if (!cat) return { role: 'expense' }
  const known = BY_NAME.get(cat.name)
  if (known) return { role: known.role, line: known.line }
  return cat.kind === 'income' ? { role: 'other_income' } : { role: 'expense', line: 'Other expenses' }
}

/** Makes sure the person has every rental category. Returns them all. */
export async function ensureRentalCategories(supabase: SupabaseClient, userId: string): Promise<RentalCategory[]> {
  const { data } = await supabase.from('fin_categories').select('id, name, kind').eq('scope', 'rental')
  const have = new Set((data ?? []).map((c: any) => c.name))
  const missing = RENTAL_CATEGORIES.filter(c => !have.has(c.name))
  if (!missing.length) return (data ?? []) as RentalCategory[]
  await supabase.from('fin_categories').upsert(
    missing.map(c => ({ user_id: userId, name: c.name, scope: 'rental', kind: c.kind })),
    { onConflict: 'user_id,name,scope', ignoreDuplicates: true },
  )
  const { data: all } = await supabase.from('fin_categories').select('id, name, kind').eq('scope', 'rental').order('name')
  return (all ?? []) as RentalCategory[]
}

// ── Dates ──────────────────────────────────────────────────────────────────

const iso = (d: Date) => d.toISOString().slice(0, 10)
export const todayNZ = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date())
const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d) }

/** NZ tax years run 1 April to 31 March; named by the year they end (2026 = 2025–26). */
export const taxYearOf = (date: string) => { const [y, m] = date.split('-').map(Number); return m >= 4 ? y + 1 : y }
export const taxYearRange = (end: number) => ({ from: `${end - 1}-04-01`, to: `${end}-03-31` })
export const taxYearLabel = (end: number) => `${end - 1}–${String(end).slice(2)}`

/**
 * Share of residential rental interest that can be claimed, by tax year
 * (loans from before 27 March 2021; new builds can claim it all). null when
 * the rules were mixed within the year and an accountant should work it out.
 */
export function interestDeductiblePct(yearEnd: number, newBuild: boolean): number | null {
  if (newBuild || yearEnd <= 2021) return 100
  if (yearEnd === 2022) return null
  if (yearEnd === 2023) return 75
  if (yearEnd === 2024) return 50
  if (yearEnd === 2025) return 80
  return 100
}

export const PERIOD_DAYS: Record<RentFrequency, number> = { weekly: 7, fortnightly: 14, monthly: 31 }
export const monthlyRent = (p: Pick<RentalProperty, 'rent_amount' | 'rent_frequency'>) =>
  !p.rent_amount ? 0 : p.rent_frequency === 'weekly' ? p.rent_amount * 52 / 12 : p.rent_frequency === 'fortnightly' ? p.rent_amount * 26 / 12 : p.rent_amount

// ── Suggestions for uncategorised transactions ─────────────────────────────

// Power, gas and internet companies, for bills paid for the tenants.
export const UTILITIES = ['powershop', 'contact energy', 'mercury', 'genesis', 'meridian', 'electric kiwi', 'flick', 'frank energy', 'nova energy', 'trustpower', 'pulse energy', 'octopus', 'ecotricity', 'globug', 'energy online', 'rockgas', 'elgas', '2degrees', 'one nz', 'onenz', 'spark', 'vodafone', 'skinny', 'slingshot', 'orcon', 'bigpipe', 'voyager', 'starlink', 'mynetfone', 'zeronet', 'kogan']
const has = (d: string, words: string[]) => words.some(w => d.includes(w))
const PM = ['property manag', 'quinovic', 'harcourts', 'barfoot', 'ray white', 'bayleys', 'lj hooker', 'tall poppy', 'property brokers', 'professionals', 'crockers', 'mike pero', 'rentals', 'lodge', 'my rental']

/** A likely rental category for a transaction, by name, or null. */
export function suggestCategory(t: Pick<RentalTx, 'description' | 'amount'>, p?: Pick<RentalProperty, 'rent_amount' | 'rent_frequency'>): string | null {
  const d = (t.description ?? '').toLowerCase()
  const loan = ['loan', 'mortgage', 'lending', 'home ln', 'hl repay']
  // Repayments are often a transfer to the loan account, so check for the loan first.
  if (t.amount < 0 && has(d, loan)) return 'Mortgage repayments'
  if (has(d, ['transfer', ' tfr', 'tfr ', ' trf', 'trf ', 'internet banking', 'online banking', 'mobile banking'])) return 'Transfers'
  if (t.amount > 0) {
    if (has(d, ['power', 'electric', 'internet', 'broadband', 'wifi', 'utilit', 'reimb'])) return 'Tenant utilities'
    if (has(d, ['rent', 'tenant', 'bond']) || has(d, PM)) return 'Rent received'
    // Close to the expected rent, or a whole number of rent periods.
    const r = p?.rent_amount ?? 0
    if (r > 0 && [1, 2, 4, 5].some(k => Math.abs(t.amount - r * k) <= r * 0.12)) return 'Rent received'
    if (has(d, ['insur', 'claim'])) return 'Other rental income'
    return null
  }
  if (has(d, ['interest', 'debit int'])) return 'Mortgage interest'
  if (has(d, UTILITIES)) return 'Tenant utilities'
  if (has(d, ['watercare', 'water rates', 'water charge', 'wellington water', 'water services'])) return 'Water'
  if (has(d, ['council', 'rates', ' dc ', 'district c', 'city c', 'regional c'])) return 'Rates'
  if (has(d, ['body corp', 'bodycorp', 'bc levy', 'strata'])) return 'Body corporate'
  if (has(d, ['insur', 'tower', 'ami ', 'state ins', 'vero', 'initio', 'youi', 'aa ins', 'fmg', 'cove '])) return 'Insurance'
  if (has(d, PM) || has(d, ['management fee', 'letting fee', 'mgmt fee'])) return 'Property management'
  if (has(d, ['accountant', 'accounting', 'xero', 'tax agent', 'lawyer', 'legal', 'solicitor'])) return 'Accounting & legal'
  if (has(d, ['plumb', 'electric', 'builder', 'roof', 'bunnings', 'mitre 10', 'mitre10', 'placemakers', 'repair', 'maint', 'handyman', 'glass', 'locksmith', 'paint', 'garden', 'lawn', 'pest', 'clean', 'gas fit', 'heat pump', 'smoke alarm', 'healthy home'])) return 'Repairs & maintenance'
  if (has(d, ['fee', 'bank charge', 'overdraft', 'dishonour', 'service charge'])) return 'Bank fees'
  return null
}

// ── Figures ────────────────────────────────────────────────────────────────

export interface Totals { rent: number; otherIncome: number; mortgage: number; interest: number; expenses: number; capital: number; uncategorised: number; uncategorisedCount: number; byLine: Record<string, number>; utilitiesPaid: number; utilitiesBack: number }

export function totals(txs: RentalTx[], cats: Map<string, RentalCategory>): Totals {
  const t: Totals = { rent: 0, otherIncome: 0, mortgage: 0, interest: 0, expenses: 0, capital: 0, uncategorised: 0, uncategorisedCount: 0, byLine: {}, utilitiesPaid: 0, utilitiesBack: 0 }
  for (const x of txs) {
    const a = Number(x.amount)
    if (!x.category_id || !cats.has(x.category_id)) { t.uncategorised += a; t.uncategorisedCount++; continue }
    const { role, line } = roleOf(cats.get(x.category_id))
    if (role === 'transfer') continue
    if (role === 'passthrough') { if (a < 0) t.utilitiesPaid -= a; else t.utilitiesBack += a; continue }
    if (role === 'rent') t.rent += a
    else if (role === 'other_income') t.otherIncome += a
    else if (role === 'mortgage') t.mortgage -= a
    else if (role === 'interest') t.interest -= a
    else if (role === 'capital') t.capital -= a
    else t.expenses -= a
    if (line) t.byLine[line] = (t.byLine[line] ?? 0) - a
  }
  // Paid for the tenants and paid back: only the difference is a cost (or income).
  const gap = t.utilitiesPaid - t.utilitiesBack
  if (gap > 0) { t.expenses += gap; t.byLine['Other expenses'] = (t.byLine['Other expenses'] ?? 0) + gap }
  else if (gap < 0) t.otherIncome -= gap
  return t
}

export interface Month { key: string; label: string; rent: number; mortgage: number; costs: number }

/** The last `n` whole months plus this one, oldest first. */
export function months(txs: RentalTx[], cats: Map<string, RentalCategory>, n = 12, today = todayNZ()): Month[] {
  const [y, m] = today.split('-').map(Number)
  const out: Month[] = []
  for (let i = n; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    const key = iso(d).slice(0, 7)
    const inMonth = txs.filter(x => x.date.startsWith(key))
    const t = totals(inMonth, cats)
    out.push({
      key,
      label: d.toLocaleDateString('en-NZ', { month: 'short', timeZone: 'UTC' }) + (i === 0 ? ' (so far)' : ''),
      rent: Math.round(t.rent + t.otherIncome),
      mortgage: Math.round(t.mortgage + t.interest),
      costs: Math.round(t.expenses),
    })
  }
  return out
}

/**
 * Rent arrival: the newest rent payment and whether the next one is late.
 * A property manager often pays out every fortnight or month whatever the rent
 * period, so the usual gap between recent payments is allowed for too.
 */
export function rentStatus(p: RentalProperty, txs: RentalTx[], cats: Map<string, RentalCategory>, today = todayNZ()) {
  const rentIds = new Set([...cats.values()].filter(c => roleOf(c).role === 'rent').map(c => c.id))
  const dates = [...new Set(txs.filter(x => x.amount > 0 && x.category_id && rentIds.has(x.category_id)).map(x => x.date))].sort()
  const last = dates[dates.length - 1] ?? null
  if (!last || !p.rent_amount) return { last, due: null as string | null, late: false, daysLate: 0 }
  const period = Math.max(PERIOD_DAYS[p.rent_frequency], usualGap(dates.filter(d => d >= addDays(today, -120))))
  const due = addDays(last, period)
  const daysLate = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${due}T12:00:00Z`)) / 86_400_000)
  return { last, due, late: daysLate > 4, daysLate: Math.max(0, daysLate) }
}

/** The middle gap in days between payment dates (0 with fewer than 3). */
export function usualGap(sortedDates: string[]): number {
  if (sortedDates.length < 3) return 0
  const gaps = sortedDates.slice(1).map((d, i) => Math.round((Date.parse(d) - Date.parse(sortedDates[i])) / 86_400_000)).sort((a, b) => a - b)
  return Math.min(35, gaps[Math.floor(gaps.length / 2)])
}

// ── Property manager statements ────────────────────────────────────────────

const LINE_CATEGORY: Record<string, string> = {
  Rates: 'Rates', Insurance: 'Insurance', 'Repairs and maintenance': 'Repairs & maintenance',
  Improvements: 'Improvements', 'Tenant utilities': 'Tenant utilities', 'Other expenses': 'Other costs',
}
const monthOf = (d: string) => d.slice(0, 7)
/** The agent's fee as a share of rent, GST included, or 0. */
export const agentFeeRate = (p: Pick<RentalProperty, 'agent_fee_pct' | 'agent_fee_plus_gst'>) =>
  p.agent_fee_pct ? p.agent_fee_pct / 100 * (p.agent_fee_plus_gst === false ? 1 : 1.15) : 0
const nextMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}` }

/**
 * The property's transactions with its agent statements worked in. The bank
 * only sees what the agent paid out (rent less fees, plus any utility
 * repayments), so in a month with a statement those payments are swapped for
 * the statement's lines: the full rent, each fee, bills the agent paid and
 * utilities paid back. In months without one, if the agent's fee is set, rent
 * paid out is grossed up by it as an estimate.
 */
export function withAgentStatements(p: RentalProperty, txs: RentalTx[], statements: AgentStatement[], cats: RentalCategory[], today = todayNZ()) {
  const byName = new Map(cats.map(c => [c.name, c.id]))
  const catId = (name: string) => byName.get(name) ?? null
  const rentIds = new Set(cats.filter(c => roleOf(c).role === 'rent').map(c => c.id))
  const mine = statements.filter(s => s.property_id === p.id)
  const covered = new Set(mine.map(s => monthOf(s.period_end)))
  const first = mine.length ? [...covered].sort()[0] : null
  const rate = agentFeeRate(p)
  const replaced = new Set<string>()
  const extra: RentalTx[] = []
  const estimated = new Map<string, number>()

  for (const s of mine) {
    s.items.forEach((it, i) => {
      const id = `agent:${s.id}:${i}`
      const add = (suffix: string, description: string, amount: number, category: string) =>
        extra.push({ id: id + suffix, date: it.date, description, amount: Math.round(amount * 100) / 100, category_id: catId(category), account_id: '', synthetic: 'statement' })
      if (it.kind === 'rent') add('', 'Rent (agent statement)', it.amount, 'Rent received')
      else if (it.kind === 'utilities') add('', `${it.label} (agent statement)`, it.amount, 'Tenant utilities')
      else if (it.kind === 'other_income') add('', `${it.label} (agent statement)`, it.amount, 'Other rental income')
      else if (it.kind === 'fee') add('', `${it.label} (agent fee)`, -it.amount, 'Property management')
      else if (it.kind === 'expense') add('', `${it.label} (paid by agent)`, -it.amount, LINE_CATEGORY[it.line ?? ''] ?? 'Other costs')
      if ((it.kind === 'rent' || it.kind === 'expense') && it.fee) add(':fee', it.kind === 'rent' ? 'Management fee on rent (agent statement)' : `Fee on ${it.label} (agent statement)`, -it.fee, 'Property management')
    })
  }

  for (const t of txs) {
    if (!(t.amount > 0 && t.category_id && rentIds.has(t.category_id))) continue
    const m = monthOf(t.date)
    if (covered.has(m)) { replaced.add(t.id); continue }
    if (rate > 0 && rate < 0.5 && (!first || m >= first)) {
      const gross = t.amount / (1 - rate)
      replaced.add(t.id)
      extra.push({ ...t, id: `est:${t.id}`, description: `${t.description ?? 'Rent'} (before agent fee, estimated)`, amount: Math.round(gross * 100) / 100, synthetic: 'estimate' })
      extra.push({ ...t, id: `est:${t.id}:fee`, description: 'Agent fee (estimated)', amount: -Math.round((gross - t.amount) * 100) / 100, category_id: catId('Property management'), synthetic: 'estimate' })
      estimated.set(m, (estimated.get(m) ?? 0) + gross - t.amount)
    }
  }

  // Months between the first statement and last month with no statement.
  const missing: string[] = []
  if (first) {
    const lastMonth = monthOf(addDays(`${monthOf(today)}-01`, -1))
    for (let m = first; m <= lastMonth; m = nextMonth(m)) if (!covered.has(m)) missing.push(m)
  }
  const out = [...txs.filter(t => !replaced.has(t.id)), ...extra].sort((a, b) => b.date.localeCompare(a.date))
  return { txs: out, replaced, missing, estimated: [...estimated].map(([month, fee]) => ({ month, fee: Math.round(fee) })) }
}

/** An agent's fees by tax year, from statements, GST included. */
export function agentFeesByYear(statements: AgentStatement[]) {
  const by = new Map<number, { total: number; byType: Record<string, number> }>()
  const add = (date: string, type: string, n: number) => {
    const y = taxYearOf(date)
    const e = by.get(y) ?? { total: 0, byType: {} }
    e.total += n; e.byType[type] = (e.byType[type] ?? 0) + n
    by.set(y, e)
  }
  for (const s of statements) for (const it of s.items) {
    if (it.kind === 'rent' && it.fee) add(it.date, 'management', it.fee)
    else if (it.kind === 'expense' && it.fee) add(it.date, 'on bills', it.fee)
    else if (it.kind === 'fee') add(it.date, it.fee_type ?? 'other', it.amount)
  }
  return [...by].sort((a, b) => b[0] - a[0]).map(([year, v]) => ({ year, total: Math.round(v.total * 100) / 100, byType: v.byType }))
}

/** Interest for a tax year: what the person entered from their bank, else an estimate. */
/**
 * Interest the bank charged on the loan account in a tax year: debits that say
 * "interest" (same test as lib/homeloan.ts). `partialFrom` is set when the
 * account's history starts after the year began, so some may be missing.
 */
export function loanInterest(loanTxs: LoanTx[], yearEnd: number): { amount: number; partialFrom: string | null } | null {
  if (!loanTxs.length) return null
  const { from, to } = taxYearRange(yearEnd)
  const earliest = loanTxs.reduce((m, t) => (t.date < m ? t.date : m), loanTxs[0].date)
  if (earliest > to) return null
  const amount = loanTxs.filter(t => t.date >= from && t.date <= to && t.amount < 0 && /interest/i.test(t.description ?? ''))
    .reduce((s, t) => s - t.amount, 0)
  if (amount <= 0) return null
  return { amount: Math.round(amount), partialFrom: earliest > addDays(from, 31) ? earliest : null }
}

export function interestFor(p: RentalProperty, yearEnd: number, t: Totals, fromLoan?: { amount: number; partialFrom: string | null } | null): { amount: number; source: 'entered' | 'loan' | 'transactions' | 'estimate' | 'none'; partialFrom?: string | null } {
  const entered = p.interest_by_year?.[String(yearEnd)]
  if (typeof entered === 'number') return { amount: entered, source: 'entered' }
  if (fromLoan) return { amount: fromLoan.amount, source: 'loan', partialFrom: fromLoan.partialFrom }
  if (t.interest > 0) return { amount: t.interest, source: 'transactions' }
  if (p.loan_balance && p.interest_rate) return { amount: Math.round(p.loan_balance * p.interest_rate / 100), source: 'estimate' }
  return { amount: 0, source: 'none' }
}

export const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })

/** For the fox chat on the Rental page. */
export function rentalSummaryText(props: RentalProperty[], txsByProp: Map<string, RentalTx[]>, cats: Map<string, RentalCategory>, today = todayNZ()) {
  const lines: string[] = []
  const from12 = addDays(today, -365)
  for (const p of props) {
    const txs = txsByProp.get(p.id) ?? []
    const t = totals(txs.filter(x => x.date >= from12), cats)
    const rent = t.rent + t.otherIncome
    const out = t.mortgage + t.interest + t.expenses
    const s = rentStatus(p, txs, cats, today)
    lines.push(`${p.name} (${p.ownership_pct}% owned${p.new_build ? ', new build' : ''}): last 12 months rent ${nzd.format(rent)}, mortgage ${nzd.format(t.mortgage + t.interest)}, other costs ${nzd.format(t.expenses)}${t.utilitiesPaid ? ` (tenant utilities: paid ${nzd.format(t.utilitiesPaid)}, paid back ${nzd.format(t.utilitiesBack)})` : ''}, net ${nzd.format(rent - out)}${t.mortgage + t.interest > 0 ? `; rent covers ${Math.round(rent / (t.mortgage + t.interest) * 100)}% of the mortgage` : ''}${out > 0 ? ` and ${Math.round(rent / out * 100)}% of all costs` : ''}. ${t.uncategorisedCount} transactions uncategorised. Expected rent ${p.rent_amount ? `${nzd.format(p.rent_amount)} ${p.rent_frequency}` : 'not set'}; last rent ${s.last ?? 'none found'}${s.late ? `, ${s.daysLate} days late` : ''}. Value ${p.value ? nzd.format(p.value) : 'not set'}${p.value_note ? ` (${p.value_note})` : ''}, loan ${p.loan_balance ? nzd.format(p.loan_balance) : 'not set'}${p.interest_rate ? ` at ${p.interest_rate}%` : ''}.`)
  }
  return lines.join('\n')
}
