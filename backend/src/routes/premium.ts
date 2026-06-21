import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '../middleware/auth';
import { evaluateAndAwardBadges } from '../services/badges';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

// GET /api/premium/status — returns tier + badges for current user
router.get('/status', requireAuth, async (req, res) => {
  const user = (req as any).user;

  const [profileRes, badgesRes, verificationRes] = await Promise.all([
    supabase.from('profiles').select('subscription_tier, tier_updated_at').eq('id', user.id).single(),
    supabase.from('user_badges').select('badge_id, earned_at, metadata, badges(name, description, icon, tier)').eq('user_id', user.id),
    supabase.from('portfolio_verifications').select('status, verified_tickers, created_at, verified_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  res.json({
    tier: profileRes.data?.subscription_tier || 'free',
    tierUpdatedAt: profileRes.data?.tier_updated_at,
    badges: badgesRes.data || [],
    verification: verificationRes.data || null,
  });
});

// POST /api/premium/verify — submit a broker document for Claude to verify
// Accepts base64-encoded PDF or image of a broker statement
router.post('/verify', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { documentBase64, mediaType = 'image/jpeg' } = req.body;

  if (!documentBase64) return res.status(400).json({ error: 'documentBase64 required' });

  // Get current holdings so Claude knows what to verify against
  const { data: holdings } = await supabase
    .from('holdings')
    .select('ticker, shares, buy_price')
    .eq('user_id', user.id);

  if (!holdings || holdings.length === 0) {
    return res.status(400).json({ error: 'Add holdings to your portfolio before verifying' });
  }

  const tickers = holdings.map((h: any) => h.ticker).join(', ');

  const anthropicKey = user.user_metadata?.anthropic_key;
  const client = new Anthropic({ apiKey: anthropicKey || process.env.ANTHROPIC_API_KEY });

  let claudeResult: { verified_tickers: string[]; confidence: string; notes: string };

  try {
    const isImage = mediaType.startsWith('image/');
    const contentBlock: any = isImage
      ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: documentBase64 } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: documentBase64 } };

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          contentBlock,
          {
            type: 'text',
            text: `This is a broker/investment account statement. The user claims to hold these stocks: ${tickers}.

Your job is to verify which of these holdings appear in the document. Only confirm tickers you can clearly see in the document.

Return JSON only:
{
  "verified_tickers": ["AAPL", "MSFT"],
  "confidence": "high|medium|low",
  "notes": "Brief explanation of what you found in the document"
}

If the document does not appear to be a broker statement, return an empty verified_tickers array and explain in notes.`,
          },
        ],
      }],
    });

    const text = (msg.content[0] as any).text;
    const match = text.match(/\{[\s\S]*\}/);
    claudeResult = match ? JSON.parse(match[0]) : { verified_tickers: [], confidence: 'low', notes: text };
  } catch (e: any) {
    return res.status(500).json({ error: 'AI verification failed: ' + e.message });
  }

  // Upsert verification record
  const { data: verification, error } = await supabase
    .from('portfolio_verifications')
    .upsert({
      user_id: user.id,
      status: claudeResult.verified_tickers.length > 0 ? 'verified' : 'rejected',
      verified_tickers: claudeResult.verified_tickers,
      claude_notes: claudeResult.notes,
      verified_at: claudeResult.verified_tickers.length > 0 ? new Date().toISOString() : null,
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Mark matching holdings as verified
  if (claudeResult.verified_tickers.length > 0) {
    await supabase
      .from('holdings')
      .update({ is_verified: true })
      .eq('user_id', user.id)
      .in('ticker', claudeResult.verified_tickers);
  }

  // Evaluate badges now that verification state may have changed
  const { data: allHoldings } = await supabase
    .from('holdings')
    .select('ticker, shares, buy_price, current_price, sector, is_verified')
    .eq('user_id', user.id);

  const newBadges = await evaluateAndAwardBadges(
    user.id,
    allHoldings || [],
    claudeResult.verified_tickers.length > 0
  );

  res.json({ verification, newBadges });
});

// POST /api/premium/evaluate-badges — re-run badge evaluation (call after price refresh)
router.post('/evaluate-badges', requireAuth, async (req, res) => {
  const user = (req as any).user;

  const [holdingsRes, verRes] = await Promise.all([
    supabase.from('holdings').select('ticker, shares, buy_price, current_price, sector, is_verified').eq('user_id', user.id),
    supabase.from('portfolio_verifications').select('status').eq('user_id', user.id).eq('status', 'verified').maybeSingle(),
  ]);

  const newBadges = await evaluateAndAwardBadges(
    user.id,
    holdingsRes.data || [],
    verRes.data?.status === 'verified'
  );

  res.json({ newBadges });
});

// GET /api/premium/leaderboard — top verified portfolios by gain %
router.get('/leaderboard', requireAuth, async (_req, res) => {
  // Get all users with verified portfolios
  const { data: verifiedUsers } = await supabase
    .from('portfolio_verifications')
    .select('user_id')
    .eq('status', 'verified');

  if (!verifiedUsers || verifiedUsers.length === 0) {
    return res.json({ leaderboard: [] });
  }

  const userIds = verifiedUsers.map((v: any) => v.user_id);

  // Get their profiles and holdings
  const [profilesRes, holdingsRes] = await Promise.all([
    supabase.from('profiles').select('id, username, avatar_color, avatar_emoji, avatar_url').in('id', userIds),
    supabase.from('holdings').select('user_id, shares, buy_price, current_price').in('user_id', userIds),
  ]);

  const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));

  // Compute gain % per user
  const userStats = new Map<string, { cost: number; value: number }>();
  for (const h of holdingsRes.data || []) {
    const s = userStats.get(h.user_id) || { cost: 0, value: 0 };
    s.cost += h.buy_price * h.shares;
    s.value += h.current_price * h.shares;
    userStats.set(h.user_id, s);
  }

  const leaderboard = Array.from(userStats.entries())
    .map(([uid, stats]) => {
      const gainPct = stats.cost > 0 ? ((stats.value - stats.cost) / stats.cost) * 100 : 0;
      const profile = profileMap.get(uid);
      return { userId: uid, username: profile?.username, avatarColor: profile?.avatar_color, avatarEmoji: profile?.avatar_emoji, avatarUrl: profile?.avatar_url, gainPct: Math.round(gainPct * 100) / 100, portfolioValue: Math.round(stats.value * 100) / 100 };
    })
    .sort((a, b) => b.gainPct - a.gainPct)
    .slice(0, 50)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));

  res.json({ leaderboard });
});

export default router;
