import type { SupabaseClient } from '@supabase/supabase-js';
import { FREE_MAX_HOLDINGS } from '../middleware/auth';
import { evaluateAndAwardBadges } from './badges';
import { fetchAkahuAccounts, mapAkahuAccounts, planHoldingSync } from './akahu';
import { buildSnapshotRows, saveSnapshots } from './snapshots';
import { loadAkahuCredentials } from './akahuCredentials';
import { saveVerification } from '../routes/premium';

// The whole "pull from Akahu and update Fennec" operation, independent of HTTP
// so the API route and the scheduled background sync share one implementation.

export class SyncError extends Error {
  constructor(public status: number, public body: Record<string, any>) {
    super(body.error ?? 'Sync failed');
  }
}

export interface SyncOptions {
  /** Report what would change without writing anything. */
  preview?: boolean;
  /**
   * Also delete holdings Akahu doesn't know about (manual entries, old CSV
   * imports). Off by default so a sync can't silently discard positions held
   * at a broker that isn't connected.
   */
  removeUnmatched?: boolean;
}

export async function runAkahuSync(
  supabase: SupabaseClient,
  userId: string,
  isPremium: boolean,
  opts: SyncOptions = {}
) {
  const preview = opts.preview === true;
  const removeUnmatched = opts.removeUnmatched === true;

  // Credential errors (missing key, undecryptable row) propagate as-is so the
  // caller can map them; everything else is a SyncError.
  const creds = await loadAkahuCredentials(supabase, userId);
  if (!creds) {
    throw new SyncError(400, { error: 'No Akahu tokens saved. Add them in Settings → Akahu.', code: 'no_credentials' });
  }

  let portfolio;
  try {
    portfolio = mapAkahuAccounts(await fetchAkahuAccounts(creds.appToken, creds.userToken));
  } catch (e: any) {
    throw new SyncError(502, { error: e.message });
  }

  const warnings = [...portfolio.warnings];
  const hasBroker = portfolio.brokerAccounts.length > 0;

  if (!hasBroker && portfolio.kiwisaver.length === 0) {
    throw new SyncError(404, {
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
      .eq('user_id', userId);
    if (existingErr) throw new SyncError(500, { error: existingErr.message });
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
          : await supabase.from('holdings').insert({ user_id: userId, ticker: h.ticker, ...row });
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
      const { data: row } = await supabase.from('fin_kiwisaver').select('id').eq('user_id', userId).maybeSingle();
      const { error } = row
        ? await supabase.from('fin_kiwisaver').update(fields).eq('id', row.id)
        : await supabase.from('fin_kiwisaver').insert({ user_id: userId, ...fields });
      if (error) failed.push(`KiwiSaver (${error.message})`);
    }
  }

  if (preview) {
    return { preview: true as const, added, updated, removed, unmatched, capped, warnings, kiwisaver: kiwisaverSynced, brokerAccounts: portfolio.brokerAccounts };
  }

  // ── Status snapshot (what the Portfolio and KiwiSaver pages display) ───────
  await supabase.from('akahu_sync_status').upsert(
    {
      user_id: userId,
      synced_at: new Date().toISOString(),
      broker_accounts: portfolio.brokerAccounts,
      kiwisaver_accounts: portfolio.kiwisaver,
      warnings,
      capped,
    },
    { onConflict: 'user_id' }
  );

  // ── Value history. Best-effort: a failure here must never fail the sync. ───
  const { rows: snapshotRows, skipped } = buildSnapshotRows(userId, portfolio);
  const snapshotError = await saveSnapshots(supabase, snapshotRows);
  if (snapshotError) console.error('[akahu sync] could not save history snapshot:', snapshotError);
  if (skipped.length) console.warn('[akahu sync]', skipped.join(' '));

  // ── Verification: data straight from the broker is stronger evidence than a
  // CSV the user could have edited, so premium users are verified by it.
  let newBadges: any[] = [];
  if (isPremium && hasBroker && portfolio.holdings.length > 0) {
    const connections = [...new Set(portfolio.brokerAccounts.map((a) => a.connection))].join(', ');
    await saveVerification(userId, {
      status: 'verified',
      verified_tickers: portfolio.holdings.map((h) => h.ticker),
      claude_notes: `Synced ${portfolio.holdings.length} holdings directly from ${connections} via Akahu.`,
      verified_at: new Date().toISOString(),
    });
    const { data: all } = await supabase
      .from('holdings')
      .select('ticker, shares, buy_price, current_price, sector, is_verified')
      .eq('user_id', userId);
    newBadges = await evaluateAndAwardBadges(userId, all || [], true);
  }

  if (failed.length) console.error('[akahu sync] failures:', failed);
  return {
    added, updated, removed, unmatched, capped, warnings, failed, newBadges,
    kiwisaver: kiwisaverSynced,
    brokerAccounts: portfolio.brokerAccounts,
    snapshots: snapshotError ? 0 : snapshotRows.length,
  };
}
