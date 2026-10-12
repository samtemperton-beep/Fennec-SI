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

// ── GET /api/finance/property ─────────────────────────────────────────────────
// Looks up RV and recent area sales from LINZ for a given NZ property address.
router.get('/property', requireAuth, async (req: any, res) => {
  const userId: string = req.user.id;
  const address = req.query.address as string;
  if (!address) return res.status(400).json({ error: 'address query param required' });

  const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(userId);
  if (userErr || !user) return res.status(401).json({ error: 'Unauthorised' });

  const linzKey = user.user_metadata?.linz_key;
  if (!linzKey) return res.status(400).json({ error: 'No LINZ API key. Add it in Settings.' });

  try {
    const LINZ = 'https://data.linz.govt.nz/services/wfs';
    const params = new URLSearchParams({
      service: 'WFS', version: '2.0.0', request: 'GetFeature',
      typeNames: 'layer-105569', // NZ Property Titles
      outputFormat: 'application/json',
      count: '1',
      CQL_FILTER: `strToLowerCase(full_address) LIKE strToLowerCase('%${address.replace(/'/g, "''")}%')`,
    });

    const titleRes = await fetch(`${LINZ}?${params}`, {
      headers: { Authorization: `key ${linzKey}` },
    });
    const titleData = await titleRes.json();

    // Get RV from NZ Property Rating Valuations
    const rvParams = new URLSearchParams({
      service: 'WFS', version: '2.0.0', request: 'GetFeature',
      typeNames: 'layer-105562',
      outputFormat: 'application/json',
      count: '1',
      CQL_FILTER: `strToLowerCase(address) LIKE strToLowerCase('%${address.replace(/'/g, "''")}%')`,
    });

    const rvRes = await fetch(`${LINZ}?${rvParams}`, {
      headers: { Authorization: `key ${linzKey}` },
    });
    const rvData = await rvRes.json();

    // Recent sales from NZ Property Sales layer
    let recentSales: { address: string; price: number; date: string }[] = [];
    try {
      const feature = titleData?.features?.[0];
      if (feature?.geometry) {
        const [lng, lat] = feature.geometry.type === 'Point'
          ? feature.geometry.coordinates
          : feature.geometry.coordinates[0][0];

        const salesParams = new URLSearchParams({
          service: 'WFS', version: '2.0.0', request: 'GetFeature',
          typeNames: 'layer-106645',
          outputFormat: 'application/json',
          count: '10',
          CQL_FILTER: `DWITHIN(shape, POINT(${lng} ${lat}), 500, meters)`,
          sortBy: 'sale_date+D',
        });

        const salesRes = await fetch(`${LINZ}?${salesParams}`, {
          headers: { Authorization: `key ${linzKey}` },
        });
        const salesData = await salesRes.json();

        recentSales = (salesData?.features || []).map((f: any) => ({
          address: f.properties?.full_address || f.properties?.address || 'Nearby property',
          price: f.properties?.sale_price || f.properties?.price || 0,
          date: f.properties?.sale_date || f.properties?.date || '',
        })).filter((s: any) => s.price > 0);
      }
    } catch (_) {}

    const rvFeature = rvData?.features?.[0]?.properties;

    res.json({
      rv: rvFeature?.capital_value || rvFeature?.cv || null,
      land_value: rvFeature?.land_value || null,
      improvement_value: rvFeature?.improvement_value || null,
      legal_description: titleData?.features?.[0]?.properties?.legal_description || null,
      area_sqm: titleData?.features?.[0]?.properties?.area_sq_metres || null,
      recent_sales: recentSales,
      source: 'LINZ Data Service',
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
