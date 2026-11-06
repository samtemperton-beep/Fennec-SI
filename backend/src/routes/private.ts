import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { requireAuth } from '../middleware/auth';
import {
  PRIVATE_FIELDS, isPrivateField, hintFor, loadPrivateFields, savePrivateFields,
  PrivateFieldError, encryptLegacyFields, type PrivateField,
} from '../services/privateFields';
import { TokenKeyError, TokenDecryptError, encryptionAvailable } from '../services/tokenCrypto';

// Encrypted personal details (IRD, GST and bank account numbers, home address).
// See services/privateFields.ts.

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

const router = Router();

function fail(res: any, e: any) {
  if (e instanceof PrivateFieldError) return res.status(400).json({ error: e.message });
  if (e instanceof TokenKeyError) {
    console.error('[private fields] key problem:', e.message);
    return res.status(503).json({ error: "Saved details can't be opened just now. We've been told." });
  }
  if (e instanceof TokenDecryptError) return res.status(500).json({ error: "A saved detail couldn't be read. Please enter it again." });
  console.error('[private fields]', e?.message ?? e);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

// Reveals are limited per person, so a stolen sign-in can't be used to pull
// details out quickly. Generous for normal use: one tap per field.
const REVEAL_LIMIT = 40;
const REVEAL_WINDOW_MS = 10 * 60_000;
const reveals = new Map<string, number[]>();
function revealAllowed(userId: string, n: number): boolean {
  const now = Date.now();
  const recent = (reveals.get(userId) ?? []).filter(t => now - t < REVEAL_WINDOW_MS);
  if (recent.length + n > REVEAL_LIMIT) { reveals.set(userId, recent); return false; }
  reveals.set(userId, [...recent, ...Array(n).fill(now)]);
  return true;
}

// GET /api/private/fields — which details are saved, with a hint for each.
router.get('/fields', requireAuth, async (req: any, res) => {
  try {
    const values = await loadPrivateFields(supabase, req.user.id);
    const fields: Record<string, { saved: boolean; hint: string | null }> = {};
    for (const f of Object.keys(PRIVATE_FIELDS) as PrivateField[]) {
      const v = values[f];
      fields[f] = { saved: !!v, hint: v ? hintFor(f, v) : null };
    }
    res.json({ fields });
  } catch (e) { fail(res, e); }
});

// POST /api/private/reveal { fields: [...] } — the values themselves, for the eye button.
router.post('/reveal', requireAuth, async (req: any, res) => {
  const wanted = Array.isArray(req.body?.fields) ? [...new Set(req.body.fields)] : [];
  if (!wanted.length || !wanted.every(isPrivateField)) return res.status(400).json({ error: 'Choose which details to show.' });
  if (!revealAllowed(req.user.id, wanted.length)) {
    return res.status(429).json({ error: "You've shown a lot of details in a short time. Wait a few minutes and try again." });
  }
  try {
    const values = await loadPrivateFields(supabase, req.user.id, wanted as PrivateField[]);
    res.json({ values: Object.fromEntries((wanted as PrivateField[]).map(f => [f, values[f] ?? null])) });
  } catch (e) { fail(res, e); }
});

// PUT /api/private/fields { ird_number?, gst_number?, bank_account?, home_address? }
// An empty string clears a detail.
router.put('/fields', requireAuth, async (req: any, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    await savePrivateFields(supabase, req.user.id, body);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

export default router;

/** Encrypts details saved in plain text before encryption existed. Run once at startup. */
export async function encryptLegacyOnStartup() {
  try {
    if (!encryptionAvailable()) { console.warn('[private fields] no key set; plain-text details left as they are'); return; }
    const n = await encryptLegacyFields(supabase);
    if (n) console.log(`[private fields] encrypted details for ${n} saved row(s)`);
  } catch (e: any) {
    console.warn('[private fields] startup encryption failed:', e?.message ?? e);
  }
}
