import type { SupabaseClient } from '@supabase/supabase-js'
import { localDate } from '@/lib/utils'

// Household spending for a date range: money that actually left the household,
// not money moved between your own accounts.
//
// Left out:
//   - transfers between your own accounts (credit card payments, loan
//     repayments, savings top-ups, broker deposits): a debit matched by a credit
//     of the same amount on another of your accounts within 3 days
//   - business accounts and business-scoped categories
//   - activity inside loan, KiwiSaver, investment and broker-wallet accounts
//     (interest charges, fund fees, share purchases)
//
// Card purchases still count: they're debits on the card account, and paying
// the card off later is the matched transfer that gets left out.

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

export interface SpendingResult {
  total: number
  transfersExcluded: number
}

/** `from` and `to` are inclusive YYYY-MM-DD dates. */
export async function householdSpending(supabase: SupabaseClient, from: string, to: string): Promise<SpendingResult | null> {
  const [{ data: accounts, error: aErr }, { data: txs, error: tErr }, { data: bizCats }] = await Promise.all([
    supabase.from('fin_accounts').select('id, type, is_business'),
    // Widen the window so transfers that straddle the range edges still match.
    supabase.from('fin_transactions').select('id, account_id, date, amount, category_id')
      .gte('date', shift(from, -MATCH_WINDOW_DAYS)).lte('date', shift(to, MATCH_WINDOW_DAYS)).limit(5000),
    supabase.from('fin_categories').select('id').eq('scope', 'business'),
  ])
  if (aErr || tErr || !accounts || !txs) return null

  const accountById = new Map(accounts.map(a => [a.id, a]))
  const businessCats = new Set((bizCats ?? []).map(c => c.id))
  const isSpendAccount = (id: string) => {
    const a = accountById.get(id)
    return !!a && !a.is_business && !NON_SPEND_TYPES.has(a.type)
  }

  // Credits on any of your accounts, by amount in cents, for transfer matching.
  const credits = new Map<number, { account_id: string; date: string; used: boolean }[]>()
  for (const t of txs) {
    const amt = Number(t.amount)
    if (amt <= 0) continue
    const key = Math.round(amt * 100)
    if (!credits.has(key)) credits.set(key, [])
    credits.get(key)!.push({ account_id: t.account_id, date: t.date, used: false })
  }

  let total = 0
  let transfersExcluded = 0
  const debits = txs
    .filter(t => Number(t.amount) < 0 && t.date >= from && t.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))

  for (const t of debits) {
    if (!isSpendAccount(t.account_id)) continue
    if (t.category_id && businessCats.has(t.category_id)) continue
    const amt = Math.abs(Number(t.amount))
    const match = credits.get(Math.round(amt * 100))
      ?.filter(c => !c.used && c.account_id !== t.account_id && dayGap(c.date, t.date) <= MATCH_WINDOW_DAYS)
      .sort((a, b) => dayGap(a.date, t.date) - dayGap(b.date, t.date))[0]
    if (match) {
      match.used = true
      transfersExcluded += amt
      continue
    }
    total += amt
  }

  return { total: Math.round(total * 100) / 100, transfersExcluded: Math.round(transfersExcluded * 100) / 100 }
}
