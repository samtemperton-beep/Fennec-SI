import { Router } from 'express';
import axios from 'axios';
import { fetchPrices, fetchQuote, fetchChart, searchSymbols } from '../services/yahoo';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', async (req, res) => {
  const tickers = String(req.query.tickers || '').split(',').filter(Boolean);
  if (!tickers.length) return res.status(400).json({ error: 'No tickers' });
  try {
    res.json(await fetchPrices(tickers));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/quote/:ticker', async (req, res) => {
  try {
    const data = await fetchQuote(req.params.ticker);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/chart/:ticker', async (req, res) => {
  try {
    const data = await fetchChart(req.params.ticker, String(req.query.range || '1y'));
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/prices/market-ticker — lightweight endpoint for the scrolling banner
// Uses Yahoo Finance v8 directly so index symbols (^AXJO, ^NZ50, BTC-USD) all work
router.get('/market-ticker', async (req, res) => {
  const SYMBOLS = [
    { ticker: 'SPY',     label: 'S&P 500',       market: 'US' },
    { ticker: 'QQQ',     label: 'Nasdaq',         market: 'US' },
    { ticker: 'DIA',     label: 'Dow 30',         market: 'US' },
    { ticker: 'IWM',     label: 'Russell 2000',   market: 'US' },
    { ticker: '^AXJO',   label: 'ASX 200',        market: 'ASX' },
    { ticker: '^NZ50',   label: 'NZX 50',         market: 'NZX' },
    { ticker: 'GLD',     label: 'Gold',           market: 'US' },
    { ticker: 'TLT',     label: '20Y Bond',       market: 'US' },
    { ticker: 'USO',     label: 'Oil',            market: 'US' },
    { ticker: 'BTC-USD', label: 'Bitcoin',        market: '24h' },
  ];

  const results = await Promise.all(SYMBOLS.map(async s => {
    try {
      const { data } = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.ticker)}?interval=1d&range=1d`,
        { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) return { ...s, price: 0, changePct: 0 };
      const price = meta.regularMarketPrice ?? 0;
      const prev = meta.previousClose ?? meta.chartPreviousClose ?? price;
      const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
      return { ...s, price, changePct };
    } catch {
      return { ...s, price: 0, changePct: 0 };
    }
  }));

  res.set('Cache-Control', 'public, max-age=60');
  res.json(results);
});

router.get('/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) return res.json([]);
  try {
    const results = await searchSymbols(q);
    res.json(results);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
