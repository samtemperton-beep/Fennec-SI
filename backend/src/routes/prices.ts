import { Router } from 'express';
import { fetchPrices, fetchQuote, fetchChart, searchSymbols } from '../services/yahoo';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', async (req, res) => {
  const tickers = String(req.query.tickers || '').split(',').filter(Boolean);
  if (!tickers.length) return res.status(400).json({ error: 'No tickers' });
  try {
    const prices = await fetchPrices(tickers);
    res.json(prices);
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
