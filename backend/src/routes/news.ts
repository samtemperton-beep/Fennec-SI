import { Router } from 'express';
import { fetchNews } from '../services/news';
import { fetchIPOs, fetchEarningsCalendar, fetchRecentFilings, fetchAnalystRecommendations } from '../services/finnhub';
import { getCached, setCached } from '../services/cache';

const router = Router();

router.get('/', async (req, res) => {
  const tickers = String(req.query.tickers || '').split(',').filter(Boolean);
  try {
    const news = await fetchNews(tickers);
    res.json(news);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/ipo', async (_req, res) => {
  try {
    const data = await fetchIPOs();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Upcoming earnings dates for portfolio/watchlist tickers (next 30 days)
router.get('/earnings', async (req, res) => {
  const tickers = String(req.query.tickers || '').split(',').filter(Boolean);
  if (!tickers.length) return res.json([]);
  const cacheKey = `earnings:${[...tickers].sort().join(',')}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await fetchEarningsCalendar(tickers, 45);
    await setCached(cacheKey, data, 1); // 1 hour
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Recent SEC / regulatory filings (8-K, 10-Q, 10-K)
router.get('/filings', async (req, res) => {
  const tickers = String(req.query.tickers || '').split(',').filter(Boolean);
  if (!tickers.length) return res.json([]);
  const cacheKey = `filings:${[...tickers].sort().join(',')}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await fetchRecentFilings(tickers, 14);
    await setCached(cacheKey, data, 0.5); // 30 min
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Analyst consensus + price targets for portfolio/watchlist tickers
router.get('/analyst', async (req, res) => {
  const tickers = String(req.query.tickers || '').split(',').filter(Boolean);
  if (!tickers.length) return res.json([]);
  const cacheKey = `analyst:${[...tickers].sort().join(',')}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await fetchAnalystRecommendations(tickers);
    await setCached(cacheKey, data, 1);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
