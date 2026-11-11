import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAkahuCredentials, type AkahuCredentials } from './akahuCredentials';
import { AkahuTokensRejected } from './akahu';
import { clearAkahuProblem, setAkahuProblem } from './akahuHealth';
import { saveHealth, type AccountHealth } from './bankHealth';

// Bank-side Akahu sync: account balances into fin_accounts and new transactions
// into fin_transactions. Shared by POST /api/finance/sync (the Sync button) and
// the scheduled background sync, so bank and loan balances stay current for
// net worth history even when nobody presses Sync.

const AKAHU_BASE = 'https://api.akahu.io/v1';

// Each sync re-reads this many days before the last one. Banks often date a
// transaction a day or two before Akahu receives it, so asking only for
// transactions after the last sync would miss those for good. Duplicates are
// skipped by akahu_transaction_id.
const OVERLAP_DAYS = 14;

function makeAkahuClient(appToken: string, userToken: string) {
  const headers = { Authorization: `Bearer ${userToken}`, 'X-Akahu-Id': appToken };

  async function get(path: string) {
    const res = await fetch(`${AKAHU_BASE}${path}`, { headers });
    if (res.status === 401 || res.status === 403) throw new AkahuTokensRejected();
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
  try {
    return await syncAccounts(supabase, userId, creds);
  } catch (e: any) {
    await saveHealth(supabase, userId, { ok: false, error: e?.message ?? String(e) });
    throw e;
  }
}

async function syncAccounts(
  supabase: SupabaseClient,
  userId: string,
  creds: AkahuCredentials
): Promise<FinanceSyncResult> {
  const { appToken, userToken } = creds;
  const since: string | undefined = creds.lastSyncedAt
    ? new Date(Date.parse(creds.lastSyncedAt) - OVERLAP_DAYS * 86_400_000).toISOString()
    : undefined;
  const akahu = makeAkahuClient(appToken, userToken);

  let akahuAccounts: any[];
  try {
    akahuAccounts = await akahu.listAccounts();
  } catch (e) {
    if (e instanceof AkahuTokensRejected) await setAkahuProblem(supabase, userId, 'tokens');
    throw e;
  }
  let accountsUpserted = 0;
  let txsInserted = 0;
  const health: AccountHealth[] = [];

  for (const aa of akahuAccounts) {
    // Upsert account
    const { data: existing } = await supabase
      .from('fin_accounts')
      .select('id')
      .eq('user_id', userId)
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

    const h: AccountHealth = {
      name: String(aa.name ?? 'Account').slice(0, 80),
      bank: String(aa.connection?.name ?? 'Bank').slice(0, 60),
      type: String(aa.type ?? 'OTHER'),
      status: String(aa.status ?? 'ACTIVE'),
      refreshedTx: aa.refreshed?.transactions ?? null,
      refreshedBalance: aa.refreshed?.balance ?? null,
      newestTx: null,
      fetched: 0,
    };
    health.push(h);

    // Transactions since shortly before the last sync. One account failing
    // doesn't stop the others; bad tokens still stop everything.
    let txs: any[] = [];
    try {
      txs = await akahu.listTransactionsSince(aa._id, since);
    } catch (e: any) {
      if (e instanceof AkahuTokensRejected) throw e;
      h.error = String(e?.message ?? e).slice(0, 300);
      console.error(`[bank sync] user ${userId.slice(0, 8)} account transactions failed: ${h.error}`);
    }
    h.fetched = txs.length;
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
    const { data: newest } = await supabase.from('fin_transactions').select('date')
      .eq('account_id', accountId).order('date', { ascending: false }).limit(1).maybeSingle();
    h.newestTx = (newest as any)?.date ?? null;
  }

  // The tokens work, but a bank's own connection can lapse and need renewing.
  const lapsed = [...new Set(
    akahuAccounts.filter((a) => a.status === 'INACTIVE').map((a) => (a.connection?.name ?? a.name) as string)
  )];
  if (lapsed.length) await setAkahuProblem(supabase, userId, 'connection', lapsed.join(', '));
  else await clearAkahuProblem(supabase, userId);

  await saveHealth(supabase, userId, { ok: true, accounts: health, added: txsInserted });

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
