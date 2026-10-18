import { Router } from 'express';
import axios from 'axios';
import { fetchPrices, fetchQuote, fetchChart, searchSymbols } from '../services/yahoo';
import { requireAuth } from '../middleware/auth';
import { getUsdNzd, getRateToNzd } from '../services/fx';
import { getProfiles } from '../services/profiles';
import { getDividends } from '../services/dividends';

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

// GET /api/prices/fx — USD→NZD rate for showing NZD equivalents of USD values
router.get('/fx', async (_req, res) => {
  const fx = await getUsdNzd();
  if (!fx) return res.status(503).json({ error: 'Exchange rate unavailable' });
  res.set('Cache-Control', 'public, max-age=300');
  res.json(fx);
});

// GET /api/prices/fx-rates?currencies=USD,AUD — NZD per 1 unit of each currency,
// so mixed-market portfolios can be compared on one scale. null = no rate available.
router.get('/fx-rates', async (req, res) => {
  const currencies = [...new Set(String(req.query.currencies || '').split(',').map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c)))].slice(0, 6);
  const rates: Record<string, number | null> = {};
  for (const c of currencies) rates[c] = await getRateToNzd(c);
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ base: 'NZD', rates });
});

// GET /api/prices/profiles?tickers=AAPL,SPY — industry per ticker (cached 24h).
// Auth required because each uncached ticker costs a call against the Finnhub quota.
router.get('/profiles', requireAuth, async (req, res) => {
  const tickers = String(req.query.tickers || '').split(',').filter(Boolean);
  if (tickers.length === 0) return res.json({ profiles: {} });
  res.set('Cache-Control', 'private, max-age=3600');
  res.json({ profiles: await getProfiles(tickers) });
});

// GET /api/prices/dividends?symbols=VIG,AAPL — dividend history (about 2 years) per
// Yahoo symbol (NZX: .NZ, ASX: .AX), cached 24h. Auth required to protect the shared quota.
router.get('/dividends', requireAuth, async (req, res) => {
  const symbols = String(req.query.symbols || '').split(',').filter(Boolean);
  if (symbols.length === 0) return res.json({ dividends: {} });
  res.set('Cache-Control', 'private, max-age=3600');
  res.json({ dividends: await getDividends(symbols) });
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
