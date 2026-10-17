import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { loadAkahuCredentials, saveAkahuCredentials, credentialsErrorResponse } from '../services/akahuCredentials';
import { syncFinanceAccounts } from '../services/financeSync';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

const router = Router();

// ── POST /api/finance/sync ────────────────────────────────────────────────────
// Syncs the authenticated user's Akahu accounts into fin_accounts / fin_transactions.
// Reads tokens from the akahu_credentials table (stored by the user in Settings).
router.post('/sync', requireAuth, async (req: any, res) => {
  const userId: string = req.user.id;

  // Tokens are only ever read server-side from the encrypted store. They are
  // deliberately not accepted in the request body: that would mean the browser
  // had held the plaintext tokens.
  let creds;
  try {
    creds = await loadAkahuCredentials(supabase, userId);
  } catch (e: any) {
    return credentialsErrorResponse(res, e);
  }
  if (!creds) {
    return res.status(400).json({ error: 'No Akahu credentials found. Add them in Settings → Akahu.' });
  }
  try {
    res.json(await syncFinanceAccounts(supabase, userId, creds));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/finance/credentials ────────────────────────────────────────────
// Save Akahu credentials for the authenticated user
router.post('/credentials', requireAuth, async (req: any, res) => {
  const userId: string = req.user.id;
  const { app_token, user_token } = req.body ?? {};
  if (typeof app_token !== 'string' || typeof user_token !== 'string' || !app_token || !user_token) {
    return res.status(400).json({ error: 'app_token and user_token required' });
  }

  try {
    await saveAkahuCredentials(supabase, userId, app_token, user_token);
  } catch (e: any) {
    return credentialsErrorResponse(res, e);
  }
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
    const safe = (s: string) => s.replace(/'/g, "''");
    const headers = { Authorization: `key ${linzKey}` };

    // 1. NZ Street Address layer (53353) — get coordinates + parcel id
    const addrParams = new URLSearchParams({
      service: 'WFS', version: '2.0.0', request: 'GetFeature',
      typeNames: 'layer-53353',
      outputFormat: 'application/json', count: '1',
      CQL_FILTER: `strToLowerCase(full_address) LIKE strToLowerCase('%${safe(address)}%')`,
    });
    const addrRes = await fetch(`${LINZ}?${addrParams}`, { headers });
    const addrText = await addrRes.text();
    let addrData: any = {};
    try { addrData = JSON.parse(addrText); } catch {
      return res.status(502).json({ error: `LINZ returned non-JSON (status ${addrRes.status}). Check your API key has data access scope.` });
    }

    const addrFeature = addrData?.features?.[0];
    const coords = addrFeature?.geometry?.coordinates; // [lng, lat]

    // 2. NZ Property Title layer (50804) — legal description, area
    let titleProps: any = {};
    try {
      const titleParams = new URLSearchParams({
        service: 'WFS', version: '2.0.0', request: 'GetFeature',
        typeNames: 'layer-50804',
        outputFormat: 'application/json', count: '1',
        CQL_FILTER: `strToLowerCase(title_no) IS NOT NULL`,
        ...(coords ? { CQL_FILTER: `DWITHIN(shape, POINT(${coords[0]} ${coords[1]}), 50, meters)` } : {}),
      });
      const titleRes = await fetch(`${LINZ}?${titleParams}`, { headers });
      const titleData = await titleRes.json() as any;
      titleProps = titleData?.features?.[0]?.properties || {};
    } catch (_) {}

    // 3. NZ Property Parcel layer (50772) — area and parcel details
    let parcelProps: any = {};
    try {
      if (coords) {
        const parcelParams = new URLSearchParams({
          service: 'WFS', version: '2.0.0', request: 'GetFeature',
          typeNames: 'layer-50772',
          outputFormat: 'application/json', count: '1',
          CQL_FILTER: `DWITHIN(shape, POINT(${coords[0]} ${coords[1]}), 50, meters)`,
        });
        const parcelRes = await fetch(`${LINZ}?${parcelParams}`, { headers });
        const parcelData = await parcelRes.json() as any;
        parcelProps = parcelData?.features?.[0]?.properties || {};
      }
    } catch (_) {}

    // 4. Recent nearby sales — NZ Property Sales (113083)
    let recentSales: { address: string; price: number; date: string }[] = [];
    try {
      if (coords) {
        const salesParams = new URLSearchParams({
          service: 'WFS', version: '2.0.0', request: 'GetFeature',
          typeNames: 'layer-113083',
          outputFormat: 'application/json', count: '10',
          CQL_FILTER: `DWITHIN(shape, POINT(${coords[0]} ${coords[1]}), 1000, meters)`,
          sortBy: 'date_of_contract D',
        });
        const salesRes = await fetch(`${LINZ}?${salesParams}`, { headers });
        if (salesRes.ok) {
          const salesData = await salesRes.json() as any;
          recentSales = (salesData?.features || []).map((f: any) => ({
            address: f.properties?.street_address || f.properties?.full_address || 'Nearby property',
            price: Number(f.properties?.sale_price || f.properties?.consideration || 0),
            date: f.properties?.date_of_contract || f.properties?.sale_date || '',
          })).filter((s: any) => s.price > 10000);
        }
      }
    } catch (_) {}

    const addrProps = addrFeature?.properties || {};

    res.json({
      rv: null, // LINZ does not publish RV via free WFS — enter manually or via council
      land_value: null,
      improvement_value: null,
      legal_description: titleProps?.title_no ? `Title ${titleProps.title_no}` : null,
      area_sqm: parcelProps?.area || addrProps?.parcel_area || null,
      full_address: addrProps?.full_address || null,
      suburb: addrProps?.suburb_locality || null,
      town: addrProps?.town_city || null,
      recent_sales: recentSales,
      source: 'LINZ Data Service (land.govt.nz)',
      debug: { addrFound: !!addrFeature, coords },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
