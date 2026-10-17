import type { SupabaseClient } from '@supabase/supabase-js';
import type { MappedPortfolio } from './akahu';

// One row per account per day, recording what the provider reported. Akahu only
// ever exposes "now", so this is the only way to build a value history.
//
// Rows record the PROVIDER'S valuation (not Fennec's live-price overlay), so the
// series is consistent over time and matches what the broker itself shows.

export interface SnapshotRow {
  user_id: string;
  snapshot_date: string; // YYYY-MM-DD in NZ time, the day the provider's data is from
  kind: 'broker' | 'kiwisaver';
  account_id: string;
  label: string;
  currency: string;
  value: number; // broker: value of holdings (excl. cash). KiwiSaver: balance.
  cash: number | null;
  invested: number | null; // broker: cost basis. KiwiSaver: balance minus returns.
  returns: number | null;
  refreshed_at: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** YYYY-MM-DD for the given instant in New Zealand time. */
export function nzDate(iso?: string | Date | null): string {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(Number.isNaN(d.getTime()) ? new Date() : d);
}

export function buildSnapshotRows(
  userId: string,
  portfolio: MappedPortfolio,
  now: Date = new Date()
): { rows: SnapshotRow[]; skipped: string[] } {
  const rows: SnapshotRow[] = [];
  const skipped: string[] = [];

  for (const a of portfolio.brokerAccounts) {
    // A snapshot that doesn't reconcile may be double-counting; don't let it
    // pollute the history.
    if (a.reconciled === false) {
      skipped.push(`${a.connection}: holdings didn't reconcile with the provider's totals, so today's history point was skipped.`);
      continue;
    }
    rows.push({
      user_id: userId,
      // Date it by when the provider's data was true, not when we happened to sync.
      snapshot_date: nzDate(a.refreshedAt ?? now),
      kind: 'broker',
      account_id: a.akahuAccountId,
      label: a.connection,
      currency: a.currency,
      value: a.holdingsValue,
      cash: a.cashBalance,
      invested: a.costBasis,
      returns: a.returns,
      refreshed_at: a.refreshedAt,
    });
  }

  for (const k of portfolio.kiwisaver) {
    rows.push({
      user_id: userId,
      snapshot_date: nzDate(k.refreshedAt ?? now),
      kind: 'kiwisaver',
      account_id: k.akahuAccountId,
      label: k.provider,
      currency: 'NZD',
      value: round2(k.balance),
      cash: null,
      invested: k.returns === null ? null : round2(k.balance - k.returns),
      returns: k.returns === null ? null : round2(k.returns),
      refreshed_at: k.refreshedAt,
    });
  }

  return { rows, skipped };
}

/** Upserts snapshots (idempotent per account per day). Returns an error message, or null. */
export async function saveSnapshots(supabase: SupabaseClient, rows: SnapshotRow[]): Promise<string | null> {
  if (rows.length === 0) return null;
  const { error } = await supabase
    .from('balance_snapshots')
    .upsert(rows, { onConflict: 'user_id,snapshot_date,account_id' });
  return error ? error.message : null;
}
