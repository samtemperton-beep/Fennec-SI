import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
import { requireAuth, FREE_MAX_HOLDINGS } from '../middleware/auth';
import { evaluateAndAwardBadges } from '../services/badges';
import { fetchAkahuAccounts, mapAkahuAccounts, planHoldingSync } from '../services/akahu';
import { saveVerification } from './premium';
import { loadAkahuCredentials, credentialsErrorResponse } from '../services/akahuCredentials';
dotenv.config();

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

// POST /api/akahu/sync — makes Akahu the source of truth for the user's broker
// holdings and KiwiSaver balance.
//
// Body: { preview?: boolean, removeUnmatched?: boolean }
//  - preview: report what would change without writing anything.
//  - removeUnmatched: also delete holdings Akahu doesn't know about (manual
//    entries or old CSV imports). Off by default so a sync can't silently
//    discard positions held at a broker that isn't connected.
router.post('/sync', requireAuth, async (req: any, res) => {
  const user = req.user;
  const isPremium: boolean = req.isPremium;
  const preview = req.body?.preview === true;
  const removeUnmatched = req.body?.removeUnmatched === true;

  let creds;
  try {
    creds = await loadAkahuCredentials(supabase, user.id);
  } catch (e: any) {
    return credentialsErrorResponse(res, e);
  }
  if (!creds) {
    return res.status(400).json({ error: 'No Akahu tokens saved. Add them in Settings → Akahu.', code: 'no_credentials' });
  }

  let portfolio;
  try {
    portfolio = mapAkahuAccounts(await fetchAkahuAccounts(creds.appToken, creds.userToken));
  } catch (e: any) {
    return res.status(502).json({ error: e.message });
  }

  const warnings = [...portfolio.warnings];
  const hasBroker = portfolio.brokerAccounts.length > 0;

  if (!hasBroker && portfolio.kiwisaver.length === 0) {
    return res.status(404).json({
      error: 'No investment or KiwiSaver accounts found in your Akahu profile. Connect them at my.akahu.nz first.',
      code: 'no_investment_accounts',
      warnings,
    });
  }

  // ── Holdings ────────────────────────────────────────────────────────────────
  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];
  const unmatched: string[] = [];
  const failed: string[] = [];
  let capped = false;

  // Only touch holdings when Akahu actually returned a broker account. A
  // disconnected broker must not look like "everything was sold".
  if (hasBroker) {
    let incoming = portfolio.holdings; // already sorted by value, largest first
    if (!isPremium && incoming.length > FREE_MAX_HOLDINGS) {
      incoming = incoming.slice(0, FREE_MAX_HOLDINGS);
      capped = true;
      warnings.push(
        `Free plan tracks ${FREE_MAX_HOLDINGS} holdings, so your ${FREE_MAX_HOLDINGS} largest by value were synced (of ${portfolio.holdings.length}). Upgrade to Premium to track them all.`
      );
    }
    const { data: existingRows, error: existingErr } = await supabase
      .from('holdings')
      .select('id, ticker, source')
      .eq('user_id', user.id);
    if (existingErr) return res.status(500).json({ error: existingErr.message });
    const existing = existingRows ?? [];
    const byTicker = new Map(existing.map((h: any) => [String(h.ticker).toUpperCase(), h]));

    const plan = planHoldingSync({ incoming, allAkahu: portfolio.holdings, existing, removeUnmatched });
    added.push(...plan.added);
    updated.push(...plan.updated);
    unmatched.push(...plan.unmatched);
    removed.push(...plan.toDelete.map((h) => h.ticker));
    if (plan.unmatched.length > 0 && !removeUnmatched) {
      warnings.push(
        `${plan.unmatched.length} holding${plan.unmatched.length !== 1 ? 's' : ''} in Fennec ${plan.unmatched.length !== 1 ? "aren't" : "isn't"} in your Akahu accounts and ${plan.unmatched.length !== 1 ? 'were' : 'was'} left untouched: ${plan.unmatched.join(', ')}. Delete any you've sold, or keep them if you hold them at a broker that isn't connected.`
      );
    }
    if (plan.suspiciousEmpty) {
      warnings.push('Akahu returned no holdings, so nothing was removed. If you really sold everything, delete them manually.');
    }
    const toDelete = plan.toDelete;

    if (!preview) {
      for (const h of incoming) {
        const row: Record<string, any> = {
          shares: h.shares,
          buy_price: h.buyPrice,
          current_price: h.currentPrice,
          name: h.name,
          market: h.market,
          source: 'akahu',
          price_locked: h.priceLocked,
        };
        if (isPremium) row.is_verified = true;

        const current: any = byTicker.get(h.ticker);
        const { error } = current
          ? await supabase.from('holdings').update(row).eq('id', current.id)
          : await supabase.from('holdings').insert({ user_id: user.id, ticker: h.ticker, ...row });
        if (error) failed.push(`${h.ticker} (${error.message})`);
      }
      if (toDelete.length) {
        const { error } = await supabase.from('holdings').delete().in('id', toDelete.map((h) => h.id));
        if (error) failed.push(`removing sold positions (${error.message})`);
      }
    }
  }

  // ── KiwiSaver ───────────────────────────────────────────────────────────────
  let kiwisaverSynced = false;
  if (portfolio.kiwisaver.length > 0) {
    const sorted = [...portfolio.kiwisaver].sort((a, b) => b.balance - a.balance);
    const ks = sorted[0];
    if (sorted.length > 1) {
      warnings.push(`You have ${sorted.length} KiwiSaver accounts in Akahu; Fennec tracks one, so ${ks.provider} (the largest) was used.`);
    }
    kiwisaverSynced = true;
    if (!preview) {
      const fields = {
        provider: ks.provider,
        current_balance: ks.balance,
        akahu_account_id: ks.akahuAccountId,
        akahu_returns: ks.returns,
        // Akahu reports PIR as a fraction (0.28); Fennec stores a percentage.
        pir: ks.pir === null ? null : Math.round(ks.pir * 10000) / 100,
        akahu_synced_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      };
      const { data: row } = await supabase.from('fin_kiwisaver').select('id').eq('user_id', user.id).maybeSingle();
      const { error } = row
        ? await supabase.from('fin_kiwisaver').update(fields).eq('id', row.id)
        : await supabase.from('fin_kiwisaver').insert({ user_id: user.id, ...fields });
      if (error) failed.push(`KiwiSaver (${error.message})`);
    }
  }

  if (preview) {
    return res.json({ preview: true, added, updated, removed, unmatched, capped, warnings, kiwisaver: kiwisaverSynced, brokerAccounts: portfolio.brokerAccounts });
  }

  // ── Status snapshot (what the Portfolio and KiwiSaver pages display) ───────
  await supabase.from('akahu_sync_status').upsert(
    {
      user_id: user.id,
      synced_at: new Date().toISOString(),
      broker_accounts: portfolio.brokerAccounts,
      kiwisaver_accounts: portfolio.kiwisaver,
      warnings,
      capped,
    },
    { onConflict: 'user_id' }
  );

  // ── Verification: data straight from the broker is stronger evidence than a
  // CSV the user could have edited, so premium users are verified by it.
  let newBadges: any[] = [];
  if (isPremium && hasBroker && portfolio.holdings.length > 0) {
    const connections = [...new Set(portfolio.brokerAccounts.map((a) => a.connection))].join(', ');
    await saveVerification(user.id, {
      status: 'verified',
      verified_tickers: portfolio.holdings.map((h) => h.ticker),
      claude_notes: `Synced ${portfolio.holdings.length} holdings directly from ${connections} via Akahu.`,
      verified_at: new Date().toISOString(),
    });
    const { data: all } = await supabase
      .from('holdings')
      .select('ticker, shares, buy_price, current_price, sector, is_verified')
      .eq('user_id', user.id);
    newBadges = await evaluateAndAwardBadges(user.id, all || [], true);
  }

  if (failed.length) console.error('[akahu sync] failures:', failed);
  res.json({
    added, updated, removed, unmatched, capped, warnings, failed, newBadges,
    kiwisaver: kiwisaverSynced,
    brokerAccounts: portfolio.brokerAccounts,
  });
});

export default router;
