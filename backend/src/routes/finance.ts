import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

const router = Router();

// ── Akahu client ──────────────────────────────────────────────────────────────
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

// ── POST /api/finance/sync ────────────────────────────────────────────────────
// Syncs the authenticated user's Akahu accounts into fin_accounts / fin_transactions.
// Reads tokens from the akahu_credentials table (stored by the user in Settings).
router.post('/sync', requireAuth, async (req: any, res) => {
  const userId: string = req.user.id;

  // Accept tokens from request body (preferred) or fall back to DB lookup
  let appToken: string = req.body?.app_token;
  let userToken: string = req.body?.user_token;
  let lastSyncedAt: string | undefined;

  if (!appToken || !userToken) {
    const { data: creds, error: credsErr } = await supabase
      .from('akahu_credentials')
      .select('app_token, user_token, last_synced_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (credsErr || !creds) {
      return res.status(400).json({ error: 'No Akahu credentials found. Add them in Finance > Settings.' });
    }
    appToken = creds.app_token;
    userToken = creds.user_token;
    lastSyncedAt = creds.last_synced_at;
  } else {
    // Still fetch last_synced_at for incremental sync
    const { data } = await supabase.from('akahu_credentials').select('last_synced_at').eq('user_id', userId).maybeSingle();
    lastSyncedAt = data?.last_synced_at;
  }

  const akahu = makeAkahuClient(appToken, userToken);

  try {
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

    res.json({ accounts: akahuAccounts.length, accountsNew: accountsUpserted, transactions: txsInserted });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/finance/credentials ────────────────────────────────────────────
// Save Akahu credentials for the authenticated user
router.post('/credentials', requireAuth, async (req: any, res) => {
  const userId: string = req.user.id;
  const { app_token, user_token } = req.body;
  if (!app_token || !user_token) return res.status(400).json({ error: 'app_token and user_token required' });

  const { error } = await supabase.from('akahu_credentials').upsert(
    { user_id: userId, app_token, user_token },
    { onConflict: 'user_id' }
  );
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
