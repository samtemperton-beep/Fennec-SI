import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import ws from 'ws';
import { escapeHtml } from './adminEmail';
import { notifyBuddies, refreshFor } from './rewards';

// One place that writes notifications and emails them (notifications_migration.sql).
//
// - notify(): adds one to someone's feed. A dedupe key means the same thing
//   (a bill on a due date, a budget in a month) is only ever notified once.
// - checkMoney(): bills due, budgets, goals, overdue invoices and bank
//   connection problems, worked out on the server so they arrive even when
//   the app isn't open.
// - emails: straight away, one morning summary (7am NZ time), or none, as the
//   person chooses; plus an optional Monday summary. Price alerts go
//   straight away unless emails are off, since they're time-sensitive.

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);
let resend: Resend | null = null;
const site = () => (process.env.FRONTEND_URL || 'https://www.fennecsi.com').replace(/\/+$/, '');

export type EmailMode = 'immediate' | 'daily' | 'off';
export interface NotifyPrefs {
  stop_loss_pct: number; take_profit_pct: number
  portfolio_sell_alerts: boolean; watchlist_buy_alerts: boolean; watchlist_sell_alerts: boolean
  price_alerts: boolean; earnings_alerts: boolean
  bill_alerts: boolean; budget_alerts: boolean; goal_alerts: boolean; invoice_alerts: boolean
  sync_alerts: boolean; community_alerts: boolean
  reward_alerts: boolean; pledge_alerts: boolean; buddy_alerts: boolean
  email_mode: EmailMode; weekly_summary: boolean
  digest_sent_on?: string | null; weekly_sent_on?: string | null
}

export const DEFAULT_PREFS: NotifyPrefs = {
  stop_loss_pct: 10, take_profit_pct: 20,
  portfolio_sell_alerts: true, watchlist_buy_alerts: true, watchlist_sell_alerts: true,
  price_alerts: true, earnings_alerts: true,
  bill_alerts: true, budget_alerts: true, goal_alerts: true, invoice_alerts: true,
  sync_alerts: true, community_alerts: true,
  reward_alerts: true, pledge_alerts: true, buddy_alerts: true,
  email_mode: 'off', weekly_summary: false,
};

export async function prefsFor(userId: string): Promise<NotifyPrefs> {
  const { data } = await supabase.from('notification_prefs').select('*').eq('user_id', userId).maybeSingle();
  const p: any = { ...DEFAULT_PREFS };
  for (const [k, v] of Object.entries(data ?? {})) if (v !== null && v !== undefined) p[k] = v;
  return p;
}

// ── Writing ────────────────────────────────────────────────────────────────

export interface NewNotification {
  type: string
  title: string
  body: string
  ticker?: string | null
  link?: string | null
  /** Same key, same person: only the first is kept. */
  key?: string | null
  /** Record it as already seen: no unread count, no email. For batches summarised by another notification. */
  silent?: boolean
}

/** Adds to the feed. Returns false if it was already notified. */
export async function notify(userId: string, n: NewNotification): Promise<boolean> {
  const row: any = { user_id: userId, type: n.type, ticker: n.ticker ?? null, title: n.title, body: n.body, link: n.link ?? null, dedupe_key: n.key ?? null, ...(n.silent ? { read: true, emailed: true } : {}) };
  let { error } = await supabase.from('notifications').insert(row);
  if (error?.code === '23505') return false;
  // Before notifications_migration.sql: no link or key columns.
  if (error && /link|dedupe_key/.test(error.message)) {
    if (n.key) return false; // can't tell if it's a repeat, so don't risk sending it again and again
    ({ error } = await supabase.from('notifications').insert({ user_id: userId, type: n.type, ticker: n.ticker ?? null, title: n.title, body: n.body }));
  }
  if (error) { console.error('[notify] not saved:', error.message); return false; }
  return true;
}

// ── Dates in New Zealand time ─────────────────────────────────────────────

export function nzNow(d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(d).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday as string };
}
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const niceDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const money = (n: number) => n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 });
const isIncome = (c: any) => (c.kind ? c.kind === 'income' : c.name === 'Income' || c.name === 'Interest');

// ── Money checks ────────────────────────────────────────────────────────────

export async function checkMoney(userId: string, p?: NotifyPrefs): Promise<number> {
  const prefs = p ?? await prefsFor(userId);
  const today = nzNow().date;
  const month = today.slice(0, 7);
  let sent = 0;
  const add = async (n: NewNotification) => { if (await notify(userId, n)) sent++; };

  // Bills due in the next two days.
  if (prefs.bill_alerts) {
    const { data: bills } = await supabase.from('fin_bills').select('id, name, amount, next_due_date')
      .eq('user_id', userId).eq('is_active', true).gte('next_due_date', today).lte('next_due_date', addDays(today, 2));
    for (const b of bills ?? []) {
      const d = daysBetween(today, b.next_due_date);
      await add({
        type: 'bill_due', key: `bill:${b.id}:${b.next_due_date}`, link: '/app/finance/bills',
        title: `${b.name} is due ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : niceDate(b.next_due_date)}`,
        body: `${money(Number(b.amount) || 0)}. If it's already paid, tick it off on Bills.`,
      });
    }
  }

  // Budgets: nearly used (90%) and over, once each a month. Worked out even
  // with the person's own alerts off, since an accountability buddy may follow them.
  {
    const { data: cats } = await supabase.from('fin_categories').select('*')
      .eq('user_id', userId).eq('scope', 'household').gt('monthly_budget', 0);
    const budgets = (cats ?? []).filter(c => !isIncome(c));
    if (budgets.length) {
      const { data: txs } = await supabase.from('fin_transactions').select('category_id, amount')
        .eq('user_id', userId).gte('date', `${month}-01`).lt('amount', 0).in('category_id', budgets.map(c => c.id));
      const spent: Record<string, number> = {};
      for (const t of txs ?? []) spent[t.category_id] = (spent[t.category_id] ?? 0) + Math.abs(Number(t.amount));
      for (const c of budgets) {
        const budget = Number(c.monthly_budget);
        const s = spent[c.id] ?? 0;
        if (s > budget) {
          await notifyBuddies(userId, 'budgets', name => ({
            key: `buddy-budget:${c.id}:${month}`,
            title: `${name} went over their ${c.name} budget`,
            body: 'Over budget this month. A friendly nudge can help.',
          }));
          if (prefs.budget_alerts) await add({
            type: 'budget_over', key: `budget-over:${c.id}:${month}`, link: '/app/finance/budget',
            title: `Over budget on ${c.name}`,
            body: `${money(s)} spent this month against a budget of ${money(budget)}.`,
          });
        } else if (s >= budget * 0.9 && prefs.budget_alerts) {
          await add({
            type: 'budget_near', key: `budget-near:${c.id}:${month}`, link: '/app/finance/budget',
            title: `${c.name} budget is ${Math.round((s / budget) * 100)}% used`,
            body: `${money(budget - s)} left of ${money(budget)} for this month.`,
          });
        }
      }
    }
  }

  // Goals: reached, or past their date (buddies hear about missed ones).
  {
    const { data: goals } = await supabase.from('fin_goals').select('id, name, target_amount, current_amount, target_date')
      .eq('user_id', userId).eq('status', 'active');
    for (const g of goals ?? []) {
      const target = Number(g.target_amount), saved = Number(g.current_amount);
      if (target <= 0) continue;
      if (saved >= target) {
        if (prefs.goal_alerts) await add({
          type: 'goal_reached', key: `goal-done:${g.id}`, link: '/app/finance/savings/goals',
          title: `You reached your ${g.name} goal 🎉`,
          body: `${money(saved)} saved. Mark it complete on Goals, or set a new target.`,
        });
      } else if (g.target_date && g.target_date < today) {
        await notifyBuddies(userId, 'goals', name => ({
          key: `buddy-goal:${g.id}:${g.target_date}`,
          title: `${name} missed the date for their ${g.name} goal`,
          body: 'It passed its target date before it was reached. Maybe check in on how it is going.',
        }));
        if (prefs.goal_alerts) await add({
          type: 'goal_late', key: `goal-late:${g.id}:${g.target_date}`, link: '/app/finance/savings/goals',
          title: `${g.name} has passed its target date`,
          body: `${money(target - saved)} still to go. Pick a new date or change the target on Goals.`,
        });
      }
    }
  }

  // Business invoices that are now overdue.
  if (prefs.invoice_alerts) {
    const { data: invoices } = await supabase.from('business_invoices')
      .select('id, invoice_number, client_name, due_date, gst_excluded, items:business_invoice_items(quantity, unit_price)')
      .eq('user_id', userId).in('status', ['sent', 'overdue']).lt('due_date', today);
    if (invoices?.length) {
      const { data: settings } = await supabase.from('business_settings').select('gst_registered').eq('user_id', userId).maybeSingle();
      const gst = settings?.gst_registered ?? true;
      for (const inv of invoices) {
        const sub = ((inv as any).items ?? []).reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unit_price), 0);
        const total = gst && !inv.gst_excluded ? sub * 1.15 : sub;
        await add({
          type: 'invoice_overdue', key: `invoice-overdue:${inv.id}`, link: '/app/finance/business/invoices',
          title: `Invoice ${inv.invoice_number} to ${inv.client_name} is overdue`,
          body: `${money(total)} was due ${niceDate(inv.due_date)}.`,
        });
      }
    }
  }

  // Bank connection problems found by the background sync.
  if (prefs.sync_alerts) {
    const { data: c } = await supabase.from('akahu_connection_status').select('problem, detail').eq('user_id', userId).maybeSingle();
    if (c) {
      await add({
        type: 'sync_problem', key: `akahu:${c.problem}:${c.detail ?? ''}`, link: '/app/settings',
        title: c.problem === 'tokens' ? 'Your bank connection has stopped working' : `${c.detail ?? 'A bank'} needs reconnecting`,
        body: c.problem === 'tokens'
          ? "Your accounts aren't updating. Add fresh Akahu tokens in Settings."
          : "Reconnect it at my.akahu.nz, and your accounts will update again.",
      });
    }
  }
  return sent;
}

// ── Emails ──────────────────────────────────────────────────────────────────

async function send(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) return 'RESEND_API_KEY is not set';
  resend ??= new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: 'Fennec <alerts@fennecsi.com>', to, subject, html });
  return error ? error.message : null;
}

const wrap = (body: string) => `<div style="font-family:Arial,sans-serif;max-width:560px;color:#1a1a1a">${body}
<p style="color:#888;font-size:12px;margin-top:24px">Change what Fennec emails you in <a href="${site()}/app/alerts?tab=preferences">Notifications → Preferences</a>.</p></div>`;

async function emailOf(userId: string) {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

/** Emails someone's notifications not yet emailed (from the last day or so). */
export async function emailPending(userId: string, opts: { onlyTypes?: string[]; summary?: boolean } = {}): Promise<number> {
  let q = supabase.from('notifications').select('id, type, title, body, link')
    .eq('user_id', userId).eq('emailed', false).gte('created_at', new Date(Date.now() - 26 * 3600_000).toISOString())
    .order('created_at');
  if (opts.onlyTypes) q = q.in('type', opts.onlyTypes);
  const { data, error } = await q;
  if (error || !data?.length) return 0;
  const to = await emailOf(userId);
  if (!to) return 0;

  const items = data.map(n => `<li style="margin-bottom:10px"><a href="${site()}${escapeHtml(n.link || '/app/alerts')}" style="color:#1a1a1a;font-weight:bold">${escapeHtml(n.title)}</a><br><span style="color:#555">${escapeHtml(n.body)}</span></li>`).join('');
  const subject = data.length === 1 ? data[0].title : opts.summary ? `Your Fennec morning summary: ${data.length} updates` : `${data.length} updates from Fennec`;
  const err = await send(to, subject, wrap(`${opts.summary ? '<h2 style="font-size:18px">Good morning</h2>' : ''}<ul style="padding-left:18px">${items}</ul>`));
  if (err) { console.error('[notify] email failed:', err); return 0; }
  await supabase.from('notifications').update({ emailed: true }).in('id', data.map(n => n.id));
  return data.length;
}

/** For "straight away" and price alerts: send now unless emails are off. */
export async function emailNow(userId: string, prefs?: NotifyPrefs, onlyTypes?: string[]) {
  const p = prefs ?? await prefsFor(userId);
  if (p.email_mode === 'off') return 0;
  if (p.email_mode === 'daily' && !onlyTypes) return 0;
  return emailPending(userId, { onlyTypes: p.email_mode === 'immediate' ? undefined : onlyTypes });
}

async function weeklySummary(userId: string): Promise<boolean> {
  const to = await emailOf(userId);
  if (!to) return false;
  const today = nzNow().date;
  const month = today.slice(0, 7);
  const [{ data: cats }, { data: bills }, { data: goals }, { count: unread }] = await Promise.all([
    supabase.from('fin_categories').select('*').eq('user_id', userId).eq('scope', 'household').gt('monthly_budget', 0),
    supabase.from('fin_bills').select('name, amount, next_due_date').eq('user_id', userId).eq('is_active', true)
      .gte('next_due_date', today).lte('next_due_date', addDays(today, 7)).order('next_due_date'),
    supabase.from('fin_goals').select('name, target_amount, current_amount').eq('user_id', userId).eq('status', 'active'),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false),
  ]);
  const sections: string[] = [];

  const budgets = (cats ?? []).filter(c => !isIncome(c));
  if (budgets.length) {
    const { data: txs } = await supabase.from('fin_transactions').select('category_id, amount')
      .eq('user_id', userId).gte('date', `${month}-01`).lt('amount', 0).in('category_id', budgets.map(c => c.id));
    const spent = (txs ?? []).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const total = budgets.reduce((s, c) => s + Number(c.monthly_budget), 0);
    const over = budgets.filter(c => (txs ?? []).filter(t => t.category_id === c.id).reduce((s, t) => s + Math.abs(Number(t.amount)), 0) > Number(c.monthly_budget));
    sections.push(`<h3 style="font-size:15px">Budget this month</h3><p>${money(spent)} spent of ${money(total)} budgeted.${over.length ? ` Over on ${over.map(c => escapeHtml(c.name)).join(', ')}.` : ' Every category is within budget.'}</p>`);
  }
  if (bills?.length) {
    sections.push(`<h3 style="font-size:15px">Bills in the next 7 days</h3><ul style="padding-left:18px">${bills.map(b => `<li>${escapeHtml(b.name)}: ${money(Number(b.amount) || 0)}, ${niceDate(b.next_due_date)}</li>`).join('')}</ul>`);
  }
  const live = (goals ?? []).filter(g => Number(g.target_amount) > 0);
  if (live.length) {
    sections.push(`<h3 style="font-size:15px">Goals</h3><ul style="padding-left:18px">${live.map(g => `<li>${escapeHtml(g.name)}: ${Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100))}% of ${money(Number(g.target_amount))}</li>`).join('')}</ul>`);
  }
  if (!sections.length) return false; // nothing worth an email
  if (unread) sections.push(`<p><a href="${site()}/app/alerts">${unread} unread notification${unread === 1 ? '' : 's'}</a> in Fennec.</p>`);

  const err = await send(to, 'Your week with Fennec', wrap(`<h2 style="font-size:18px">Your week</h2>${sections.join('')}<p><a href="${site()}/app/dashboard">Open Fennec</a></p>`));
  if (err) { console.error('[notify] weekly email failed:', err); return false; }
  return true;
}

// ── Background jobs ─────────────────────────────────────────────────────────
// Every 15 minutes: send "straight away" emails, the 7am summaries, and on
// Mondays the weekly summary. Money checks run at 6am NZ time (before the
// summary) and every 6 hours; the dedupe keys stop repeats.

let ticking = false;
let lastMoneyRun = 0;
let lastMoneyDay = '';

async function allUserIds(): Promise<string[]> {
  const { data } = await supabase.from('profiles').select('id');
  return (data ?? []).map(p => p.id as string);
}

async function prefsMap(): Promise<Map<string, NotifyPrefs>> {
  const { data } = await supabase.from('notification_prefs').select('*');
  const m = new Map<string, NotifyPrefs>();
  for (const row of data ?? []) {
    const p: any = { ...DEFAULT_PREFS };
    for (const [k, v] of Object.entries(row)) if (v !== null && v !== undefined) p[k] = v;
    m.set(row.user_id, p);
  }
  return m;
}

async function saveSent(userId: string, patch: { digest_sent_on?: string; weekly_sent_on?: string }) {
  const { error } = await supabase.from('notification_prefs').upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });
  if (error) console.error('[notify] could not record send:', error.message);
}

export async function notificationTick() {
  if (ticking) return;
  ticking = true;
  try {
    const now = nzNow();
    const [ids, prefs] = await Promise.all([allUserIds(), prefsMap()]);
    const pOf = (id: string) => prefs.get(id) ?? DEFAULT_PREFS;

    // Money checks.
    const morning = now.hour >= 6 && lastMoneyDay !== now.date;
    if (morning || Date.now() - lastMoneyRun > 6 * 3600_000) {
      lastMoneyRun = Date.now();
      if (morning) lastMoneyDay = now.date;
      let made = 0;
      for (const id of ids) {
        try { made += await checkMoney(id, pOf(id)); made += await refreshFor(id, pOf(id)); }
        catch (e: any) { console.error(`[notify] money check ${id.slice(0, 8)} failed: ${e?.message ?? e}`); }
      }
      if (made) console.log(`[notify] ${made} money notification(s)`);
    }

    // Emails.
    const { data: pending } = await supabase.from('notifications').select('user_id')
      .eq('emailed', false).gte('created_at', new Date(Date.now() - 26 * 3600_000).toISOString());
    const waiting = new Set((pending ?? []).map(r => r.user_id as string));
    let emailed = 0;
    for (const id of waiting) {
      const p = pOf(id);
      try {
        if (p.email_mode === 'immediate') emailed += await emailPending(id);
        else if (p.email_mode === 'daily' && now.hour >= 7 && p.digest_sent_on !== now.date) {
          emailed += await emailPending(id, { summary: true });
          await saveSent(id, { digest_sent_on: now.date });
        }
      } catch (e: any) { console.error(`[notify] email ${id.slice(0, 8)} failed: ${e?.message ?? e}`); }
    }

    // Monday weekly summary.
    if (now.weekday === 'Mon' && now.hour >= 7) {
      for (const [id, p] of prefs) {
        if (!p.weekly_summary || p.weekly_sent_on === now.date) continue;
        try { if (await weeklySummary(id)) emailed++; await saveSent(id, { weekly_sent_on: now.date }); }
        catch (e: any) { console.error(`[notify] weekly ${id.slice(0, 8)} failed: ${e?.message ?? e}`); }
      }
    }
    if (emailed) console.log(`[notify] ${emailed} email(s) sent`);
  } catch (e: any) {
    console.error('[notify] run failed:', e?.message ?? e);
  } finally { ticking = false; }
}

export function startNotificationJobs() {
  setTimeout(notificationTick, 3 * 60 * 1000);
  setInterval(notificationTick, 15 * 60 * 1000);
  console.log('[notify] on: money checks daily at 6am NZ and every 6 hours, emails every 15 min');
}
