import { Router } from 'express';
import { requireAuth, checkAndIncrementUsage, FREE_DAILY_AI_LIMIT } from '../middleware/auth';
import * as claude from '../services/claude';
import * as gemini from '../services/gemini';
import { getCached, setCached } from '../services/cache';

const router = Router();

// Shared cache: same ticker analysis served to all users for 6 hours
// Premium users get Claude analysis (separate cache key)
router.post('/analyze', requireAuth, async (req, res) => {
  const { ticker, data, riskLevel } = req.body;
  const isPremium = (req as any).isPremium;
  const riskBucket = riskLevel ? (riskLevel <= 3 ? 'low' : riskLevel <= 6 ? 'mid' : 'high') : 'mid';
  const cacheKey = `analyze:${ticker}:${riskBucket}:${isPremium ? 'premium' : 'free'}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  if (!await checkAndIncrementUsage(req, res)) return;

  try {
    const user = (req as any).user;
    const result = isPremium
      ? await claude.analyzeStock(ticker, data, user.user_metadata?.anthropic_key)
      : await gemini.analyzeStock(ticker, data, riskLevel);
    await setCached(cacheKey, result, 6);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Helper: free users limited to Gemini; counts toward daily quota
router.post('/helper', requireAuth, async (req, res) => {
  const { messages } = req.body;
  const isPremium = (req as any).isPremium;
  const user = (req as any).user;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!isPremium) {
    const allowed = await checkAndIncrementUsage(req, res);
    if (!allowed) return;
  }

  try {
    const stream = isPremium
      ? claude.streamHelper(messages, user.user_metadata?.anthropic_key)
      : gemini.streamHelper(messages);
    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
  } catch (e: any) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
  }
  res.end();
});

// AI Advisor chat: free users get 5 messages/day counted toward quota
router.post('/chat', requireAuth, async (req, res) => {
  const { messages, portfolio } = req.body;
  const user = (req as any).user;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!(req as any).isPremium) {
    const allowed = await checkAndIncrementUsage(req, res);
    if (!allowed) return;
  }

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

// Top 10: free users see results but it counts toward their daily quota (cached so rarely hits)
router.post('/top10', requireAuth, async (req, res) => {
  const { market = 'US', timeframe = '12mo', newsContext } = req.body;
  // Rotation seed: changes every 2 hours so regenerate always produces a fresh sector emphasis
  const today = new Date().toISOString().slice(0, 10);
  const hourBucket = Math.floor(new Date().getUTCHours() / 2);
  const rotationSeed = hourBucket; // 0-11, cycles sector rotation
  const cacheKey = `top10:${market}:${timeframe}:${today}:${hourBucket}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ data: cached, cached: true });

  if (!await checkAndIncrementUsage(req, res)) return;

  const user = (req as any).user;
  try {
    const data = await claude.generateTop10(market, timeframe, user.user_metadata?.anthropic_key, newsContext, rotationSeed);
    await setCached(cacheKey, data, 2); // 2h TTL — resets with each hour bucket
    res.json({ data, cached: false });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Opportunities: free users get only 2 results (teaser); premium gets all 6
router.post('/opportunities', requireAuth, async (req, res) => {
  const { riskLevel = 7, holdings = [], sector = 'All', market = 'US', newsContext, userInterests } = req.body;
  const user = (req as any).user;
  const isPremium = (req as any).isPremium;
  const cacheKey = `opportunities:${user.id}:${sector}:${market}:${riskLevel}:${newsContext ? 'news' : 'base'}`;
  const cached = await getCached(cacheKey);
  if (cached) {
    const data = isPremium ? cached : (cached as any[]).slice(0, 2);
    return res.json({ data, cached: true, limited: !isPremium });
  }

  if (!await checkAndIncrementUsage(req, res)) return;

  try {
    const data = await claude.generateOpportunities(riskLevel, holdings, user.user_metadata?.anthropic_key, sector, market, newsContext, userInterests);
    await setCached(cacheKey, data, newsContext ? 3 : 4);
    res.json({ data: isPremium ? data : data.slice(0, 2), cached: false, limited: !isPremium });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// News digest: available on free but counts toward quota
router.post('/news-digest', requireAuth, async (req, res) => {
  const { headlines, portfolio } = req.body;
  const fingerprint = (headlines || []).slice(0, 5).join('|').replace(/\s+/g, '').slice(0, 120);
  const cacheKey = `news:${fingerprint}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  if (!await checkAndIncrementUsage(req, res)) return;

  const user = (req as any).user;
  try {
    const data = await claude.analyzeNews(headlines, portfolio || [], user.user_metadata?.anthropic_key);
    await setCached(cacheKey, data, 2);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// IPO analysis: free gets Gemini, premium gets Claude; both count toward quota
router.post('/ipo-analysis', requireAuth, async (req, res) => {
  const { ipo } = req.body;
  const isPremium = (req as any).isPremium;
  const cacheKey = `ipo:${ipo?.symbol || ipo?.name}:${isPremium ? 'premium' : 'free'}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ data: cached, cached: true });

  if (!await checkAndIncrementUsage(req, res)) return;

  try {
    const user = (req as any).user;
    const data = isPremium
      ? await claude.analyzeIPO(ipo, user.user_metadata?.anthropic_key)
      : await gemini.analyzeIPO(ipo);
    await setCached(cacheKey, data, 24);
    res.json({ data, cached: false });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Deep dive: premium only
router.post('/deep-dive', requireAuth, async (req, res) => {
  if (!(req as any).isPremium) {
    return res.status(403).json({
      error: 'Deep Dive is a Premium feature. Upgrade to unlock in-depth AI analysis.',
      premiumRequired: true,
    });
  }

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

// Draft post: premium only
router.post('/draft-post', requireAuth, async (req, res) => {
  if (!(req as any).isPremium) {
    return res.status(403).json({
      error: 'AI Post Drafting is a Premium feature.',
      premiumRequired: true,
    });
  }

  const { ticker, signal, context } = req.body;
  try {
    const user = (req as any).user;
    const text = await claude.draftPost(ticker, signal, context, user.user_metadata?.anthropic_key);
    res.json({ text });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Usage status: lets frontend show the daily counter
router.get('/usage', requireAuth, async (req, res) => {
  const isPremium = (req as any).isPremium;
  if (isPremium) return res.json({ unlimited: true });

  const today = new Date().toISOString().slice(0, 10);
  const lastReset: string = (req as any).lastUsageReset ?? '';
  const count = lastReset === today ? ((req as any).usageCount ?? 0) : 0;
  res.json({ used: count, limit: FREE_DAILY_AI_LIMIT, remaining: Math.max(0, FREE_DAILY_AI_LIMIT - count) });
});

export default router;
