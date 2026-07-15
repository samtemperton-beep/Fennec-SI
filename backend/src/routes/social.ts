import { Router } from 'express';
import { getCached, setCached } from '../services/cache';

const router = Router();

router.get('/sentiment/:ticker', async (req, res) => {
  const { ticker } = req.params;
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  const cacheKey = `stocktwits:${ticker.toUpperCase()}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const r = await fetch(`https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json?limit=30`);
    if (!r.ok) return res.status(r.status).json({ error: 'StockTwits error' });
    const data: any = await r.json();

    const symbol = data.symbol || {};
    const messages: any[] = data.messages || [];

    let bullish = 0;
    let bearish = 0;
    for (const m of messages) {
      const s = m.entities?.sentiment?.basic;
      if (s === 'Bullish') bullish++;
      else if (s === 'Bearish') bearish++;
    }

    const result = {
      ticker: symbol.symbol || ticker.toUpperCase(),
      title: symbol.title || '',
      watchlist_count: symbol.watchlist_count ?? null,
      sentiment_change: symbol.sentiment_change ?? null,
      volume_change: symbol.volume_change ?? null,
      bullish,
      bearish,
      total: messages.length,
      recent: messages.slice(0, 5).map((m: any) => ({
        id: m.id,
        body: m.body,
        created_at: m.created_at,
        sentiment: m.entities?.sentiment?.basic ?? null,
        user: m.user?.username ?? null,
      })),
    };

    await setCached(cacheKey, result, 0.25); // 15-min cache
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
