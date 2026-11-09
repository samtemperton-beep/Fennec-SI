import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';
import { fetchPrices, splitSymbol, type Market } from '../services/yahoo';
import { fetchEarningsCalendar } from '../services/finnhub';
import { notify, prefsFor, emailNow, checkMoney, DEFAULT_PREFS } from '../services/notify';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

// ── Notification feed ──────────────────────────────────────────────────────────

router.get('/notifications', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(150);
  res.json(data || []);
});

// For the bell in the top bar.
router.get('/notifications/unread-count', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('read', false);
  res.json({ count: count ?? 0 });
});

router.post('/notifications/mark-read', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : []; // empty = mark all
  let q = supabase.from('notifications').update({ read: true }).eq('user_id', user.id);
  if (ids.length) q = q.in('id', ids);
  await q;
  res.json({ ok: true });
});

// Clears read notifications.
router.delete('/notifications', requireAuth, async (req, res) => {
  const user = (req as any).user;
  await supabase.from('notifications').delete().eq('user_id', user.id).eq('read', true);
  res.json({ ok: true });
});

// ── Preferences ───────────────────────────────────────────────────────────────

const BOOL_PREFS = [
  'portfolio_sell_alerts', 'watchlist_buy_alerts', 'watchlist_sell_alerts', 'price_alerts', 'earnings_alerts',
  'bill_alerts', 'budget_alerts', 'goal_alerts', 'invoice_alerts', 'sync_alerts', 'community_alerts', 'weekly_summary',
] as const;
// Before notifications_migration.sql only these exist.
const OLD_COLUMNS = ['portfolio_sell_alerts', 'watchlist_buy_alerts', 'watchlist_sell_alerts', 'price_alerts'];

router.get('/prefs', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { digest_sent_on, weekly_sent_on, ...p } = await prefsFor(user.id) as any;
  res.json(p);
});

router.put('/prefs', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const b = req.body ?? {};
  const current = await prefsFor(user.id);
  const pct = (v: any, fallback: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 && n <= max ? Math.round(n) : fallback;
  };
  const prefs: Record<string, any> = {
    user_id: user.id,
    stop_loss_pct: pct(b.stop_loss_pct, current.stop_loss_pct, 99),
    take_profit_pct: pct(b.take_profit_pct, current.take_profit_pct, 1000),
    email_mode: ['immediate', 'daily', 'off'].includes(b.email_mode) ? b.email_mode : current.email_mode,
    updated_at: new Date().toISOString(),
  };
  for (const k of BOOL_PREFS) prefs[k] = typeof b[k] === 'boolean' ? b[k] : (current as any)[k];

  let { error } = await supabase.from('notification_prefs').upsert(prefs, { onConflict: 'user_id' });
  if (error && /column/.test(error.message)) {
    const old: Record<string, any> = { user_id: user.id, stop_loss_pct: prefs.stop_loss_pct, take_profit_pct: prefs.take_profit_pct, updated_at: prefs.updated_at };
    for (const k of OLD_COLUMNS) old[k] = prefs[k];
    ({ error } = await supabase.from('notification_prefs').upsert(old, { onConflict: 'user_id' }));
  }
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Alert check ───────────────────────────────────────────────────────────────

// "FPH.NZ" -> "FPH (NZX)"; prices with their currency, since an alert on an NZX
// share is in NZ dollars and one on a US share in US dollars.
const CURRENCY: Record<Market, string> = { NZX: 'NZ$', ASX: 'A$', US: 'US$' };
const label = (symbol: string) => { const s = splitSymbol(symbol); return `${s.code} (${s.market})`; };
const money = (symbol: string, n: number) => `${CURRENCY[splitSymbol(symbol).market]}${Number(n).toFixed(2)}`;

/**
 * Checks one person's alerts and writes notifications. Price alerts are
 * emailed straight away (unless emails are off); the rest follow the person's
 * email choice (services/notify.ts). Each is notified once: a key per holding
 * and threshold, per watchlist rating, per earnings date.
 * Used by "Check now" and by the background checker (startAlertChecks).
 * priceOnly: just the price targets, for the frequent background run.
 */
export async function checkAlertsForUser(user: { id: string; email?: string | null }, opts: { priceOnly?: boolean } = {}) {
  const triggered: any[] = [];
  const p = await prefsFor(user.id).catch(() => DEFAULT_PREFS);

  // 1. Price alerts
  if (p.price_alerts !== false) {
    const { data: alerts } = await supabase.from('alerts').select('*').eq('user_id', user.id).eq('triggered', false);
    if (alerts?.length) {
      const tickers = [...new Set(alerts.map((a: any) => a.ticker))];
      const prices = await fetchPrices(tickers as string[]);

      for (const alert of alerts) {
        const priceData = prices[alert.ticker];
        const price = typeof priceData === 'object' ? priceData.price : priceData;
        if (!price) continue;
        const hit =
          (alert.type === 'above' && price >= alert.price) ||
          (alert.type === 'below' && price <= alert.price);
        if (!hit) continue;
        // Claim it first, so "Check now" and the background run can't both send it.
        const { data: claimed } = await supabase.from('alerts').update({ triggered: true })
          .eq('id', alert.id).eq('triggered', false).select('id');
        if (!claimed?.length) continue;
        triggered.push({ ...alert, current_price: price, category: 'price' });
        const name = typeof priceData === 'object' && priceData.name ? ` ${priceData.name}` : '';
        await notify(user.id, {
          type: 'price_alert', ticker: alert.ticker, link: '/app/alerts', key: `price:${alert.id}`,
          title: `${label(alert.ticker)} hit your price target`,
          body: `${label(alert.ticker)}${name} is now ${money(alert.ticker, price)}. Your alert for ${alert.type} ${money(alert.ticker, alert.price)} was triggered.`,
        });
      }
      if (triggered.length) await emailNow(user.id, p, ['price_alert']).catch(() => 0);
    }
  }
  if (opts.priceOnly) return triggered;

  // 2. Holdings past your stop-loss or take-profit percentage, once per holding
  //    and threshold (again if the buy price or threshold changes).
  if (p.portfolio_sell_alerts) {
    const { data: holdings } = await supabase.from('holdings').select('*').eq('user_id', user.id);
    if (holdings?.length) {
      // NZX and ASX holdings are priced by their exchange symbol (FPH.NZ, not the US "FPH").
      const symbolOf = (h: any) => {
        const t = String(h.ticker).toUpperCase();
        const suffix = h.market === 'NZX' ? '.NZ' : h.market === 'ASX' ? '.AX' : '';
        return suffix && !t.endsWith(suffix) ? t + suffix : t;
      };
      const prices = await fetchPrices([...new Set(holdings.map(symbolOf))]);
      for (const h of holdings) {
        const sym = symbolOf(h);
        const priceData = prices[sym];
        const current = typeof priceData === 'object' ? priceData.price : priceData;
        if (!current || !h.buy_price) continue;
        const changePct = ((current - h.buy_price) / h.buy_price) * 100;

        if (changePct <= -(p.stop_loss_pct || 10)) {
          if (await notify(user.id, {
            type: 'stop_loss', ticker: h.ticker, link: '/app/portfolio', key: `stoploss:${h.id}:${p.stop_loss_pct}:${h.buy_price}`,
            title: `${label(sym)} is down ${Math.abs(changePct).toFixed(1)}% from your buy price`,
            body: `It's now ${money(sym, current)}, against your buy price of ${money(sym, h.buy_price)}. You asked to hear when a holding falls ${p.stop_loss_pct}%.`,
          })) triggered.push({ ticker: h.ticker, category: 'stop_loss', changePct: changePct.toFixed(1) });
        } else if (changePct >= (p.take_profit_pct || 20)) {
          if (await notify(user.id, {
            type: 'take_profit', ticker: h.ticker, link: '/app/portfolio', key: `takeprofit:${h.id}:${p.take_profit_pct}:${h.buy_price}`,
            title: `${label(sym)} is up ${changePct.toFixed(1)}% from your buy price`,
            body: `It's now ${money(sym, current)}, against your buy price of ${money(sym, h.buy_price)}. You asked to hear when a holding gains ${p.take_profit_pct}%.`,
          })) triggered.push({ ticker: h.ticker, category: 'take_profit', changePct: changePct.toFixed(1) });
        }
      }
    }
  }

  // 3. Watchlist AI ratings, once per rating (again if it changes).
  if (p.watchlist_buy_alerts || p.watchlist_sell_alerts) {
    const { data: watchlist } = await supabase.from('watchlist').select('*').eq('user_id', user.id).in('signal', ['BUY', 'SELL']);
    for (const w of watchlist ?? []) {
      if (w.signal === 'BUY' ? !p.watchlist_buy_alerts : !p.watchlist_sell_alerts) continue;
      if (await notify(user.id, {
        type: 'watchlist_signal', ticker: w.ticker, link: '/app/watchlist', key: `watch:${w.id}:${w.signal}`,
        title: `${w.ticker}: Fennec's AI rating is ${w.signal}`,
        body: `${w.name || w.ticker} on your watchlist is rated ${w.signal} by Fennec's automated analysis. It's a computer-generated signal, not advice; see the reasons on Watchlist.`,
      })) triggered.push({ ticker: w.ticker, category: 'watchlist_signal', signal: w.signal });
    }
  }

  // 4. Earnings reminders (1 day ahead)
  if (p.earnings_alerts !== false) {
    const { data: holdings } = await supabase.from('holdings').select('ticker').eq('user_id', user.id);
    const { data: watchlist } = await supabase.from('watchlist').select('ticker').eq('user_id', user.id);
    const allTickers = [...new Set([...(holdings || []), ...(watchlist || [])].map((x: any) => x.ticker))];
    if (allTickers.length) {
      try {
        const upcoming = await fetchEarningsCalendar(allTickers, 2, 0);
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        for (const ev of upcoming) {
          if (ev.date !== tomorrow) continue;
          const timeLabel = ev.hour === 'bmo' ? 'before market open' : ev.hour === 'amc' ? 'after market close' : '';
          if (await notify(user.id, {
            type: 'earnings_reminder', ticker: ev.symbol, link: '/app/portfolio', key: `earnings:${ev.symbol}:${ev.date}`,
            title: `${ev.symbol} reports earnings tomorrow`,
            body: `${ev.symbol} Q${ev.quarter} ${ev.year} results are due tomorrow${timeLabel ? ' ' + timeLabel : ''} (US time).${ev.epsEstimate != null ? ` Analysts expect earnings of US$${ev.epsEstimate.toFixed(2)} a share.` : ''}`,
          })) triggered.push({ ticker: ev.symbol, category: 'earnings_reminder' });
        }
      } catch {}
    }
  }

  return triggered;
}

router.post('/check', requireAuth, async (req, res) => {
  const user = (req as any).user;
  try {
    const triggered = await checkAlertsForUser({ id: user.id, email: user.email });
    // Bills, budgets, goals, invoices and bank problems too.
    const money = await checkMoney(user.id).catch(() => 0);
    res.json({ triggered, count: triggered.length + money });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Background checks ─────────────────────────────────────────────────────────
// Price targets every 15 minutes (only people with an alert waiting), and the
// rest (stop-loss, take-profit, watchlist signals, earnings reminders) every
// 6 hours for everyone. Started from index.ts with the scheduled sync, so only
// on the deployed server.

const PRICE_EVERY_MS = 15 * 60 * 1000;
const FULL_EVERY_MS = 6 * 60 * 60 * 1000;
let priceRunning = false;
let fullRunning = false;

async function emailOf(id: string) {
  const { data } = await supabase.auth.admin.getUserById(id);
  return data?.user?.email ?? null;
}

async function runFor(ids: string[], priceOnly: boolean) {
  let fired = 0;
  for (const id of ids) {
    try {
      fired += (await checkAlertsForUser({ id, email: await emailOf(id) }, { priceOnly })).length;
    } catch (e: any) {
      console.error(`[alerts] user ${id.slice(0, 8)} check failed: ${e?.message ?? e}`);
    }
  }
  return fired;
}

export function startAlertChecks() {
  async function priceTick() {
    if (priceRunning) return;
    priceRunning = true;
    try {
      const { data } = await supabase.from('alerts').select('user_id').eq('triggered', false);
      const ids = [...new Set((data ?? []).map((r: any) => r.user_id as string))];
      const fired = await runFor(ids, true);
      if (fired) console.log(`[alerts] ${fired} price alert(s) sent`);
    } catch (e: any) {
      console.error('[alerts] price run failed:', e?.message ?? e);
    } finally { priceRunning = false; }
  }
  async function fullTick() {
    if (fullRunning) return;
    fullRunning = true;
    try {
      const [h, w] = await Promise.all([
        supabase.from('holdings').select('user_id'),
        supabase.from('watchlist').select('user_id'),
      ]);
      const ids = [...new Set([...(h.data ?? []), ...(w.data ?? [])].map((r: any) => r.user_id as string))];
      const fired = await runFor(ids, false);
      console.log(`[alerts] full check: ${ids.length} users, ${fired} notification(s)`);
    } catch (e: any) {
      console.error('[alerts] full run failed:', e?.message ?? e);
    } finally { fullRunning = false; }
  }
  setTimeout(priceTick, 60 * 1000);
  setInterval(priceTick, PRICE_EVERY_MS);
  setTimeout(fullTick, 5 * 60 * 1000);
  setInterval(fullTick, FULL_EVERY_MS);
  console.log('[alerts] background checks on: price targets every 15 min, everything else every 6 hours');
}

export default router;
