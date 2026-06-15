import { Router } from 'express';
import { fetchNews, fetchIPOs } from '../services/finnhub';

const router = Router();

router.get('/', async (req, res) => {
  const tickers = String(req.query.tickers || '').split(',').filter(Boolean);
  try {
    const news = await fetchNews(tickers);
    const withSentiment = news.map(n => ({
      ...n,
      sentiment: detectSentiment(n.headline + ' ' + (n.summary || '')),
    }));
    res.json(withSentiment);
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

function detectSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const pos = /surge|soar|jump|gain|rise|beat|record|strong|growth|profit|rally|bull/i;
  const neg = /fall|drop|crash|loss|decline|miss|weak|cut|bear|warn|risk|concern/i;
  if (pos.test(text)) return 'positive';
  if (neg.test(text)) return 'negative';
  return 'neutral';
}

export default router;
