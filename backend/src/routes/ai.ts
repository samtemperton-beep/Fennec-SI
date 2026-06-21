import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as claude from '../services/claude';
import { getCached, setCached } from '../services/cache';

const router = Router();

// Shared cache: same ticker analysis served to all users for 6 hours
router.post('/analyze', requireAuth, async (req, res) => {
  const { ticker, data } = req.body;
  const cacheKey = `analyze:${ticker}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  const user = (req as any).user;
  try {
    const result = await claude.analyzeStock(ticker, data, user.user_metadata?.anthropic_key);
    await setCached(cacheKey, result, 6);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/helper', requireAuth, async (req, res) => {
  const { messages } = req.body;
  const user = (req as any).user;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    for await (const chunk of claude.streamHelper(messages, user.user_metadata?.anthropic_key)) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
  } catch (e: any) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
  }
  res.end();
});

router.post('/chat', requireAuth, async (req, res) => {
  const { messages, portfolio } = req.body;
  const user = (req as any).user;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    for await (const chunk of claude.streamChat(messages, portfolio || [], user.user_metadata?.anthropic_key)) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
  } catch (e: any) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
  }
  res.end();
});

// Shared cache: top 10 picks served to all users; news-aware picks get shorter cache
router.post('/top10', requireAuth, async (req, res) => {
  const { market = 'US', timeframe = '12mo', newsContext } = req.body;
  const cacheKey = `top10:${market}:${timeframe}:${newsContext ? 'news' : 'base'}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ data: cached, cached: true });

  const user = (req as any).user;
  try {
    const data = await claude.generateTop10(market, timeframe, user.user_metadata?.anthropic_key, newsContext);
    await setCached(cacheKey, data, newsContext ? 4 : 6);
    res.json({ data, cached: false });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Per-user cache: keyed by user + filters so different filter combos are cached separately
router.post('/opportunities', requireAuth, async (req, res) => {
  const { riskLevel = 7, holdings = [], sector = 'All', market = 'US', newsContext, userInterests } = req.body;
  const user = (req as any).user;
  const cacheKey = `opportunities:${user.id}:${sector}:${market}:${riskLevel}:${newsContext ? 'news' : 'base'}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ data: cached, cached: true });

  try {
    const data = await claude.generateOpportunities(riskLevel, holdings, user.user_metadata?.anthropic_key, sector, market, newsContext, userInterests);
    await setCached(cacheKey, data, newsContext ? 3 : 4);
    res.json({ data, cached: false });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Shared cache: news digest keyed by headline fingerprint, valid 2 hours
router.post('/news-digest', requireAuth, async (req, res) => {
  const { headlines, portfolio } = req.body;
  const fingerprint = (headlines || []).slice(0, 5).join('|').replace(/\s+/g, '').slice(0, 120);
  const cacheKey = `news:${fingerprint}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  const user = (req as any).user;
  try {
    const data = await claude.analyzeNews(headlines, portfolio || [], user.user_metadata?.anthropic_key);
    await setCached(cacheKey, data, 2);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Shared cache: IPO analysis per symbol, valid 24 hours
router.post('/ipo-analysis', requireAuth, async (req, res) => {
  const { ipo } = req.body;
  const cacheKey = `ipo:${ipo?.symbol || ipo?.name}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ data: cached, cached: true });

  const user = (req as any).user;
  try {
    const data = await claude.analyzeIPO(ipo, user.user_metadata?.anthropic_key);
    await setCached(cacheKey, data, 24);
    res.json({ data, cached: false });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Shared cache: deep dive per ticker, valid 6 hours
router.post('/deep-dive', requireAuth, async (req, res) => {
  const { ticker, context } = req.body;
  const cacheKey = `deepdive:${ticker}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  const user = (req as any).user;
  try {
    const data = await claude.deepDive(ticker, context, user.user_metadata?.anthropic_key);
    await setCached(cacheKey, data, 6);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// No cache: draft post is personal and instant
router.post('/draft-post', requireAuth, async (req, res) => {
  const { ticker, signal, context } = req.body;
  const user = (req as any).user;
  try {
    const text = await claude.draftPost(ticker, signal, context, user.user_metadata?.anthropic_key);
    res.json({ text });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
