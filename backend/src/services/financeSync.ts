import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAkahuCredentials, type AkahuCredentials } from './akahuCredentials';

// Bank-side Akahu sync: account balances into fin_accounts and new transactions
// into fin_transactions. Shared by POST /api/finance/sync (the Sync button) and
// the scheduled background sync, so bank and loan balances stay current for
// net worth history even when nobody presses Sync.

const AKAHU_BASE = 'https://api.akahu.io/v1';

function makeAkahuClient(appToken: string, userToken: string) {
  const headers = { Authorization: `Bearer ${userToken}`, 'X-Akahu-Id': appToken };

  async function get(path: string) {
    const res = await fetch(`${AKAHU_BASE}${path}`, { headers });
    const body: any = await res.json();
    if (!res.ok || !body.success) throw new Error(`Akahu (${path}): ${body.message ?? res.statusText}`);
    return body;
  }

  async function listAccounts() { return (await get('/accounts')).items as any[]; }

  async function listTransactionsSince(accountId: string, since?: string) {
    const txs: any[] = [];
    let cursor: string | null = null;
    do {
      const q = new URLSearchParams();
      if (cursor) q.set('cursor', cursor);
      if (since) q.set('start', since);
      const qs = q.toString() ? '?' + q.toString() : '';
      const { items, cursor: next } = await get(`/accounts/${accountId}/transactions${qs}`);
      txs.push(...items);
      cursor = next?.next ?? null;
    } while (cursor);
    return txs;
  }

  return { listAccounts, listTransactionsSince };
}

export interface FinanceSyncResult {
  accounts: number;
  accountsNew: number;
  transactions: number;
}

/** Syncs one user's bank accounts and transactions. Throws on Akahu or database errors. */
export async function syncFinanceAccounts(
  supabase: SupabaseClient,
  userId: string,
  creds: AkahuCredentials
): Promise<FinanceSyncResult> {
  const { appToken, userToken } = creds;
  const lastSyncedAt: string | undefined = creds.lastSyncedAt ?? undefined;
  const akahu = makeAkahuClient(appToken, userToken);

  const akahuAccounts = await akahu.listAccounts();
  let accountsUpserted = 0;
  let txsInserted = 0;

  for (const aa of akahuAccounts) {
    // Upsert account
    const { data: existing } = await supabase
      .from('fin_accounts')
      .select('id')
      .eq('akahu_account_id', aa._id)
      .maybeSingle();

    let accountId: string;

    if (existing) {
      await supabase.from('fin_accounts').update({
        current_balance: aa.balance?.current ?? 0,
        last_synced: new Date().toISOString(),
      }).eq('id', existing.id);
      accountId = existing.id;
    } else {
      const { data: inserted, error: insErr } = await supabase.from('fin_accounts').insert({
        user_id: userId,
        owner: 'me',
        akahu_account_id: aa._id,
        name: aa.name,
        type: aa.type ?? 'OTHER',
        current_balance: aa.balance?.current ?? 0,
        last_synced: new Date().toISOString(),
      }).select('id').single();
      if (insErr) throw insErr;
      accountId = inserted!.id;
      accountsUpserted++;
    }

    // Sync transactions since last sync
    const txs = await akahu.listTransactionsSince(aa._id, lastSyncedAt);
    if (txs.length > 0) {
      const rows = txs.map((t: any) => ({
        user_id: userId,
        account_id: accountId,
        akahu_transaction_id: t._id,
        date: t.date,
        description: t.description,
        amount: t.amount,
      }));
      const { count } = await supabase
        .from('fin_transactions')
        .upsert(rows, { onConflict: 'akahu_transaction_id', ignoreDuplicates: true, count: 'exact' });
      txsInserted += count ?? 0;
    }
  }

  // Update last synced timestamp
  await supabase.from('akahu_credentials').update({ last_synced_at: new Date().toISOString() }).eq('user_id', userId);

  return { accounts: akahuAccounts.length, accountsNew: accountsUpserted, transactions: txsInserted };
}

/** For the scheduler: loads the user's tokens and syncs. Returns null if they have none. */
export async function syncFinanceForUser(supabase: SupabaseClient, userId: string): Promise<FinanceSyncResult | null> {
  const creds = await loadAkahuCredentials(supabase, userId);
  if (!creds) return null;
  return syncFinanceAccounts(supabase, userId, creds);
}
