import { localDate } from '@/lib/utils'

// Shared by the Bills page and dashboard notifications: recurring bills you
// entered, plus bills found in your email, merged without double-counting.

export const FREQS = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'annually'] as const
export type Freq = typeof FREQS[number]

export interface Bill {
  id: string
  name: string
  amount: number
  frequency: Freq
  next_due_date: string
  owner: string
  is_active: boolean
}

/** A row from gmail_scanned_items (see backend/src/routes/gmail.ts). */
export interface EmailItem {
  id: string
  email_id: string
  type: string
  category: 'business' | 'household' | 'personal'
  direction?: 'payable' | 'receivable'
  vendor: string
  counterparty?: string | null
  amount: number | null
  gst: number | null
  due_date: string | null
  email_date?: string | null
  description: string | null
  reference: string | null
  paid: boolean
  paid_date?: string | null
  matched_transaction_id?: string | null
  dismissed?: boolean
}

/**
 * Next due date after a payment. Works in local calendar dates and keeps the
 * day of the month where it can: 31 Jan monthly -> 28/29 Feb, not 3 Mar.
 */
export function advanceDate(dateStr: string, freq: Freq): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (freq === 'weekly' || freq === 'fortnightly') {
    return localDate(new Date(y, m - 1, d + (freq === 'weekly' ? 7 : 14)))
  }
  const months = freq === 'monthly' ? 1 : freq === 'quarterly' ? 3 : 12
  const target = new Date(y, m - 1 + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return localDate(new Date(target.getFullYear(), target.getMonth(), Math.min(d, lastDay)))
}

export function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000)
}

// Words that say nothing about which company it is.
const FILLER = new Set(['ltd', 'limited', 'nz', 'new', 'zealand', 'the', 'and', 'co', 'company', 'group', 'inc', 'bill', 'invoice', 'account'])
const words = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !FILLER.has(w))

/**
 * Loose name match: every meaningful word of the shorter name appears in the
 * longer one. "Mercury NZ Ltd" ~ "Power (Mercury)", "Xero" ~ "Xero subscription",
 * but "Tauranga City Council" is not "Tauranga Gym".
 */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = words(a), y = words(b)
  if (!x.length || !y.length) return false
  const [short, long] = x.length <= y.length ? [x, new Set(y)] : [y, new Set(x)]
  return short.every(w => long.has(w))
}

export const isPayable = (e: EmailItem) => e.direction !== 'receivable'
export const emailName = (e: EmailItem) => (isPayable(e) ? e.vendor : e.counterparty || e.vendor)

/** How close an email's due date must be to a recurring bill's to count as the same bill. */
const SAME_BILL_WINDOW_DAYS = 10

/**
 * Pairs unpaid email bills with the recurring bills they belong to. An email
 * for "Mercury Energy" due 3 days after your "Power (Mercury)" bill is that
 * bill's statement, not a second bill.
 */
export function matchEmailsToBills(bills: Bill[], emails: EmailItem[]) {
  const attached = new Map<string, EmailItem>()
  const standalone: EmailItem[] = []
  for (const e of emails) {
    const bill = bills.find(b =>
      !attached.has(b.id) &&
      (sameName(e.vendor, b.name) || sameName(e.counterparty, b.name)) &&
      (!e.due_date || Math.abs(daysUntil(e.due_date) - daysUntil(b.next_due_date)) <= SAME_BILL_WINDOW_DAYS)
    )
    if (bill) attached.set(bill.id, e)
    else standalone.push(e)
  }
  return { attached, standalone }
}
