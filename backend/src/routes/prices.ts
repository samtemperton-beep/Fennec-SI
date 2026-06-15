import { Router } from 'express';
import { fetchPrices, fetchQuote, fetchChart } from '../services/yahoo';

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

export default router;
