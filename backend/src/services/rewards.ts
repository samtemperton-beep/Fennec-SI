import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';
import { notify, nzNow, prefsFor, type NotifyPrefs } from './notify';

// Budget rewards, no-spend pledges and accountability buddies (rewards_migration.sql).
//
// Rewards are worked out from what's already in Fennec (budgets, transactions,
// goals, pledges), so they can't be gamed by ticking a box. Each one is a row
// in money_rewards keyed by what it was for (a week, a badge), so running this
// again never counts anything twice. Keep BADGES in step with frontend/lib/rewards.ts.

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

export const BADGES: Record<string, { name: string; icon: string; points: number }> = {
  budget_set:   { name: 'Plan Made',        icon: '📝', points: 20 },
  week_1:       { name: 'First Week Win',   icon: '🌱', points: 25 },
  streak_4:     { name: 'Month of Wins',    icon: '🔥', points: 75 },
  streak_8:     { name: 'On a Roll',        icon: '⚡', points: 150 },
  streak_12:    { name: 'Unstoppable',      icon: '🏆', points: 250 },
  month_1:      { name: 'Month Mastered',   icon: '📅', points: 50 },
  month_3:      { name: 'Quarter Champ',    icon: '🥇', points: 150 },
  pledge_made:  { name: 'Line Drawn',       icon: '✋', points: 15 },
  pledge_30:    { name: '30 Days Strong',   icon: '💪', points: 100 },
  pledge_90:    { name: 'Habit Broken',     icon: '🧠', points: 250 },
  buddy_added:  { name: 'Got a Buddy',      icon: '🤝', points: 25 },
  goal_reached: { name: 'Goal Getter',      icon: '🎯', points: 150 },
  sorted_100:   { name: 'Tidy Books',       icon: '🧹', points: 30 },
  saved_1000:   { name: 'First $1k Saved',  icon: '💰', points: 100 },
};
export const WEEK_POINTS = 25;
export const MONTH_POINTS = 100;
export const PLEDGE_WEEK_POINTS = 20;

// ── Dates (transaction dates are New Zealand dates) ──────────────────────────

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (iso: string) => { const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); return addDays(iso, -((dow + 6) % 7)); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const nzDate = (ts: string) => nzNow(new Date(ts)).date;
const money = (n: number) => n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 });
const isIncome = (c: any) => (c.kind ? c.kind === 'income' : c.name === 'Income' || c.name === 'Interest');

// ── Pledge matching ─────────────────────────────────────────────────────────
// "UBER *EATS" and "uber eats" both become "ubereats", so spacing and symbols
// in bank descriptions don't matter.
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
export function matchesPledge(description: string | null | undefined, keywords: string[]) {
  const d = compact(description ?? '');
  return !!d && keywords.some(k => { const c = compact(k); return c.length >= 3 && d.includes(c); });
}

async function usernameOf(userId: string) {
  const { data } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle();
  return (data?.username as string | null) || 'Your buddy';
}

/** Tells someone's active buddies, if the owner shares this kind of thing. */
export async function notifyBuddies(ownerId: string, what: 'slip' | 'budgets' | 'goals', make: (name: string, shareAmounts: boolean) => { title: string; body: string; key: string }) {
  const { data: rows, error } = await supabase.from('buddies').select('buddy_id, share_amounts, share_budgets, share_goals')
    .eq('owner_id', ownerId).eq('status', 'active');
  if (error || !rows?.length) return 0;
  const name = await usernameOf(ownerId);
  let sent = 0;
  for (const b of rows) {
    if (!b.buddy_id) continue;
    if (what === 'budgets' && !b.share_budgets) continue;
    if (what === 'goals' && !b.share_goals) continue;
    const prefs = await prefsFor(b.buddy_id);
    if ((prefs as any).buddy_alerts === false) continue;
    const n = make(name, b.share_amounts);
    if (await notify(b.buddy_id, { type: 'buddy_update', title: n.title, body: n.body, key: `${n.key}:${b.buddy_id}`, link: '/app/finance/budget/pledges' })) sent++;
  }
  return sent;
}

// ── Pledges ─────────────────────────────────────────────────────────────────

export async function checkPledges(userId: string, prefs?: NotifyPrefs): Promise<number> {
  const p: any = prefs ?? await prefsFor(userId);
  const { data: pledges, error } = await supabase.from('pledges').select('id, name, keywords, created_at').eq('user_id', userId).eq('active', true);
  if (error || !pledges?.length) return 0;
  const since = pledges.map(pl => nzDate(pl.created_at)).sort()[0];
  const { data: txs } = await supabase.from('fin_transactions').select('id, date, description, amount')
    .eq('user_id', userId).lt('amount', 0).gte('date', since).limit(2000);
  const found: any[] = [];
  for (const pl of pledges) {
    const from = nzDate(pl.created_at);
    for (const t of txs ?? []) {
      if (t.date >= from && matchesPledge(t.description, pl.keywords)) {
        found.push({ pledge_id: pl.id, user_id: userId, transaction_id: t.id, description: t.description, amount: Math.abs(Number(t.amount)), date: t.date });
      }
    }
  }
  if (!found.length) return 0;
  const { data: added, error: e2 } = await supabase.from('pledge_slips')
    .upsert(found, { onConflict: 'pledge_id,transaction_id', ignoreDuplicates: true }).select('id, pledge_id, amount, date');
  if (e2) { console.error('[rewards] slips not saved:', e2.message); return 0; }

  let sent = 0;
  for (const s of added ?? []) {
    const pl = pledges.find(x => x.id === s.pledge_id)!;
    const when = new Date(`${s.date}T12:00:00Z`).toLocaleDateString('en-NZ', { weekday: 'long', timeZone: 'UTC' });
    if (p.pledge_alerts !== false && await notify(userId, {
      type: 'pledge_slip', key: `slip:${s.id}`, link: '/app/finance/budget/pledges',
      title: `A slip on your “${pl.name}” pledge`,
      body: `${money(Number(s.amount))} on ${when}. Your streak starts again from today. One slip doesn't undo the progress you've made.`,
    })) sent++;
    sent += await notifyBuddies(userId, 'slip', (name, amounts) => ({
      key: `buddyslip:${s.id}`,
      title: `${name} slipped on their “${pl.name}” pledge`,
      body: `${amounts ? `${money(Number(s.amount))} on ${when}. ` : `On ${when}. `}A quick message of support can help them get back on track.`,
    }));
  }
  return sent;
}

// ── Rewards ─────────────────────────────────────────────────────────────────

export interface RewardRow { kind: string; ref: string; points: number }

export async function computeRewards(userId: string, prefs?: NotifyPrefs): Promise<number> {
  const p: any = prefs ?? await prefsFor(userId);
  const today = nzNow().date;
  const windowStart = addDays(today, -100);

  const [cats, txs, goals, pledges, slips, buddies, sorted, existing] = await Promise.all([
    supabase.from('fin_categories').select('*').eq('user_id', userId).eq('scope', 'household').gt('monthly_budget', 0),
    supabase.from('fin_transactions').select('date, amount, category_id').eq('user_id', userId).gte('date', windowStart).limit(10000),
    supabase.from('fin_goals').select('status, target_amount, current_amount').eq('user_id', userId),
    supabase.from('pledges').select('id, created_at, active').eq('user_id', userId),
    supabase.from('pledge_slips').select('pledge_id, date').eq('user_id', userId),
    supabase.from('buddies').select('id').eq('status', 'active').or(`owner_id.eq.${userId},buddy_id.eq.${userId}`).limit(1),
    supabase.from('fin_transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId).not('category_id', 'is', null),
    supabase.from('money_rewards').select('kind, ref').eq('user_id', userId),
  ]);
  if (existing.error) return 0; // before rewards_migration.sql

  const have = new Set((existing.data ?? []).map(r => `${r.kind}:${r.ref}`));
  const rows: RewardRow[] = [];
  const earn = (kind: string, ref: string, points: number) => {
    if (!have.has(`${kind}:${ref}`)) { have.add(`${kind}:${ref}`); rows.push({ kind, ref, points }); }
  };
  const badge = (id: string) => earn('badge', id, BADGES[id].points);

  // Budgets: each full week (Monday to Sunday) and month at or under budget.
  const budgets = (cats.data ?? []).filter(c => !isIncome(c));
  const budgetIds = new Set(budgets.map(c => c.id));
  const monthlyBudget = budgets.reduce((s, c) => s + Number(c.monthly_budget), 0);
  const allTx = txs.data ?? [];
  if (budgets.length >= 3) badge('budget_set');
  if (monthlyBudget > 0) {
    const spentBetween = (from: string, to: string) => {
      const inRange = allTx.filter(t => t.date >= from && t.date <= to);
      if (!inRange.length) return null; // no data that week: not a win, not a loss
      return inRange.filter(t => Number(t.amount) < 0 && budgetIds.has(t.category_id)).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    };
    const thisMonday = mondayOf(today);
    for (let k = 1; k <= 8; k++) {
      const ws = addDays(thisMonday, -7 * k);
      if (ws < windowStart) break;
      const spent = spentBetween(ws, addDays(ws, 6));
      if (spent !== null && spent <= monthlyBudget * 12 / 52) earn('week_under', ws, WEEK_POINTS);
    }
    for (let m = 1; m <= 3; m++) {
      const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - m);
      const start = d.toISOString().slice(0, 10);
      if (start < windowStart) break;
      const end = addDays(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12)).toISOString().slice(0, 10), -1);
      const spent = spentBetween(start, end);
      if (spent !== null && spent <= monthlyBudget) earn('month_under', start.slice(0, 7), MONTH_POINTS);
    }
  }
  const weeks = [...have].filter(k => k.startsWith('week_under:')).map(k => k.slice(11));
  if (weeks.length) badge('week_1');
  const streak = weekStreak(weeks, today);
  if (streak >= 4) badge('streak_4');
  if (streak >= 8) badge('streak_8');
  if (streak >= 12) badge('streak_12');
  const months = [...have].filter(k => k.startsWith('month_under:')).length;
  if (months >= 1) badge('month_1');
  if (months >= 3) badge('month_3');

  // Pledges: each full week without a slip, and 30 and 90 days kept.
  if (pledges.data?.length) badge('pledge_made');
  for (const pl of (pledges.data ?? []).filter(x => x.active)) {
    const start = nzDate(pl.created_at);
    const mine = (slips.data ?? []).filter(s => s.pledge_id === pl.id).map(s => s.date).sort();
    for (let k = 1; k <= 8; k++) {
      const ws = addDays(mondayOf(today), -7 * k);
      if (ws < start) break;
      const we = addDays(ws, 6);
      if (!mine.some(d => d >= ws && d <= we)) earn('pledge_week', `${pl.id}:${ws}`, PLEDGE_WEEK_POINTS);
    }
    const kept = daysBetween(mine.length ? mine[mine.length - 1] : start, today);
    if (kept >= 30) badge('pledge_30');
    if (kept >= 90) badge('pledge_90');
  }

  if (buddies.data?.length) badge('buddy_added');
  const g = goals.data ?? [];
  if (g.some(x => x.status === 'completed' || (Number(x.target_amount) > 0 && Number(x.current_amount) >= Number(x.target_amount)))) badge('goal_reached');
  if (g.reduce((s, x) => s + (Number(x.current_amount) || 0), 0) >= 1000) badge('saved_1000');
  if ((sorted.count ?? 0) >= 100) badge('sorted_100');

  if (!rows.length) return 0;
  const { error } = await supabase.from('money_rewards')
    .upsert(rows.map(r => ({ user_id: userId, ...r })), { onConflict: 'user_id,kind,ref', ignoreDuplicates: true });
  if (error) { console.error('[rewards] not saved:', error.message); return 0; }

  let sent = 0;
  if (p.reward_alerts !== false) {
    for (const r of rows.filter(x => x.kind === 'badge')) {
      const b = BADGES[r.ref];
      if (await notify(userId, {
        type: 'badge_earned', key: `badge:${r.ref}`, link: '/app/finance/budget/wins',
        title: `New badge: ${b.icon} ${b.name}`,
        body: `+${b.points} points. See all your badges and your level on Budget → Wins.`,
      })) sent++;
    }
  }
  return sent;
}

/** Weeks in a row under budget, ending with last week (or this week if it's in). */
export function weekStreak(weekStarts: string[], today: string) {
  const set = new Set(weekStarts);
  let ws = addDays(mondayOf(today), -7);
  if (!set.has(ws) && set.has(mondayOf(today))) ws = mondayOf(today);
  let n = 0;
  while (set.has(ws)) { n++; ws = addDays(ws, -7); }
  return n;
}

/** Pledges and rewards for one person: from the background run and when Budget opens. */
export async function refreshFor(userId: string, prefs?: NotifyPrefs) {
  const p = prefs ?? await prefsFor(userId);
  let n = 0;
  try { n += await checkPledges(userId, p); } catch (e: any) { console.error(`[rewards] pledges ${userId.slice(0, 8)}: ${e?.message ?? e}`); }
  try { n += await computeRewards(userId, p); } catch (e: any) { console.error(`[rewards] rewards ${userId.slice(0, 8)}: ${e?.message ?? e}`); }
  return n;
}
