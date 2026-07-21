import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';
import { fetchPrices } from '../services/yahoo';
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

router.post('/check', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const triggered: any[] = [];

  // Load prefs
  const { data: prefs } = await supabase.from('notification_prefs').select('*').eq('user_id', user.id).single();
  const p = prefs || { frequency: 'morning', stop_loss_pct: 10, take_profit_pct: 20, portfolio_sell_alerts: true, watchlist_buy_alerts: true, watchlist_sell_alerts: true, price_alerts: true, earnings_alerts: true };

  // 1. Price alerts (existing)
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
        if (hit) {
          triggered.push({ ...alert, current_price: price, category: 'price' });
          await supabase.from('alerts').update({ triggered: true }).eq('id', alert.id);
          await writeNotification(
            user.id, 'price_alert', alert.ticker,
            `${alert.ticker} hit your price target`,
            `${alert.ticker} is now $${price.toFixed(2)} — your alert for price ${alert.type} $${alert.price} was triggered.`
          );
          try {
            const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).single();
            await resend.emails.send({
              from: 'Fennec SI <alerts@fennecsi.app>',
              to: user.email,
              subject: `Alert: ${alert.ticker} ${alert.type} $${alert.price}`,
              html: `<h2>Fennec SI Alert</h2><p>Hi ${profile?.username || 'there'},</p><p>${alert.ticker} is now $${price.toFixed(2)} — your ${alert.type} $${alert.price} alert was triggered.</p><p><a href="${process.env.FRONTEND_URL}/app/alerts">View alerts</a></p>`,
            });
          } catch {}
        }
      }
    }
  }

  // 2. Portfolio stop-loss / take-profit
  if (p.portfolio_sell_alerts) {
    const { data: holdings } = await supabase.from('holdings').select('*').eq('user_id', user.id);
    if (holdings?.length) {
      const holdingTickers = holdings.map((h: any) => h.ticker);
      const prices = await fetchPrices(holdingTickers);
      for (const h of holdings) {
        const priceData = prices[h.ticker];
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

  res.json({ triggered, count: triggered.length });
});

export default router;
