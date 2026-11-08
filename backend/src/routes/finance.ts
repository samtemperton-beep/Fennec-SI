import { Router } from 'express';
import { requireAuth, checkAndIncrementUsage } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { loadAkahuCredentials, saveAkahuCredentials, credentialsErrorResponse } from '../services/akahuCredentials';
import { syncFinanceAccounts } from '../services/financeSync';
import { clearAkahuProblem } from '../services/akahuHealth';
import { lookupProperty, LinzError } from '../services/linz';
import { readRatesNotice, RatesNoticeError } from '../services/ratesNotice';
import { loadPrivateFields } from '../services/privateFields';
import { loadSavedProperty, saveProperty } from '../services/propertyStore';

// "12 smith" from "12 Smith Street, Ponsonby": enough to spot a notice for another property.
const streetKey = (a: string | null | undefined) => (a || '').toLowerCase().match(/\d+[a-z]?\s+[a-z]+/)?.[0] ?? null;

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

  // Try the tokens before saving, so a bad paste fails here rather than later as
  // a sync that silently never works. Only a clear rejection blocks saving: if
  // Akahu can't be reached, the tokens may be fine.
  try {
    const check = await fetch('https://api.akahu.io/v1/me', {
      headers: { Authorization: `Bearer ${user_token.trim()}`, 'X-Akahu-Id': app_token.trim() },
      signal: AbortSignal.timeout(8000),
    });
    if (check.status === 401 || check.status === 403) {
      return res.status(400).json({
        error: "Akahu didn't accept those tokens. Check you've copied each one in full, into the right box, with no extra spaces.",
      });
    }
  } catch (e: any) {
    console.warn('[akahu] could not test tokens:', e?.message ?? e);
  }

  try {
    await saveAkahuCredentials(supabase, userId, app_token, user_token);
  } catch (e: any) {
    return credentialsErrorResponse(res, e);
  }
  await clearAkahuProblem(supabase, userId);
  res.json({ ok: true });
});

// ── DELETE /api/finance/akahu ────────────────────────────────────────────────
// Removes the saved tokens and everything they synced. Manual entries stay.
router.delete('/akahu', requireAuth, async (req: any, res) => {
  const { error } = await supabase.rpc('disconnect_akahu', { target: req.user.id });
  if (error) {
    console.error('[akahu] disconnect failed:', error.message);
    return res.status(500).json({ error: "We couldn't disconnect Akahu, and nothing was removed. Please try again." });
  }
  res.json({ ok: true });
});

// ── GET /api/finance/property/saved ───────────────────────────────────────────
// The last lookup and rates notice, so the page can show them straight away.
router.get('/property/saved', requireAuth, async (req: any, res) => {
  res.json(await loadSavedProperty(supabase, req.user.id));
});

// ── GET /api/finance/property ─────────────────────────────────────────────────
// Property details from LINZ (address, legal description, title, land area) for
// the Home Loan page. See services/linz.ts for why there are no sales or values.
// The address is the one saved (encrypted) on the person's home loan, so the
// browser doesn't need to hold it to look it up.
router.get('/property', requireAuth, async (req: any, res) => {
  const userId: string = req.user.id;
  let address: string | null = null;
  try {
    address = (await loadPrivateFields(supabase, userId, ['home_address'])).home_address;
  } catch (e: any) {
    console.error('[linz] could not read saved address:', e?.message ?? e);
    return res.status(500).json({ error: "Couldn't open your saved address. Please enter it again in Edit." });
  }
  if (!address) return res.status(400).json({ error: 'Add your property address in Edit first.' });

  const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(userId);
  if (userErr || !user) return res.status(401).json({ error: 'Unauthorised' });

  // One key for everyone, set on the server. A key someone saved in Settings
  // before that existed still works as a fallback.
  const linzKey = process.env.LINZ_API_KEY || user.user_metadata?.linz_key;
  if (!linzKey) return res.status(503).json({ error: "Property lookup isn't set up yet." });
  // Once the server has its own key, a copy saved on the account isn't needed.
  if (process.env.LINZ_API_KEY && user.user_metadata?.linz_key) {
    supabase.auth.admin.updateUserById(userId, { user_metadata: { linz_key: null } })
      .then(({ error }) => { if (error) console.warn('[linz] old key not removed:', error.message); });
  }

  try {
    const property = await lookupProperty(String(address).slice(0, 200), linzKey);
    const property_at = new Date().toISOString();
    await saveProperty(supabase, userId, { property, property_at });
    res.json({ ...property, saved_at: property_at });
  } catch (e: any) {
    if (e instanceof LinzError) return res.status(404).json({ error: e.message });
    console.error('[linz] lookup failed:', e?.message ?? e);
    res.status(502).json({ error: "Couldn't reach LINZ just now. Please try again." });
  }
});

// ── POST /api/finance/rates-notice ────────────────────────────────────────────
// Reads the council valuation from an uploaded rates notice, for councils that
// aren't in LINZ's open valuation roll. Counts as one AI use. The file isn't
// kept; the values read off it are saved (encrypted) so it needn't be read again.
router.post('/rates-notice', requireAuth, async (req: any, res) => {
  const file = req.body?.file;
  if (!file?.data || !file?.type) return res.status(400).json({ error: 'Choose a file first.' });
  if (!await checkAndIncrementUsage(req, res)) return;
  try {
    const notice = await readRatesNotice({ type: String(file.type), data: String(file.data) });
    // Compared here so the page can warn about a notice for another property
    // without holding the saved address.
    let matches_home: boolean | null = null;
    try {
      const home = (await loadPrivateFields(supabase, req.user.id, ['home_address'])).home_address;
      const a = streetKey(home), b = streetKey(notice.address);
      if (a && b) matches_home = a === b;
    } catch { /* no saved address to compare */ }
    const notice_at = new Date().toISOString();
    await saveProperty(supabase, req.user.id, { notice: { ...notice, matches_home }, notice_at });
    res.json({ ...notice, matches_home, saved_at: notice_at });
  } catch (e: any) {
    if (e instanceof RatesNoticeError) return res.status(422).json({ error: e.message });
    console.error('[rates notice] read failed:', e?.message ?? e);
    res.status(502).json({ error: "Couldn't read the document just now. Please try again." });
  }
});

export default router;
