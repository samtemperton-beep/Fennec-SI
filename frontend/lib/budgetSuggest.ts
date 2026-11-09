// Suggested monthly budgets, two ways. Pure functions, so they can be tested.
//
//  1. From your spending: the average a month over your last full months.
//  2. From a few questions: rough starting points from typical New Zealand
//     household costs, scaled to who's in the household. These are deliberately
//     round, middle-of-the-road figures for someone starting out, to be adjusted,
//     not a measure of what anyone should spend.

import type { HouseholdAnswers } from '@/lib/aboutYou'

export interface Suggestion { name: string; amount: number; basis: string }

const roundUp10 = (n: number) => Math.ceil(n / 10) * 10
const WEEKS_PER_MONTH = 52 / 12

export interface SpendTx { date: string; amount: number; category: string | null }

/**
 * The average monthly spend per category over the last `months` full months
 * (this month is left out because it isn't finished). Months before your
 * first transaction don't count, so a short history isn't averaged down.
 */
export function fromHistory(txs: SpendTx[], spendingCategories: string[], now: Date = new Date(), months = 3): { suggestions: Suggestion[]; monthsUsed: number } {
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const wanted: string[] = []
  for (let i = months; i >= 1; i--) wanted.push(ym(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  const first = txs.reduce<string | null>((m, t) => (m === null || t.date < m ? t.date : m), null)
  const used = first ? wanted.filter(m => m >= first.slice(0, 7)) : []
  // A first month that only partly has data still counts; it's the best we have.
  const monthsUsed = used.length
  if (!monthsUsed) return { suggestions: [], monthsUsed: 0 }

  const allowed = new Set(spendingCategories)
  const totals = new Map<string, number>()
  for (const t of txs) {
    if (t.amount >= 0 || !t.category || !allowed.has(t.category)) continue
    if (!used.includes(t.date.slice(0, 7))) continue
    totals.set(t.category, (totals.get(t.category) ?? 0) - t.amount)
  }
  const suggestions = [...totals.entries()]
    .map(([name, total]) => ({ name, amount: roundUp10(total / monthsUsed), basis: `average of ${monthsUsed} month${monthsUsed === 1 ? '' : 's'}` }))
    .filter(s => s.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  return { suggestions, monthsUsed }
}

// Categories that can shrink to fit take-home pay; essentials can't.
const FLEXIBLE = new Set(['Dining Out', 'Entertainment', 'Shopping', 'Subscriptions', 'Miscellaneous', 'Savings'])

/** Starting points from typical NZ costs, for the default categories. */
export function fromAnswers(a: HouseholdAnswers): { suggestions: Suggestion[]; notes: string[] } {
  const adults = Math.max(1, Math.round(a.adults ?? 1))
  const kids = Math.max(0, Math.round(a.children ?? 0))
  const people = adults + kids
  const car = a.car ?? true
  const takeHome = a.takeHome && a.takeHome > 0 ? a.takeHome : null

  const typical = 'typical NZ cost'
  const list: Suggestion[] = [
    { name: 'Groceries', amount: (adults * 100 + kids * 70) * WEEKS_PER_MONTH, basis: `about $100 a week per adult, $70 per child` },
    ...(a.housing && a.housing > 0 ? [{ name: 'Rent/Mortgage', amount: a.housing, basis: 'what you told us' }] : []),
    { name: 'Utilities', amount: 200 + 50 * people, basis: 'power, internet and phone' },
    { name: 'Transport', amount: car ? 350 : 120, basis: car ? 'fuel, rego, WOF and upkeep' : 'public transport' },
    { name: 'Insurance', amount: 80 + 60 * adults + (car ? 60 : 0), basis: 'contents, health or life' + (car ? ', and car' : '') },
    { name: 'Health & Wellness', amount: 40 * people, basis: typical },
    { name: 'Subscriptions', amount: 50, basis: 'a couple of streaming or app subscriptions' },
    { name: 'Dining Out', amount: 80 * adults, basis: typical },
    { name: 'Entertainment', amount: 50 * people, basis: typical },
    { name: 'Shopping', amount: 80 * people, basis: 'clothes and household things' },
    { name: 'Miscellaneous', amount: 100, basis: 'a buffer for the unexpected' },
    ...(takeHome ? [{ name: 'Savings', amount: takeHome * 0.1, basis: '10% of take-home pay' }] : []),
  ]
  const notes: string[] = []

  if (takeHome) {
    const total = list.reduce((s, x) => s + x.amount, 0)
    if (total > takeHome) {
      const essentials = list.filter(x => !FLEXIBLE.has(x.name)).reduce((s, x) => s + x.amount, 0)
      const flexible = total - essentials
      const room = Math.max(0, takeHome - essentials)
      const scale = flexible > 0 ? room / flexible : 0
      for (const x of list) if (FLEXIBLE.has(x.name)) { x.amount *= scale; x.basis += ', trimmed to fit your pay' }
      if (essentials > takeHome) notes.push('Even the essentials come to more than your take-home pay, so the extras are set to $0. It may be worth looking at housing, transport or insurance costs.')
      else notes.push('The extras (dining, entertainment, shopping and savings) were trimmed so the total fits your take-home pay.')
    }
  }

  const suggestions = list.map(x => ({ ...x, amount: x.name === 'Rent/Mortgage' ? Math.round(x.amount) : roundUp10(x.amount) }))
  // Rounding up can tip a tight budget over; take it back off the buffer.
  if (takeHome) {
    const over = suggestions.reduce((s, x) => s + x.amount, 0) - takeHome
    const misc = suggestions.find(x => x.name === 'Miscellaneous')
    if (over > 0 && misc) misc.amount = Math.max(0, misc.amount - Math.ceil(over / 10) * 10)
  }
  return { suggestions: suggestions.filter(x => x.amount > 0 || x.name === 'Savings'), notes }
}
