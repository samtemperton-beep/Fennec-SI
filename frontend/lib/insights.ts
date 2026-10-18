import type { SupabaseClient } from '@supabase/supabase-js'
import { api, type NetWorthResponse } from '@/lib/api'
import { GOVT_MTC_FULL_AT, GOVT_MTC_MAX, GOVT_MTC_MAX_AGE, currentAge } from '@/lib/kiwisaver'
import { matchEmailsToBills, isPayable, type Bill, type EmailItem } from '@/lib/bills'

// Dashboard notifications: one pass over every part of the app, turned into a
// short list of "how things are tracking" items. Each source is independent and
// fails quietly, so one broken table never empties the whole feed.

export type InsightSeverity = 'critical' | 'warning' | 'good' | 'info'
export type InsightSection = 'finance' | 'investing' | 'business' | 'kiwisaver' | 'home' | 'networth' | 'sync'

export interface Insight {
  /** Stable for the same underlying situation, so a dismissal sticks until it changes. */
  id: string
  severity: InsightSeverity
  section: InsightSection
  title: string
  detail?: string
  href: string
}

export interface InsightContext {
  supabase: SupabaseClient
  userId: string
  netWorth: NetWorthResponse | null
  /** null = every section enabled */
  enabledFeatures: string[] | null
}

const SEVERITY_ORDER: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

// ── helpers ─────────────────────────────────────────────────────────────────

const money = (n: number) =>
  n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
const usd = (n: number) =>
  n.toLocaleString('en-NZ', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const pct = (n: number, signed = false) => `${signed && n > 0 ? '+' : ''}${n.toFixed(1)}%`

function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function daysBetween(fromIso: string, toIso: string) {
  return Math.round((new Date(toIso + 'T00:00:00').getTime() - new Date(fromIso + 'T00:00:00').getTime()) / 86_400_000)
}
function niceDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })
}
function whenDue(iso: string, today: string) {
  const d = daysBetween(today, iso)
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  return niceDate(iso)
}

// ── sources ─────────────────────────────────────────────────────────────────

async function billInsights({ supabase }: InsightContext, today: string): Promise<Insight[]> {
  const horizon = isoLocal(addDays(new Date(), 7))
  const [{ data: bills }, emailItems] = await Promise.all([
    supabase.from('fin_bills').select('*').eq('is_active', true).order('next_due_date'),
    // Bills found in email (optional add-on; ignored if Gmail isn't connected).
    api.gmailItems().then(r => r.items).catch(() => [] as EmailItem[]),
  ])
  const openEmails = emailItems.filter(e => !e.paid && !e.dismissed && isPayable(e) && e.due_date)
  // An email that belongs to a recurring bill updates that bill's amount rather than adding a second bill.
  const { attached, standalone } = matchEmailsToBills((bills ?? []) as Bill[], openEmails)
  const data = [
    ...(bills ?? []).map((b: any) => ({ id: b.id as string, name: b.name as string, amount: Number(attached.get(b.id)?.amount ?? b.amount), next_due_date: b.next_due_date as string })),
    ...standalone.map(e => ({ id: `email-${e.id}`, name: e.vendor, amount: Number(e.amount ?? 0), next_due_date: e.due_date! })),
  ].filter(b => b.next_due_date <= horizon).sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
  if (!data.length) return []

  const out: Insight[] = []
  const overdue = data.filter(b => b.next_due_date < today)
  const upcoming = data.filter(b => b.next_due_date >= today)

  for (const b of overdue) {
    out.push({
      id: `bill-overdue:${b.id}:${b.next_due_date}`,
      severity: 'warning', section: 'finance',
      title: `${b.name} was due ${niceDate(b.next_due_date)}`,
      detail: `${money(Number(b.amount))}. If it's paid, tick it off on Bills.`,
      href: '/app/finance/bills',
    })
  }
  if (upcoming.length === 1) {
    const b = upcoming[0]
    out.push({
      id: `bill-due:${b.id}:${b.next_due_date}`,
      severity: daysBetween(today, b.next_due_date) <= 2 ? 'warning' : 'info', section: 'finance',
      title: `${b.name} is due ${whenDue(b.next_due_date, today)}`,
      detail: money(Number(b.amount)),
      href: '/app/finance/bills',
    })
  } else if (upcoming.length > 1) {
    const total = upcoming.reduce((s, b) => s + Number(b.amount), 0)
    out.push({
      id: `bills-week:${upcoming.map(b => b.id + b.next_due_date).join(',')}`,
      severity: upcoming.some(b => daysBetween(today, b.next_due_date) <= 2) ? 'warning' : 'info', section: 'finance',
      title: `${upcoming.length} bills due in the next 7 days · ${money(total)}`,
      detail: upcoming.map(b => `${b.name} (${whenDue(b.next_due_date, today)})`).join(', '),
      href: '/app/finance/bills',
    })
  }
  return out
}

async function budgetInsights({ supabase }: InsightContext): Promise<Insight[]> {
  const now = new Date()
  const monthStart = isoLocal(new Date(now.getFullYear(), now.getMonth(), 1))
  const monthKey = monthStart.slice(0, 7)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const through = now.getDate() / daysInMonth

  const [{ data: cats, error }, { data: txs }] = await Promise.all([
    supabase.from('fin_categories').select('id, name, monthly_budget').eq('scope', 'household').gt('monthly_budget', 0),
    supabase.from('fin_transactions').select('category_id, amount').gte('date', monthStart).lt('amount', 0).not('category_id', 'is', null),
  ])
  if (error || !cats?.length) return []

  const spent: Record<string, number> = {}
  for (const t of txs ?? []) spent[t.category_id] = (spent[t.category_id] ?? 0) + Math.abs(Number(t.amount))

  const out: Insight[] = []
  for (const c of cats) {
    const budget = Number(c.monthly_budget)
    const s = spent[c.id] ?? 0
    const used = s / budget
    if (used > 1) {
      out.push({
        id: `budget-over:${c.id}:${monthKey}`,
        severity: 'critical', section: 'finance',
        title: `Over budget on ${c.name}`,
        detail: `${money(s)} of ${money(budget)} (${Math.round(used * 100)}%)`,
        href: '/app/finance/budget',
      })
    } else if (used >= 0.5 && used > through + 0.2) {
      out.push({
        id: `budget-pace:${c.id}:${monthKey}`,
        severity: 'warning', section: 'finance',
        title: `${c.name} is running ahead of budget`,
        detail: `${Math.round(used * 100)}% used, ${Math.round(through * 100)}% of the way through the month. ${money(budget - s)} left.`,
        href: '/app/finance/budget',
      })
    }
  }
  if (out.length === 0) {
    out.push({
      id: `budget-ok:${monthKey}`,
      severity: 'good', section: 'finance',
      title: cats.length === 1 ? `Your ${cats[0].name} budget is on track` : `All ${cats.length} budgets are on track`,
      href: '/app/finance/budget',
    })
  }
  return out
}

async function goalInsights({ supabase }: InsightContext, today: string): Promise<Insight[]> {
  const { data, error } = await supabase
    .from('fin_goals').select('id, name, target_amount, current_amount, monthly_contribution, target_date')
    .eq('status', 'active')
  if (error || !data?.length) return []

  const out: Insight[] = []
  for (const g of data) {
    const target = Number(g.target_amount)
    const saved = Number(g.current_amount)
    const left = target - saved
    if (target <= 0) continue
    if (left <= 0) {
      out.push({
        id: `goal-done:${g.id}`, severity: 'good', section: 'finance',
        title: `${g.name} goal reached 🎉`,
        detail: `${money(saved)} saved. Mark it complete on Goals.`,
        href: '/app/finance/goals',
      })
      continue
    }
    if (g.target_date) {
      const daysLeft = daysBetween(today, g.target_date)
      if (daysLeft < 0) {
        out.push({
          id: `goal-late:${g.id}:${g.target_date}`, severity: 'warning', section: 'finance',
          title: `${g.name} passed its target date`,
          detail: `${money(left)} still to go. Pick a new date or adjust the target.`,
          href: '/app/finance/goals',
        })
        continue
      }
      const needed = left / Math.max(daysLeft / 30.44, 1)
      const putting = Number(g.monthly_contribution) || 0
      if (putting > 0 && putting < needed * 0.95) {
        out.push({
          id: `goal-behind:${g.id}:${Math.round(needed)}`, severity: 'warning', section: 'finance',
          title: `${g.name} is behind schedule`,
          detail: `Needs ${money(needed)}/month to hit ${money(target)} by ${niceDate(g.target_date)}; you're putting in ${money(putting)}.`,
          href: '/app/finance/goals',
        })
      } else if (putting >= needed * 0.95) {
        out.push({
          id: `goal-ontrack:${g.id}`, severity: 'good', section: 'finance',
          title: `${g.name} is on track`,
          detail: `${Math.round((saved / target) * 100)}% saved, on course for ${niceDate(g.target_date)}.`,
          href: '/app/finance/goals',
        })
      }
    } else if (saved / target >= 0.75) {
      out.push({
        id: `goal-close:${g.id}`, severity: 'good', section: 'finance',
        title: `${g.name} is ${Math.round((saved / target) * 100)}% there`,
        detail: `${money(left)} to go.`,
        href: '/app/finance/goals',
      })
    }
  }
  return out
}

async function invoiceInsights({ supabase, userId }: InsightContext, today: string): Promise<Insight[]> {
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase.from('business_invoices')
      .select('id, invoice_number, client_name, due_date, issue_date, status, gst_excluded, items:business_invoice_items(quantity, unit_price)')
      .in('status', ['draft', 'sent', 'overdue']),
    supabase.from('business_settings').select('gst_registered').eq('user_id', userId).maybeSingle(),
  ])
  if (error || !data?.length) return []

  const gstRegistered = settings?.gst_registered ?? true
  const totalOf = (inv: any) => {
    const sub = (inv.items ?? []).reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unit_price), 0)
    return gstRegistered && !inv.gst_excluded ? sub * 1.15 : sub
  }

  const out: Insight[] = []
  const unpaid = data.filter(i => i.status !== 'draft')
  const overdue = unpaid.filter(i => i.due_date && i.due_date < today)
  for (const inv of overdue) {
    const days = daysBetween(inv.due_date!, today)
    out.push({
      id: `invoice-overdue:${inv.id}`, severity: 'critical', section: 'business',
      title: `Invoice ${inv.invoice_number} to ${inv.client_name} is ${days} day${days === 1 ? '' : 's'} overdue`,
      detail: `${money(totalOf(inv))} was due ${niceDate(inv.due_date!)}.`,
      href: '/app/finance/business/invoices',
    })
  }
  const dueSoon = unpaid.filter(i => i.due_date && i.due_date >= today && daysBetween(today, i.due_date) <= 7)
  for (const inv of dueSoon) {
    out.push({
      id: `invoice-due:${inv.id}:${inv.due_date}`, severity: 'info', section: 'business',
      title: `${inv.client_name} owes ${money(totalOf(inv))}, due ${whenDue(inv.due_date!, today)}`,
      detail: `Invoice ${inv.invoice_number}`,
      href: '/app/finance/business/invoices',
    })
  }
  const outstanding = unpaid.reduce((s, i) => s + totalOf(i), 0)
  if (unpaid.length > 1 && outstanding > 0) {
    out.push({
      id: `invoice-outstanding:${unpaid.length}:${Math.round(outstanding)}`, severity: 'info', section: 'business',
      title: `${money(outstanding)} outstanding across ${unpaid.length} invoices`,
      href: '/app/finance/business/invoices',
    })
  }
  const staleDrafts = data.filter(i => i.status === 'draft' && i.issue_date && daysBetween(i.issue_date, today) >= 7)
  if (staleDrafts.length) {
    out.push({
      id: `invoice-drafts:${staleDrafts.map(i => i.id).join(',')}`, severity: 'info', section: 'business',
      title: `${staleDrafts.length} draft invoice${staleDrafts.length === 1 ? '' : 's'} not sent yet`,
      detail: staleDrafts.map(i => i.client_name).join(', '),
      href: '/app/finance/business/invoices',
    })
  }
  return out
}

async function investingInsights({ supabase, userId }: InsightContext, today: string): Promise<Insight[]> {
  const [{ data: holdings }, { data: alerts }, prefs] = await Promise.all([
    supabase.from('holdings').select('ticker, shares, buy_price, current_price, price_locked').eq('user_id', userId),
    supabase.from('alerts').select('id, ticker, type, price').eq('user_id', userId),
    api.getNotificationPrefs().catch(() => null),
  ])
  if (!holdings?.length && !alerts?.length) return []

  const tickers = [...new Set([
    ...(holdings ?? []).filter(h => !h.price_locked).map(h => h.ticker),
    ...(alerts ?? []).map(a => a.ticker),
  ])]
  let quotes: Record<string, { price: number; changePct?: number }> = {}
  try { if (tickers.length) quotes = await api.getPrices(tickers) } catch {}

  const out: Insight[] = []
  const priceOf = (t: string, fallback: number) => (quotes[t]?.price > 0 ? quotes[t].price : fallback)

  // Today's move, weighted by position size
  let value = 0
  let weighted = 0
  for (const h of holdings ?? []) {
    const v = Number(h.shares) * priceOf(h.ticker, Number(h.current_price))
    const dp = quotes[h.ticker]?.changePct
    if (Number.isFinite(dp)) { value += v; weighted += v * (dp as number) }
  }
  if (value > 0) {
    const day = weighted / value
    if (Math.abs(day) >= 0.1) {
      out.push({
        id: `portfolio-day:${today}:${day.toFixed(1)}`,
        severity: day <= -3 ? 'warning' : day >= 1 ? 'good' : 'info', section: 'investing',
        title: `Portfolio ${day >= 0 ? 'up' : 'down'} ${pct(Math.abs(day))} today`,
        detail: `About ${usd(Math.abs(weighted / 100))} ${day >= 0 ? 'gained' : 'lost'} since the last close.`,
        href: '/app/portfolio',
      })
    }
    const movers = (holdings ?? [])
      .filter(h => Math.abs(quotes[h.ticker]?.changePct ?? 0) >= 5)
      .sort((a, b) => Math.abs(quotes[b.ticker].changePct!) - Math.abs(quotes[a.ticker].changePct!))
      .slice(0, 3)
    if (movers.length) {
      out.push({
        id: `movers:${today}:${movers.map(m => m.ticker).join(',')}`,
        severity: 'info', section: 'investing',
        title: `Big moves today: ${movers.map(m => `${m.ticker} ${pct(quotes[m.ticker].changePct!, true)}`).join(', ')}`,
        href: '/app/portfolio',
      })
    }
  }

  // Stop-loss / take-profit, against the thresholds set on the Alerts page
  const stopLoss = Number(prefs?.stop_loss_pct) || 10
  const takeProfit = Number(prefs?.take_profit_pct) || 20
  for (const h of holdings ?? []) {
    const buy = Number(h.buy_price)
    if (!(buy > 0)) continue
    const pl = ((priceOf(h.ticker, Number(h.current_price)) - buy) / buy) * 100
    if (pl <= -stopLoss) {
      out.push({
        id: `stoploss:${h.ticker}`, severity: 'critical', section: 'investing',
        title: `${h.ticker} is ${pct(Math.abs(pl))} below your buy price`,
        detail: `Past your ${stopLoss}% stop-loss. Worth a review.`,
        href: '/app/portfolio',
      })
    } else if (pl >= takeProfit) {
      out.push({
        id: `takeprofit:${h.ticker}`, severity: 'good', section: 'investing',
        title: `${h.ticker} is up ${pct(pl)} on your buy price`,
        detail: `Past your ${takeProfit}% take-profit target.`,
        href: '/app/portfolio',
      })
    }
  }

  // Price alerts that have been crossed
  for (const a of alerts ?? []) {
    const p = quotes[a.ticker]?.price
    if (!(p > 0) || !(Number(a.price) > 0)) continue
    const hit = a.type === 'above' ? p >= Number(a.price) : a.type === 'below' ? p <= Number(a.price) : false
    if (hit) {
      out.push({
        id: `alert:${a.id}`, severity: 'warning', section: 'investing',
        title: `${a.ticker} is ${a.type} your ${usd(Number(a.price))} alert`,
        detail: `Now ${usd(p)}.`,
        href: '/app/alerts',
      })
    }
  }
  return out
}

async function kiwisaverInsights({ supabase, userId }: InsightContext): Promise<Insight[]> {
  const { data, error } = await supabase
    .from('fin_kiwisaver').select('date_of_birth, annual_salary, current_balance').eq('user_id', userId).maybeSingle()
  if (error || !data) return []

  const out: Insight[] = []
  if (!data.date_of_birth || !(Number(data.annual_salary) > 0)) {
    out.push({
      id: 'kiwisaver-details', severity: 'info', section: 'kiwisaver',
      title: 'Add two details to see your KiwiSaver projection',
      detail: 'Your date of birth and salary are all it needs.',
      href: '/app/finance/kiwisaver',
    })
  }
  // The KiwiSaver year ends 30 June. Remind in May and June.
  const now = new Date()
  const age = data.date_of_birth ? currentAge(data.date_of_birth, now) : null
  if ((now.getMonth() === 4 || now.getMonth() === 5) && (age === null || (age >= 18 && age < GOVT_MTC_MAX_AGE))) {
    out.push({
      id: `kiwisaver-mtc:${now.getFullYear()}`, severity: 'info', section: 'kiwisaver',
      title: 'KiwiSaver year ends 30 June',
      detail: `Contribute at least ${money(GOVT_MTC_FULL_AT)} for the year to get the full ${money(GOVT_MTC_MAX)} government contribution.`,
      href: '/app/finance/kiwisaver',
    })
  }
  return out
}

function homeInsights({ netWorth }: InsightContext): Insight[] {
  const c = netWorth?.current
  if (!c) return []
  const out: Insight[] = []
  if (c.property > 0 && c.debt < 0) {
    const equity = c.property + c.debt
    const lvr = (-c.debt / c.property) * 100
    out.push({
      id: `home-equity:${Math.round(equity / 1000)}`, severity: lvr > 80 ? 'info' : 'good', section: 'home',
      title: `Home equity ${money(equity)} (${Math.round(100 - lvr)}%)`,
      detail: `Loan-to-value ratio ${Math.round(lvr)}%${lvr > 80 ? '. Under 80% usually unlocks better rates.' : '.'}`,
      href: '/app/finance/homeloan',
    })
  }
  if (c.propertySource === 'purchase_price') {
    out.push({
      id: 'home-estimate', severity: 'info', section: 'home',
      title: 'Your house is valued at its purchase price',
      detail: 'Add a market estimate on Home Loan for a truer net worth.',
      href: '/app/finance/homeloan',
    })
  }
  return out
}

/** Separate from gatherInsights: it depends on the user's net worth exclusions, which can change without a reload. */
export function netWorthTrendInsights(netWorthHistory: { date: string; total: number }[]): Insight[] {
  const today = isoLocal(new Date())
  const h = netWorthHistory
  if (h.length < 2) return []
  const last = h[h.length - 1]
  const target = isoLocal(addDays(new Date(), -30))
  // The point closest to 30 days ago, or the oldest if history is shorter
  const base = [...h].reverse().find(p => p.date <= target) ?? h[0]
  const span = daysBetween(base.date, last.date)
  if (span < 7) return []
  const change = last.total - base.total
  if (Math.abs(change) < 1) return []
  return [{
    id: `networth-trend:${today}`,
    severity: change > 0 ? 'good' : 'warning', section: 'networth',
    title: `Net worth ${change > 0 ? 'up' : 'down'} ${money(Math.abs(change))} in ${span >= 28 ? 'the last month' : `${span} days`}`,
    href: '/app/dashboard',
  }]
}

async function syncInsights({ supabase, userId }: InsightContext): Promise<Insight[]> {
  const [{ data: status }, { data: accts }] = await Promise.all([
    supabase.from('akahu_sync_status').select('synced_at').eq('user_id', userId).maybeSingle(),
    supabase.from('fin_accounts').select('last_synced').eq('user_id', userId).not('akahu_account_id', 'is', null)
      .order('last_synced', { ascending: false }).limit(1),
  ])
  const out: Insight[] = []
  const age = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (status?.synced_at && age(status.synced_at) >= 2) {
    out.push({
      id: `sync-investments:${status.synced_at}`, severity: 'warning', section: 'sync',
      title: `Investments last synced ${age(status.synced_at)} days ago`,
      detail: 'Check your Akahu connection on the Portfolio page.',
      href: '/app/portfolio',
    })
  }
  const bankSynced = accts?.[0]?.last_synced
  if (bankSynced && age(bankSynced) >= 3) {
    out.push({
      id: `sync-bank:${bankSynced}`, severity: 'warning', section: 'sync',
      title: `Bank balances last updated ${age(bankSynced)} days ago`,
      detail: 'Sync on Finance → Accounts to refresh them.',
      href: '/app/finance/accounts',
    })
  }
  return out
}

// ── entry point ─────────────────────────────────────────────────────────────

export function sortInsights(list: Insight[]): Insight[] {
  return [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

export async function gatherInsights(ctx: InsightContext): Promise<Insight[]> {
  const today = isoLocal(new Date())
  const on = (feature: string) => !ctx.enabledFeatures || ctx.enabledFeatures.includes(feature)

  const sources: Promise<Insight[]>[] = [
    on('finance') ? billInsights(ctx, today) : Promise.resolve([]),
    on('finance') ? budgetInsights(ctx) : Promise.resolve([]),
    on('finance') ? goalInsights(ctx, today) : Promise.resolve([]),
    on('business') || on('finance') ? invoiceInsights(ctx, today) : Promise.resolve([]),
    on('investments') ? investingInsights(ctx, today) : Promise.resolve([]),
    kiwisaverInsights(ctx),
    syncInsights(ctx),
    Promise.resolve(homeInsights(ctx)),
  ]
  const settled = await Promise.allSettled(sources)
  const all = settled.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
  return sortInsights(all)
}
