import { Router } from 'express';
import { requireAuth, requireFeature, checkAndIncrementUsage, getPlatformSettings } from '../middleware/auth';
import { limitFor } from '../services/plans';
import * as claude from '../services/claude';
import { modelFor, cleanMessages } from '../services/llm';
import { getCached, setCached } from '../services/cache';
import { fetchQuote } from '../services/yahoo';

const router = Router();

// Shared cache: same ticker analysis served to all users of a model for 4 hours.
// The cache key carries the model, so free and premium only share when they use the same one.
router.post('/analyze', requireAuth, requireFeature('analyze'), async (req, res) => {
  const { ticker, data, riskLevel } = req.body;
  const isPremium = (req as any).isPremium;
  const riskBucket = riskLevel ? (riskLevel <= 3 ? 'low' : riskLevel <= 6 ? 'mid' : 'high') : 'mid';
  const model = modelFor(await getPlatformSettings(), 'analyze', isPremium);
  const cacheKey = `analyze:${ticker}:${riskBucket}:${model}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  if (!await checkAndIncrementUsage(req, res)) return;

  try {
    const user = (req as any).user;
    // Enrich with live quote so the AI has real data to reason about
    let enriched = { ...data };
    try {
      const q = await fetchQuote(ticker);
      enriched = {
        price: q.price,
        changePctToday: q.changePct,
        w52Hi: q.w52Hi,
        w52Lo: q.w52Lo,
        marketCap: q.marketCap,
        pe: q.pe,
        divYield: q.divYield,
        sector: q.sector || data?.sector,
        exchange: q.exchange,
        // How far from 52w high/low as a signal
        pctFrom52Hi: q.w52Hi ? +((q.price / q.w52Hi - 1) * 100).toFixed(1) : null,
        pctFrom52Lo: q.w52Lo ? +((q.price / q.w52Lo - 1) * 100).toFixed(1) : null,
      };
    } catch { /* use whatever data was passed */ }
    const result = await claude.analyzeStock(ticker, enriched, user.user_metadata?.anthropic_key, model, riskLevel);
    await setCached(cacheKey, result, 4);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Helper: counts toward a free user's daily quota
router.post('/helper', requireAuth, requireFeature('helper'), async (req, res) => {
  const { messages, context } = req.body;
  const isPremium = (req as any).isPremium;
  const user = (req as any).user;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!await checkAndIncrementUsage(req, res)) return;

  try {
    const settings = await getPlatformSettings();
    const stream = claude.streamHelper(cleanMessages(messages), user.user_metadata?.anthropic_key, context, modelFor(settings, 'helper', isPremium));
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
    const settings = await getPlatformSettings();
    for await (const chunk of claude.streamChat(cleanMessages(messages), portfolio || [], user.user_metadata?.anthropic_key, settings['model_chat'])) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
  } catch (e: any) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
  }
  res.end();
});

// Setup help during onboarding. Doesn't use the daily AI quota: someone stuck on
// sign-up shouldn't be told they've run out. Capped per user per day instead.
const SETUP_HELP_DAILY_LIMIT = 40;
const setupHelpUse = new Map<string, { day: string; count: number }>();
const SECRET_LIKE = /\b(app_token_|user_token_)\S+/gi;

router.post('/setup-help', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) {
    return res.status(400).json({ error: 'messages required' });
  }
  const clean = messages
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    // Tokens should never reach the AI, even if someone pastes one.
    .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 1500).replace(SECRET_LIKE, '[token removed]') }));
  if (clean.length === 0 || clean[clean.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'messages required' });
  }

  const day = new Date().toISOString().slice(0, 10);
  const use = setupHelpUse.get(user.id);
  const count = use?.day === day ? use.count : 0;
  if (count >= SETUP_HELP_DAILY_LIMIT) {
    return res.status(429).json({ error: "That's a lot of questions for one day. You can skip this step and connect from Settings later." });
  }
  setupHelpUse.set(user.id, { day, count: count + 1 });

  try {
    const settings = await getPlatformSettings();
    res.json({ reply: await claude.setupHelp(clean, modelFor(settings, 'setup_help', (req as any).isPremium)) });
  } catch (e: any) {
    console.error('[setup-help]', e?.message ?? e);
    res.status(502).json({ error: "Fennec can't answer right now. Try again in a moment, or skip this step and connect later." });
  }
});

// Dashboard daily briefing. Written once per user per day from a compact
// snapshot the dashboard sends (net worth, cash flow, notifications), then
// cached, so opening the dashboard repeatedly never re-spends AI quota. An
// explicit refresh regenerates it and counts toward a free user's daily limit.
router.post('/daily-summary', requireAuth, requireFeature('summary'), async (req, res) => {
  const user = (req as any).user;
  const isPremium = (req as any).isPremium;
  const { facts, date, refresh } = req.body ?? {};
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date (YYYY-MM-DD) required' });
  }
  if (!facts || typeof facts !== 'object' || JSON.stringify(facts).length > 8000) {
    return res.status(400).json({ error: 'facts object required (max 8KB)' });
  }

  const cacheKey = `daily-summary:${user.id}:${date}`;
  if (!refresh) {
    const cached = await getCached(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });
  } else if (!await checkAndIncrementUsage(req, res)) {
    return;
  }

  try {
    const settings = await getPlatformSettings();
    const text = await claude.dailySummary(facts, user.user_metadata?.anthropic_key, modelFor(settings, 'summary', isPremium));
    if (!text) return res.status(502).json({ error: 'The summary came back empty. Try again shortly.' });
    const result = { summary: text, generatedAt: new Date().toISOString() };
    await setCached(cacheKey, result, 24);
    res.json({ ...result, cached: false });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Top 10: free users see results but it counts toward their daily quota (cached so rarely hits)
router.post('/top10', requireAuth, requireFeature('top10'), async (req, res) => {
  const { market = 'US', timeframe = '12mo', newsContext } = req.body;
  // Rotation seed: changes every 2 hours so regenerate always produces a fresh sector emphasis
  const today = new Date().toISOString().slice(0, 10);
  const hourBucket = Math.floor(new Date().getUTCHours() / 2);
  const rotationSeed = hourBucket; // 0-11, cycles sector rotation
  const model = modelFor(await getPlatformSettings(), 'top10', (req as any).isPremium);
  const cacheKey = `top10:${market}:${timeframe}:${today}:${hourBucket}:${model}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ data: cached, cached: true });

  if (!await checkAndIncrementUsage(req, res)) return;

  const user = (req as any).user;
  try {
    const data = await claude.generateTop10(market, timeframe, user.user_metadata?.anthropic_key, newsContext, rotationSeed, model);
    await setCached(cacheKey, data, 2); // 2h TTL — resets with each hour bucket
    res.json({ data, cached: false });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Opportunities: the plan's discover_results limit sets how many picks are shown (0 = all)
router.post('/opportunities', requireAuth, requireFeature('opportunities'), async (req, res) => {
  const { riskLevel = 7, holdings = [], sector = 'All', market = 'US', newsContext, userInterests } = req.body;
  const user = (req as any).user;
  const isPremium = (req as any).isPremium;
  const settings = await getPlatformSettings();
  const model = modelFor(settings, 'opportunities', isPremium);
  const shown = limitFor(settings, 'discover_results', isPremium);
  const cut = (list: any[]) => (shown > 0 ? list.slice(0, shown) : list);
  const cacheKey = `opportunities:${user.id}:${sector}:${market}:${riskLevel}:${newsContext ? 'news' : 'base'}:${model}`;
  const cached = await getCached(cacheKey);
  if (cached) {
    const data = cut(cached as any[]);
    return res.json({ data, cached: true, limited: data.length < (cached as any[]).length });
  }

  if (!await checkAndIncrementUsage(req, res)) return;

  try {
    const data = await claude.generateOpportunities(riskLevel, holdings, user.user_metadata?.anthropic_key, sector, market, newsContext, userInterests, model);
    await setCached(cacheKey, data, newsContext ? 3 : 4);
    res.json({ data: cut(data), cached: false, limited: cut(data).length < data.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// News digest: available on free but counts toward quota
router.post('/news-digest', requireAuth, requireFeature('news'), async (req, res) => {
  const { headlines, portfolio } = req.body;
  const fingerprint = (headlines || []).slice(0, 5).join('|').replace(/\s+/g, '').slice(0, 120);
  const model = modelFor(await getPlatformSettings(), 'news', (req as any).isPremium);
  const cacheKey = `news:${fingerprint}:${model}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  if (!await checkAndIncrementUsage(req, res)) return;

  const user = (req as any).user;
  try {
    const data = await claude.analyzeNews(headlines, portfolio || [], user.user_metadata?.anthropic_key, model);
    await setCached(cacheKey, data, 2);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// IPO analysis: counts toward a free user's quota
router.post('/ipo-analysis', requireAuth, requireFeature('ipo'), async (req, res) => {
  const { ipo } = req.body;
  const isPremium = (req as any).isPremium;
  const model = modelFor(await getPlatformSettings(), 'ipo', isPremium);
  const cacheKey = `ipo:${ipo?.symbol || ipo?.name}:${model}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ data: cached, cached: true });

  if (!await checkAndIncrementUsage(req, res)) return;

  try {
    const user = (req as any).user;
    const data = await claude.analyzeIPO(ipo, user.user_metadata?.anthropic_key, model);
    await setCached(cacheKey, data, 24);
    res.json({ data, cached: false });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Deep dive (premium by default)
router.post('/deep-dive', requireAuth, requireFeature('deep_dive'), async (req, res) => {
  const { ticker, context } = req.body;
  const model = modelFor(await getPlatformSettings(), 'deep_dive', (req as any).isPremium);
  const cacheKey = `deepdive:${ticker}:${model}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  const user = (req as any).user;
  try {
    const data = await claude.deepDive(ticker, context, user.user_metadata?.anthropic_key, model);
    await setCached(cacheKey, data, 6);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Draft post (premium by default)
router.post('/draft-post', requireAuth, requireFeature('draft_post'), async (req, res) => {
  const { ticker, signal, context } = req.body;
  try {
    const user = (req as any).user;
    const settings = await getPlatformSettings();
    const text = await claude.draftPost(ticker, signal, context, user.user_metadata?.anthropic_key, modelFor(settings, 'draft_post', (req as any).isPremium));
    res.json({ text });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Usage status: lets frontend show the daily counter
router.get('/usage', requireAuth, async (req, res) => {
  const limit = limitFor(await getPlatformSettings(), 'daily_ai_calls', (req as any).isPremium);
  if (limit === 0) return res.json({ unlimited: true });

  const today = new Date().toISOString().slice(0, 10);
  const lastReset: string = (req as any).lastUsageReset ?? '';
  const count = lastReset === today ? ((req as any).usageCount ?? 0) : 0;
  res.json({ used: count, limit, remaining: Math.max(0, limit - count) });
});

export default router;
