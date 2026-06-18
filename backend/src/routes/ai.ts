import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as gemini from '../services/gemini';
import * as claude from '../services/claude';
import { getCached, setCached } from '../services/cache';

const router = Router();

// Shared cache: same ticker analysis served to all users for 6 hours
router.post('/analyze', requireAuth, async (req, res) => {
  const { ticker, data } = req.body;
  const cacheKey = `analyze:${ticker}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const result = await gemini.analyzeStock(ticker, data);
    await setCached(cacheKey, result, 6);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Keep Claude for streaming chat — context-aware, per-user
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

// Shared cache: top 10 picks served to all users for 6 hours
router.post('/top10', requireAuth, async (req, res) => {
  const { market = 'US', timeframe = '12mo' } = req.body;
  const cacheKey = `top10:${market}:${timeframe}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ data: cached, cached: true });

  try {
    const data = await gemini.generateTop10(market, timeframe);
    await setCached(cacheKey, data, 6);
    res.json({ data, cached: false });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Per-user cache: opportunities depend on individual holdings
router.post('/opportunities', requireAuth, async (req, res) => {
  const { riskLevel = 7, holdings = [] } = req.body;
  const user = (req as any).user;
  const cacheKey = `opportunities:${user.id}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ data: cached, cached: true });

  try {
    const data = await gemini.generateOpportunities(riskLevel, holdings);
    await setCached(cacheKey, data, 4);
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

  try {
    const data = await gemini.analyzeNews(headlines, portfolio || []);
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

  try {
    const data = await gemini.analyzeIPO(ipo);
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

  try {
    const data = await gemini.deepDive(ticker, context);
    await setCached(cacheKey, data, 6);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// No cache: draft post is personal and instant
router.post('/draft-post', requireAuth, async (req, res) => {
  const { ticker, signal, context } = req.body;
  try {
    const text = await gemini.draftPost(ticker, signal, context);
    res.json({ text });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
