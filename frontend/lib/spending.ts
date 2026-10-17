import type { SupabaseClient } from '@supabase/supabase-js'
import { localDate } from '@/lib/utils'

// Household cash flow for a date range: money that actually came into and left
// the household, not money moved between your own accounts.
//
// Left out:
//   - transfers between your own accounts (credit card payments, loan
//     repayments, savings top-ups, broker deposits): a debit paired with a
//     credit of the same amount on another of your accounts within 3 days
//   - business accounts and business-scoped categories
//   - activity inside loan, KiwiSaver, investment and broker-wallet accounts
//     (interest charges, fund fees, share purchases)
//
// Card purchases still count: they're debits on the card account, and paying
// the card off later is the paired transfer that gets left out.
// Money moved from a business account into a personal one counts as income
// (owner drawings); money moved the other way is just a transfer.

const NON_SPEND_TYPES = new Set(['LOAN', 'KIWISAVER', 'INVESTMENT', 'WALLET'])
const MATCH_WINDOW_DAYS = 3

function shift(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return localDate(d)
}
function dayGap(a: string, b: string) {
  return Math.abs(new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86_400_000
}
const round2 = (n: number) => Math.round(n * 100) / 100

export interface CashFlow {
  income: number
  spending: number
  transfersExcluded: number
}

/** `from` and `to` are inclusive YYYY-MM-DD dates. Null if the data couldn't be read. */
export async function householdCashFlow(supabase: SupabaseClient, from: string, to: string): Promise<CashFlow | null> {
  const [{ data: accounts, error: aErr }, { data: txs, error: tErr }, { data: bizCats }] = await Promise.all([
    supabase.from('fin_accounts').select('id, type, is_business'),
    // Widen the window so transfers that straddle the range edges still pair up.
    supabase.from('fin_transactions').select('id, account_id, date, amount, category_id')
      .gte('date', shift(from, -MATCH_WINDOW_DAYS)).lte('date', shift(to, MATCH_WINDOW_DAYS)).limit(5000),
    supabase.from('fin_categories').select('id').eq('scope', 'business'),
  ])
  if (aErr || tErr || !accounts || !txs) return null

  const accountById = new Map(accounts.map(a => [a.id, a]))
  const businessCats = new Set((bizCats ?? []).map(c => c.id))
  const isHousehold = (accountId: string) => {
    const a = accountById.get(accountId)
    return !!a && !a.is_business && !NON_SPEND_TYPES.has(a.type)
  }
  const isBusiness = (accountId: string) => !!accountById.get(accountId)?.is_business

  // Pair each debit with the nearest-dated unused credit of the same amount on another account.
  type Tx = { id: string; account_id: string; date: string; amount: number; category_id: string | null; pairedWith?: Tx }
  const all: Tx[] = txs.map(t => ({ ...t, amount: Number(t.amount) }))
  const creditsByCents = new Map<number, Tx[]>()
  for (const t of all) {
    if (t.amount <= 0) continue
    const k = Math.round(t.amount * 100)
    if (!creditsByCents.has(k)) creditsByCents.set(k, [])
    creditsByCents.get(k)!.push(t)
  }
  for (const d of all.filter(t => t.amount < 0).sort((a, b) => a.date.localeCompare(b.date))) {
    const candidates = creditsByCents.get(Math.round(-d.amount * 100))
    const match = candidates
      ?.filter(c => !c.pairedWith && c.account_id !== d.account_id && dayGap(c.date, d.date) <= MATCH_WINDOW_DAYS)
      .sort((a, b) => dayGap(a.date, d.date) - dayGap(b.date, d.date))[0]
    if (match) { match.pairedWith = d; d.pairedWith = match }
  }

  let income = 0
  let spending = 0
  let transfersExcluded = 0
  for (const t of all) {
    if (t.date < from || t.date > to) continue
    if (!isHousehold(t.account_id)) continue
    if (t.category_id && businessCats.has(t.category_id)) continue
    const amt = Math.abs(t.amount)
    if (t.amount < 0) {
      if (t.pairedWith) transfersExcluded += amt
      else spending += amt
    } else if (t.amount > 0) {
      // A transfer in from your business is drawings, i.e. household income.
      if (!t.pairedWith || isBusiness(t.pairedWith.account_id)) income += amt
    }
  }

  return { income: round2(income), spending: round2(spending), transfersExcluded: round2(transfersExcluded) }
}
