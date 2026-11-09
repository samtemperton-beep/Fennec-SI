import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { requireAuth, getPlatformSettings } from '../middleware/auth';
import { planFor } from '../services/plans';
import { evaluateAndAwardBadges } from '../services/badges';
import { parseCSV } from './import';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

// Helper: insert or update portfolio_verifications (table has no unique constraint on user_id)
export async function saveVerification(userId: string, payload: Record<string, any>) {
  const { data: existing } = await supabase
    .from('portfolio_verifications')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from('portfolio_verifications')
      .update(payload)
      .eq('user_id', userId)
      .select()
      .single();
    return { data, error };
  } else {
    const { data, error } = await supabase
      .from('portfolio_verifications')
      .insert({ user_id: userId, ...payload })
      .select()
      .single();
    return { data, error };
  }
}

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

// GET /api/premium/plan — what this account's plan includes, for the app to show or lock
router.get('/plan', requireAuth, async (req, res) => {
  res.json(planFor(await getPlatformSettings(), (req as any).isPremium));
});

// Portfolios are verified only by the Akahu sync (services/akahuSync.ts), because
// that data comes straight from the broker. Uploads and self-reported details
// can be edited or faked, so they no longer verify anything.

// POST /api/premium/sync — preview or full sync of holdings from broker CSV
router.post('/sync', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { csv, preview } = req.body;
  if (!csv) return res.status(400).json({ error: 'No CSV data' });

  const { format, parsed } = parseCSV(csv);
  if (parsed.length === 0) return res.status(400).json({ error: 'Could not extract any holdings from the CSV. Make sure you are uploading a holdings or portfolio export.' });

  const { data: existing } = await supabase
    .from('holdings')
    .select('id, ticker, current_price, signal, signal_reason, sector, name')
    .eq('user_id', user.id);
  const existingMap = new Map((existing || []).map((h: any) => [h.ticker.toUpperCase(), h]));
  const csvSet = new Set(parsed.map(h => h.ticker));

  const toAdd = parsed.filter(h => !existingMap.has(h.ticker)).map(h => h.ticker);
  const toUpdate = parsed.filter(h => existingMap.has(h.ticker)).map(h => h.ticker);
  const toRemove = (existing || []).filter((h: any) => !csvSet.has(h.ticker.toUpperCase())).map((h: any) => h.ticker);

  if (preview) {
    return res.json({ format, preview: true, toAdd, toUpdate, toRemove, total: parsed.length });
  }

  // Delete all existing holdings then reinsert from CSV — clean slate prevents duplicates
  const { error: deleteError } = await supabase.from('holdings').delete().eq('user_id', user.id);
  if (deleteError) return res.status(500).json({ error: 'Failed to clear existing holdings: ' + deleteError.message });

  const failed: string[] = [];
  for (const h of parsed) {
    const existing_row = existingMap.get(h.ticker);
    const { error } = await supabase.from('holdings').insert({
      user_id: user.id,
      ticker: h.ticker,
      shares: h.shares,
      buy_price: h.buyPrice || 0,
      current_price: existing_row?.current_price || h.buyPrice || 0,
      market: h.market,
      is_verified: false, // only the Akahu sync verifies: a CSV can be edited
      signal: existing_row?.signal || null,
      signal_reason: existing_row?.signal_reason || null,
      sector: existing_row?.sector || null,
    });
    if (error) failed.push(`${h.ticker}(${error.message})`);
  }

  if (failed.length > 0) console.error('[sync] failures:', failed);
  res.json({ format, added: toAdd, updated: toUpdate, removed: toRemove, failed });
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

  // Get their profiles and VERIFIED holdings only — unverified holdings cannot affect rank
  const [profilesRes, holdingsRes] = await Promise.all([
    supabase.from('profiles').select('id, username, avatar_color, avatar_emoji, avatar_url').in('id', userIds),
    supabase.from('holdings').select('user_id, shares, buy_price, current_price').in('user_id', userIds).eq('is_verified', true),
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
      return { userId: uid, username: profile?.username, avatarColor: profile?.avatar_color, avatarEmoji: profile?.avatar_emoji, avatarUrl: profile?.avatar_url, gainPct: Math.round(gainPct * 100) / 100 };
    })
    .sort((a, b) => b.gainPct - a.gainPct)
    .slice(0, 50)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));

  res.json({ leaderboard });
});

export default router;
