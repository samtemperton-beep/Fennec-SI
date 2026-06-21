import { Router } from 'express';
import { fetchNews } from '../services/news';
import { fetchIPOs } from '../services/finnhub';

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

export default router;
