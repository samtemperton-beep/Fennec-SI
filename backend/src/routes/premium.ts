import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '../middleware/auth';
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

// Helper: full sync of holdings from a parsed CSV — upserts existing, inserts new, removes sold
async function syncHoldingsFromCSV(userId: string, csvHoldings: { ticker: string; shares: number; buyPrice: number; market: string }[]) {
  const { data: existing } = await supabase.from('holdings').select('ticker, current_price').eq('user_id', userId);
  const existingPrices = new Map((existing || []).map((h: any) => [h.ticker.toUpperCase(), h.current_price]));

  const toAdd = csvHoldings.filter(h => !existingPrices.has(h.ticker)).map(h => h.ticker);
  const toUpdate = csvHoldings.filter(h => existingPrices.has(h.ticker)).map(h => h.ticker);
  const removed = (existing || []).filter((h: any) => !csvHoldings.some(c => c.ticker === h.ticker.toUpperCase())).map((h: any) => h.ticker);

  // Delete all and reinsert — prevents duplicate rows from partial previous syncs
  await supabase.from('holdings').delete().eq('user_id', userId);
  for (const h of csvHoldings) {
    await supabase.from('holdings').insert({
      user_id: userId,
      ticker: h.ticker,
      shares: h.shares,
      buy_price: h.buyPrice || 0,
      current_price: existingPrices.get(h.ticker) || h.buyPrice || 0,
      market: h.market,
      is_verified: true,
    });
  }

  return { added: toAdd, updated: toUpdate, removed };
}

// Helper: insert or update portfolio_verifications (table has no unique constraint on user_id)
async function saveVerification(userId: string, payload: Record<string, any>) {
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

// POST /api/premium/verify-account — Step 1: screenshot of broker account/settings page
// Claude reads the email address visible in the screenshot and compares to the user's Fennec email
router.post('/verify-account', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { imageBase64, mediaType = 'image/jpeg' } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

  const client = new Anthropic({ apiKey: user.user_metadata?.anthropic_key || process.env.ANTHROPIC_API_KEY });

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'This is a screenshot of a brokerage or investment account profile/settings page. Extract the email address shown. Return JSON only: { "email": "user@example.com", "broker": "Hatch/Sharesies/IBKR/other", "found": true }. If no email address is visible, return { "found": false, "reason": "brief explanation" }.' },
        ],
      }],
    });

    const text = (msg.content[0] as any).text;
    const match = text.match(/\{[\s\S]*\}/);
    const extracted = match ? JSON.parse(match[0]) : { found: false, reason: 'Could not parse response' };

    if (!extracted.found) {
      return res.json({ matched: false, reason: extracted.reason || 'No email address found in screenshot' });
    }

    const fennecEmail = (user.email || '').toLowerCase().trim();
    const foundEmail = (extracted.email || '').toLowerCase().trim();
    const matched = fennecEmail === foundEmail;

    res.json({
      matched,
      foundEmail: extracted.email,
      broker: extracted.broker,
      reason: matched
        ? `Found ${extracted.email} in your ${extracted.broker} account — matches your Fennec account.`
        : `Found ${extracted.email} in the screenshot, but your Fennec account uses a different email. Make sure you screenshot the account registered with the same email as Fennec.`,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
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

  const tickers = holdings?.map((h: any) => h.ticker).join(', ') || '';

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

  // Save verification record
  const { data: verification, error } = await saveVerification(user.id, {
    status: claudeResult.verified_tickers.length > 0 ? 'verified' : 'rejected',
    verified_tickers: claudeResult.verified_tickers,
    claude_notes: claudeResult.notes,
    verified_at: claudeResult.verified_tickers.length > 0 ? new Date().toISOString() : null,
  });

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

// POST /api/premium/verify-csv — verify portfolio by uploading a broker CSV export (Hatch, Sharesies, IBKR)
// Imports any missing holdings from the CSV into Fennec, then marks all CSV tickers as verified.
router.post('/verify-csv', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'csv required' });

  // Parse CSV rows
  const rows: string[][] = csv.split('\n').map((line: string) => {
    const cells: string[] = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cells.push(cur.trim());
    return cells;
  }).filter((r: string[]) => r.some((c: string) => c));

  const header = (rows[0] || []).join(',').toLowerCase();

  // Parse full holding details (ticker, shares, buyPrice) from the CSV
  interface CsvHolding { ticker: string; shares: number; buyPrice: number; market: string }
  let csvHoldings: CsvHolding[] = [];

  if (header.includes('average cost (usd)') || header.includes('average cost (nzd)')) {
    // Hatch: Ticker,Name,Portion,Shares,Average cost (USD),...
    csvHoldings = rows.slice(1)
      .filter(r => r.length > 4 && r[0] && !r[0].startsWith('An FX'))
      .map(r => ({ ticker: r[0].trim().toUpperCase(), shares: parseFloat(r[3] || '0'), buyPrice: parseFloat(r[4] || '0'), market: 'US' }))
      .filter(h => h.ticker && h.shares > 0);
  } else if (header.includes('sharesies') || header.includes('portfolio name')) {
    csvHoldings = rows.slice(1)
      .map(r => ({ ticker: (r[1] || '').trim().toUpperCase(), shares: parseFloat(r[3] || '0'), buyPrice: parseFloat(r[4] || '0'), market: r[2]?.includes('NZ') ? 'NZX' : r[2]?.includes('AU') ? 'ASX' : 'US' }))
      .filter(h => h.ticker && h.shares > 0);
  } else if (rows.some(r => r[0] === 'Data' && r[1] === 'Trades')) {
    csvHoldings = rows.filter(r => r[0] === 'Data')
      .map(r => ({ ticker: (r[2] || '').trim().toUpperCase(), shares: parseFloat(r[5] || '0'), buyPrice: parseFloat(r[7] || '0'), market: 'US' }))
      .filter(h => h.ticker && h.shares > 0);
  } else {
    csvHoldings = rows.slice(1)
      .map(r => ({ ticker: (r[0] || '').trim().toUpperCase(), shares: parseFloat(r[1] || '0'), buyPrice: parseFloat(r[2] || '0'), market: 'US' }))
      .filter(h => h.ticker && h.shares > 0 && /^[A-Z]{1,6}/.test(h.ticker));
  }

  if (csvHoldings.length === 0) return res.status(400).json({ error: 'Could not extract any holdings from the CSV. Make sure you are uploading a holdings or portfolio export.' });

  const csvTickers = csvHoldings.map(h => h.ticker);

  // Full sync: upsert all CSV holdings into Fennec, remove sold positions
  const { added, updated, removed } = await syncHoldingsFromCSV(user.id, csvHoldings);

  const notes = `Synced ${csvTickers.length} holdings from your broker CSV.` +
    (added.length > 0 ? ` Added: ${added.join(', ')}.` : '') +
    (updated.length > 0 ? ` Updated: ${updated.join(', ')}.` : '') +
    (removed.length > 0 ? ` Removed (sold): ${removed.join(', ')}.` : '');

  const { data: verification, error } = await saveVerification(user.id, {
    status: 'verified',
    verified_tickers: csvTickers,
    claude_notes: notes,
    verified_at: new Date().toISOString(),
  });

  if (error) return res.status(500).json({ error: error.message });

  const { data: allHoldings } = await supabase.from('holdings').select('ticker, shares, buy_price, current_price, sector, is_verified').eq('user_id', user.id);
  const newBadges = await evaluateAndAwardBadges(user.id, allHoldings || [], true);

  res.json({ verification, newBadges, added, updated, removed });
});

// POST /api/premium/verify-email — lightweight: check user's Fennec email matches their broker email claim
router.post('/verify-email', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { brokerEmail } = req.body;
  if (!brokerEmail) return res.status(400).json({ error: 'brokerEmail required' });

  const fennecEmail = (user.email || '').toLowerCase().trim();
  const claimed = brokerEmail.toLowerCase().trim();
  const matched = fennecEmail === claimed;

  const { data: holdings } = await supabase.from('holdings').select('ticker').eq('user_id', user.id);
  const verifiedTickers = matched ? (holdings || []).map((h: any) => h.ticker) : [];

  const notes = matched
    ? `Email ${claimed} matches your Fennec account — broker account linked.`
    : `Email ${claimed} does not match your Fennec account email. Make sure you enter the same email you used to sign up for your broker.`;

  const { data: verification, error } = await saveVerification(user.id, {
    status: matched ? 'verified' : 'rejected',
    verified_tickers: verifiedTickers,
    claude_notes: notes,
    verified_at: matched ? new Date().toISOString() : null,
  });

  if (error) return res.status(500).json({ error: error.message });

  const { data: allHoldings } = await supabase.from('holdings').select('ticker, shares, buy_price, current_price, sector, is_verified').eq('user_id', user.id);
  const newBadges = await evaluateAndAwardBadges(user.id, allHoldings || [], matched);

  res.json({ verification, newBadges, matched });
});

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
      is_verified: true,
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
      return { userId: uid, username: profile?.username, avatarColor: profile?.avatar_color, avatarEmoji: profile?.avatar_emoji, avatarUrl: profile?.avatar_url, gainPct: Math.round(gainPct * 100) / 100, portfolioValue: Math.round(stats.value * 100) / 100 };
    })
    .sort((a, b) => b.gainPct - a.gainPct)
    .slice(0, 50)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));

  res.json({ leaderboard });
});

export default router;
