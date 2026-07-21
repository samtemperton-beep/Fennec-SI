import { Router } from 'express';
import { fetchNews } from '../services/news';
import { fetchIPOs, fetchEarningsCalendar, fetchRecentFilings, fetchAnalystRecommendations, fetchASXAnnouncements } from '../services/finnhub';
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

// Earnings dates for portfolio/watchlist tickers — past 30 days + next 60 days
router.get('/earnings', async (req, res) => {
  const tickers = String(req.query.tickers || '').split(',').filter(Boolean);
  if (!tickers.length) return res.json([]);
  const cacheKey = `earnings2:${[...tickers].sort().join(',')}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await fetchEarningsCalendar(tickers, 60, 30);
    await setCached(cacheKey, data, 2); // 2 hours
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

// ASX company announcements (free ASX public API)
router.get('/asx-announcements', async (req, res) => {
  const tickers = String(req.query.tickers || '').split(',').filter(Boolean);
  if (!tickers.length) return res.json([]);
  const cacheKey = `asx-ann:${[...tickers].sort().join(',')}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json(cached);
  try {
    const data = await fetchASXAnnouncements(tickers);
    await setCached(cacheKey, data, 0.25); // 15 min
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
