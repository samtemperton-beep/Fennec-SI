import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';
import { fetchPrices, splitSymbol, type Market } from '../services/yahoo';
import { fetchEarningsCalendar } from '../services/finnhub';
import { Resend } from 'resend';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

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
    .limit(100);
  res.json(data || []);
});

router.post('/notifications/mark-read', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { ids } = req.body; // empty = mark all
  const q = supabase.from('notifications').update({ read: true }).eq('user_id', user.id);
  if (ids?.length) q.in('id', ids);
  await q;
  res.json({ ok: true });
});

// ── Preferences ───────────────────────────────────────────────────────────────

router.get('/prefs', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { data } = await supabase
    .from('notification_prefs')
    .select('*')
    .eq('user_id', user.id)
    .single();
  res.json(data || {
    frequency: 'morning',
    stop_loss_pct: 10,
    take_profit_pct: 20,
    portfolio_sell_alerts: true,
    watchlist_buy_alerts: true,
    watchlist_sell_alerts: true,
    price_alerts: true,
  });
});

router.put('/prefs', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const prefs = {
    user_id: user.id,
    frequency: req.body.frequency ?? 'morning',
    stop_loss_pct: req.body.stop_loss_pct ?? 10,
    take_profit_pct: req.body.take_profit_pct ?? 20,
    portfolio_sell_alerts: req.body.portfolio_sell_alerts ?? true,
    watchlist_buy_alerts: req.body.watchlist_buy_alerts ?? true,
    watchlist_sell_alerts: req.body.watchlist_sell_alerts ?? true,
    price_alerts: req.body.price_alerts ?? true,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('notification_prefs').upsert(prefs, { onConflict: 'user_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Alert check ───────────────────────────────────────────────────────────────

async function writeNotification(userId: string, type: string, ticker: string | null, title: string, body: string) {
  await supabase.from('notifications').insert({ user_id: userId, type, ticker, title, body });
}

// "FPH.NZ" -> "FPH (NZX)"; prices with their currency, since an alert on an NZX
// share is in NZ dollars and one on a US share in US dollars.
const CURRENCY: Record<Market, string> = { NZX: 'NZ$', ASX: 'A$', US: 'US$' };
const label = (symbol: string) => { const s = splitSymbol(symbol); return `${s.code} (${s.market})`; };
const money = (symbol: string, n: number) => `${CURRENCY[splitSymbol(symbol).market]}${Number(n).toFixed(2)}`;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * Checks one person's alerts and writes notifications (and emails price alerts).
 * Used by "Check now" and by the background checker (startAlertChecks).
 * priceOnly: just the price targets, for the frequent background run.
 */
export async function checkAlertsForUser(user: { id: string; email?: string | null }, opts: { priceOnly?: boolean } = {}) {
  const triggered: any[] = [];

  // Load prefs
  const { data: prefs } = await supabase.from('notification_prefs').select('*').eq('user_id', user.id).maybeSingle();
  const p = prefs || { stop_loss_pct: 10, take_profit_pct: 20, portfolio_sell_alerts: true, watchlist_buy_alerts: true, watchlist_sell_alerts: true, price_alerts: true, earnings_alerts: true };

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
        const what = `${label(alert.ticker)}${name} is now ${money(alert.ticker, price)}. Your alert for ${alert.type} ${money(alert.ticker, alert.price)} was triggered.`;
        await writeNotification(user.id, 'price_alert', alert.ticker, `${label(alert.ticker)} hit your price target`, what);
        if (!user.email) continue;
        try {
          const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
          await resend.emails.send({
            from: 'Fennec <alerts@fennecsi.com>',
            to: user.email,
            subject: `Alert: ${label(alert.ticker)} ${alert.type} ${money(alert.ticker, alert.price)}`,
            html: `<h2>Fennec SI Alert</h2><p>Hi ${esc(profile?.username || 'there')},</p><p>${esc(what)}</p><p><a href="${process.env.FRONTEND_URL}/app/alerts">View alerts</a></p>`,
          });
        } catch {}
      }
    }
  }
  if (opts.priceOnly) return triggered;

  // 2. Portfolio stop-loss / take-profit
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
        const priceData = prices[symbolOf(h)];
        const current = typeof priceData === 'object' ? priceData.price : priceData;
        if (!current || !h.buy_price) continue;
        const changePct = ((current - h.buy_price) / h.buy_price) * 100;

        // Check we haven't already notified recently (last 24h)
        const since = new Date(Date.now() - 86400000).toISOString();
        const { data: recent } = await supabase.from('notifications')
          .select('id').eq('user_id', user.id).eq('ticker', h.ticker)
          .in('type', ['stop_loss', 'take_profit'])
          .gte('created_at', since).limit(1);
        if (recent?.length) continue;

        if (changePct <= -(p.stop_loss_pct || 10)) {
          triggered.push({ ticker: h.ticker, category: 'stop_loss', changePct: changePct.toFixed(1) });
          await writeNotification(
            user.id, 'stop_loss', h.ticker,
            `Stop loss: ${h.ticker} is down ${Math.abs(changePct).toFixed(1)}%`,
            `${h.ticker} has fallen ${Math.abs(changePct).toFixed(1)}% from your buy price of $${h.buy_price}. Current price: $${current.toFixed(2)}. Consider reviewing your position.`
          );
        } else if (changePct >= (p.take_profit_pct || 20)) {
          triggered.push({ ticker: h.ticker, category: 'take_profit', changePct: changePct.toFixed(1) });
          await writeNotification(
            user.id, 'take_profit', h.ticker,
            `Take profit: ${h.ticker} is up ${changePct.toFixed(1)}%`,
            `${h.ticker} has gained ${changePct.toFixed(1)}% from your buy price of $${h.buy_price}. Current price: $${current.toFixed(2)}. You may want to lock in some gains.`
          );
        }
      }
    }
  }

  // 3. Watchlist buy/sell signals
  if (p.watchlist_buy_alerts) {
    const { data: watchlist } = await supabase.from('watchlist').select('*').eq('user_id', user.id).not('signal', 'is', null);
    if (watchlist?.length) {
      for (const w of watchlist) {
        if (!w.signal) continue;
        const since = new Date(Date.now() - 86400000).toISOString();
        const { data: recent } = await supabase.from('notifications')
          .select('id').eq('user_id', user.id).eq('ticker', w.ticker)
          .eq('type', 'watchlist_signal').gte('created_at', since).limit(1);
        if (recent?.length) continue;

        if (w.signal === 'BUY' && p.watchlist_buy_alerts !== false) {
          triggered.push({ ticker: w.ticker, category: 'watchlist_signal', signal: 'BUY' });
          await writeNotification(
            user.id, 'watchlist_signal', w.ticker,
            `${w.ticker} signals BUY`,
            `${w.name || w.ticker} on your watchlist has a BUY signal. This could be a good entry point — review the analysis before acting.`
          );
        } else if (w.signal === 'SELL' && p.watchlist_sell_alerts !== false) {
          triggered.push({ ticker: w.ticker, category: 'watchlist_signal', signal: 'SELL' });
          await writeNotification(
            user.id, 'watchlist_signal', w.ticker,
            `${w.ticker} signals SELL`,
            `${w.name || w.ticker} on your watchlist has a SELL signal. If you hold this, consider reviewing your position.`
          );
        }
      }
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
          const since = new Date(Date.now() - 86400000).toISOString();
          const { data: recent } = await supabase.from('notifications')
            .select('id').eq('user_id', user.id).eq('ticker', ev.symbol)
            .eq('type', 'earnings_reminder').gte('created_at', since).limit(1);
          if (recent?.length) continue;
          const timeLabel = ev.hour === 'bmo' ? 'before market open' : ev.hour === 'amc' ? 'after market close' : '';
          triggered.push({ ticker: ev.symbol, category: 'earnings_reminder' });
          await writeNotification(
            user.id, 'earnings_reminder', ev.symbol,
            `${ev.symbol} reports earnings tomorrow`,
            `${ev.symbol} Q${ev.quarter} ${ev.year} earnings are tomorrow${timeLabel ? ' ' + timeLabel : ''}.${ev.epsEstimate != null ? ` EPS estimate: $${ev.epsEstimate.toFixed(2)}.` : ''} Review your position before the report.`
          );
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
    res.json({ triggered, count: triggered.length });
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
