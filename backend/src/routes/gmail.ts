import { Router } from 'express';
import { requireAuth, getPlatformSettings } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { encryptToken, decryptToken, isEncrypted } from '../services/tokenCrypto';
import { DEFAULT_MODEL } from '../services/claude';
import { reconcileInboxItems } from '../services/inboxReconcile';

// Node 20 has no native WebSocket, which supabase-js's realtime client needs at
// construction time. Without this transport the process throws on import and
// the whole server crash-loops (every other route already passes it).
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const router = Router();

const GMAIL_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid',
  'email',
].join(' ');

// OAuth state: the user id plus an expiry, sealed with the same authenticated
// encryption used for stored tokens. Google hands it back untouched, so the
// callback knows which user started the flow and that nobody forged it (a bare
// user id would let anyone attach their own Gmail to someone else's account).
const STATE_CONTEXT = 'gmail-oauth-state';
const STATE_TTL_MS = 15 * 60 * 1000;

function makeState(userId: string): string {
  return encryptToken(JSON.stringify({ uid: userId, exp: Date.now() + STATE_TTL_MS, n: crypto.randomBytes(8).toString('hex') }), STATE_CONTEXT);
}
function readState(state: string): string | null {
  try {
    const { uid, exp } = JSON.parse(decryptToken(state, STATE_CONTEXT));
    return typeof uid === 'string' && Date.now() < exp ? uid : null;
  } catch {
    return null;
  }
}

// Tokens are stored encrypted and bound to the owning user. Rows written before
// encryption was added are still readable, and get re-encrypted on next refresh.
const seal = (value: string | null | undefined, userId: string) => (value ? encryptToken(value, userId) : null);
const unseal = (value: string | null | undefined, userId: string) =>
  !value ? null : isEncrypted(value) ? decryptToken(value, userId) : value;

function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const backendUrl = process.env.BACKEND_URL?.replace(/\/+$/, '');
  const frontendUrl = (process.env.FRONTEND_URL || 'https://fennec-si-app.vercel.app').replace(/\/+$/, '');
  const missing = [
    !clientId && 'GOOGLE_CLIENT_ID',
    !clientSecret && 'GOOGLE_CLIENT_SECRET',
    !backendUrl && 'BACKEND_URL',
  ].filter(Boolean) as string[];
  return { clientId, clientSecret, frontendUrl, redirectUri: `${backendUrl}/api/gmail/callback`, missing };
}

// ── GET /api/gmail/auth-url ───────────────────────────────────────────────────
// Returns the Google OAuth URL for the frontend to redirect to
router.get('/auth-url', requireAuth, (req: any, res) => {
  const c = config();
  if (c.missing.length) {
    return res.status(500).json({ error: `Gmail isn't set up on the server yet (missing ${c.missing.join(', ')}).` });
  }
  let state: string;
  try {
    state = makeState(req.user.id);
  } catch (e: any) {
    return res.status(500).json({ error: `Gmail can't be connected: ${e.message}` });
  }

  const url = new URL(GMAIL_AUTH_URL);
  url.searchParams.set('client_id', c.clientId!);
  url.searchParams.set('redirect_uri', c.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  res.json({ url: url.toString() });
});

// ── GET /api/gmail/callback ───────────────────────────────────────────────────
// Google redirects here with auth code — exchange for tokens and store
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query as any;
  const c = config();
  const back = (qs: string) => res.redirect(`${c.frontendUrl}/app/finance/inbox?${qs}`);

  if (error) return back(`gmail_error=${encodeURIComponent(error)}`);
  const userId = typeof state === 'string' ? readState(state) : null;
  if (!code || !userId) return back('gmail_error=' + encodeURIComponent('The sign-in link expired or was invalid. Please try connecting again.'));
  if (c.missing.length) return back('gmail_error=' + encodeURIComponent('Gmail is not set up on the server.'));

  try {
    const tokenRes = await fetch(GMAIL_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: c.clientId!, client_secret: c.clientSecret!, redirect_uri: c.redirectUri, grant_type: 'authorization_code' }),
    });
    const tokens = await tokenRes.json() as any;
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    // Which mailbox was connected, so Settings and the Inbox page can show it.
    let gmailEmail: string | null = null;
    try {
      const prof = await fetch(`${GMAIL_API}/users/me/profile`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      gmailEmail = ((await prof.json()) as any)?.emailAddress ?? null;
    } catch { /* not essential */ }

    const { error: dbErr } = await supabase.from('gmail_tokens').upsert({
      user_id: userId,
      access_token: seal(tokens.access_token, userId),
      refresh_token: seal(tokens.refresh_token, userId),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      gmail_email: gmailEmail,
    }, { onConflict: 'user_id' });
    if (dbErr) throw new Error(dbErr.message);

    back('gmail_connected=1');
  } catch (e: any) {
    back(`gmail_error=${encodeURIComponent(e.message)}`);
  }
});

// ── GET /api/gmail/status ─────────────────────────────────────────────────────
router.get('/status', requireAuth, async (req: any, res) => {
  const { data } = await supabase.from('gmail_tokens').select('gmail_email, expires_at, last_scanned_at').eq('user_id', req.user.id).maybeSingle();
  res.json({ connected: !!data, email: data?.gmail_email, lastScanned: data?.last_scanned_at, configured: config().missing.length === 0 });
});

// ── DELETE /api/gmail/disconnect ──────────────────────────────────────────────
router.delete('/disconnect', requireAuth, async (req: any, res) => {
  const userId = req.user.id;
  // Revoke at Google too, so the access is really gone (best-effort).
  try {
    const { data } = await supabase.from('gmail_tokens').select('refresh_token, access_token').eq('user_id', userId).maybeSingle();
    const token = unseal(data?.refresh_token, userId) || unseal(data?.access_token, userId);
    if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' });
  } catch { /* still remove our copy */ }
  await supabase.from('gmail_tokens').delete().eq('user_id', userId);
  res.json({ ok: true });
});

// ── Helper: get a valid access token ─────────────────────────────────────────
async function getAccessToken(userId: string): Promise<string> {
  const { data } = await supabase.from('gmail_tokens').select('*').eq('user_id', userId).single();
  if (!data) throw new Error('Gmail not connected');

  if (new Date(data.expires_at) > new Date(Date.now() + 60000)) return unseal(data.access_token, userId)!;

  const refreshToken = unseal(data.refresh_token, userId);
  if (!refreshToken) throw new Error('Gmail needs reconnecting (no refresh token). Disconnect and connect again.');

  const c = config();
  const r = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.clientId!,
      client_secret: c.clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const tokens = await r.json() as any;
  if (tokens.error) {
    // invalid_grant: access was revoked, or Google expired it (apps left in
    // "Testing" mode lose refresh tokens after 7 days).
    throw new Error(tokens.error === 'invalid_grant'
      ? 'Gmail access has expired. Disconnect and connect Gmail again.'
      : 'Failed to refresh Gmail token: ' + tokens.error);
  }

  await supabase.from('gmail_tokens').update({
    access_token: seal(tokens.access_token, userId),
    // Re-seal the refresh token too, which upgrades any pre-encryption row.
    refresh_token: seal(tokens.refresh_token || refreshToken, userId),
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }).eq('user_id', userId);

  return tokens.access_token;
}

// ── Helper: fetch Gmail messages matching a query ─────────────────────────────
async function fetchMessages(token: string, query: string, maxResults = 20) {
  const listRes = await fetch(
    `${GMAIL_API}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const list = await listRes.json() as any;
  if (list.error) throw new Error(`Gmail: ${list.error.message ?? list.error.status ?? 'request failed'}`);
  if (!list.messages) return [];

  const messages = await Promise.all(
    list.messages.map(async (m: any) => {
      const msgRes = await fetch(`${GMAIL_API}/users/me/messages/${m.id}?format=full`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return msgRes.json();
    })
  );
  return messages;
}

function decodePart(data: string): string {
  // Gmail bodies are base64url, not plain base64.
  return Buffer.from(data, 'base64url').toString('utf-8');
}

// Walks nested multipart bodies (multipart/alternative inside multipart/mixed is common).
function findPart(part: any, mime: string): any | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return part;
  for (const p of part.parts ?? []) {
    const hit = findPart(p, mime);
    if (hit) return hit;
  }
  return null;
}

function extractBody(msg: any): string {
  const plain = findPart(msg.payload, 'text/plain');
  if (plain) return decodePart(plain.body.data).slice(0, 3000);
  const html = findPart(msg.payload, 'text/html');
  if (html) return decodePart(html.body.data).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000);
  return msg.snippet || '';
}

function getHeader(msg: any, name: string): string {
  return msg.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

const ITEM_TYPES = new Set(['invoice', 'bill', 'rates', 'receipt', 'statement', 'mortgage', 'insurance', 'subscription', 'other']);
const ITEM_CATEGORIES = new Set(['business', 'household', 'personal']);
const numOrNull = (v: any) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const dateOrNull = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const normRef = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** "Sam <sam@x.com>" -> "sam@x.com" */
const emailAddress = (header: string) => (header.match(/<([^>]+)>/)?.[1] ?? header).trim().toLowerCase();
/** Loose company-name match: ignores case, punctuation and a trailing Ltd/Limited. */
const sameName = (a: any, b: string) => {
  const x = normRef(String(a ?? '')).replace(/(ltd|limited)$/, '');
  const y = normRef(b).replace(/(ltd|limited)$/, '');
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};
/** RFC 2822 Date header -> YYYY-MM-DD in NZ time, or null. */
const emailDate = (header: string) => {
  const d = new Date(header);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(d);
};

// ── POST /api/gmail/scan ──────────────────────────────────────────────────────
// Scan inbox for financial emails, parse with Claude, return structured items
router.post('/scan', requireAuth, async (req: any, res) => {
  const userId: string = req.user.id;
  const { userKey } = req.body ?? {};
  const ai = userKey ? new Anthropic({ apiKey: userKey }) : anthropic;

  try {
    const token = await getAccessToken(userId);

    // Fetch emails from the last 90 days matching financial patterns
    const queries = [
      'subject:(invoice OR receipt OR rates OR statement OR "tax invoice" OR bill OR "payment due") newer_than:90d',
      'from:(tauranga.govt.nz OR boprc.govt.nz OR payble.com OR xero.com OR myob.com) newer_than:90d',
    ];

    const allMessages: any[] = [];
    for (const q of queries) {
      const msgs = await fetchMessages(token, q, 15);
      for (const m of msgs) {
        if (m?.id && !allMessages.find(e => e.id === m.id)) allMessages.push(m);
      }
    }

    if (!allMessages.length) return res.json({ items: [], scanned: 0 });

    const emailSummaries = allMessages.map(m => ({
      id: m.id,
      subject: getHeader(m, 'subject'),
      from: getHeader(m, 'from'),
      to: getHeader(m, 'to'),
      date: getHeader(m, 'date'),
      body: extractBody(m),
    }));

    // Who the user is, so invoices they SENT aren't mistaken for bills to pay.
    const [{ data: tokenRow }, { data: biz }, { data: ownInvoices }] = await Promise.all([
      supabase.from('gmail_tokens').select('gmail_email').eq('user_id', userId).maybeSingle(),
      supabase.from('business_settings').select('business_name, business_email').eq('user_id', userId).maybeSingle(),
      supabase.from('business_invoices').select('invoice_number, client_name').eq('user_id', userId),
    ]);
    const ownEmails = [tokenRow?.gmail_email, biz?.business_email, req.user.email]
      .filter((e): e is string => typeof e === 'string' && e.includes('@'))
      .map(e => e.toLowerCase());
    const businessName: string | null = biz?.business_name || null;
    const invoiceByRef = new Map((ownInvoices ?? []).map((i: any) => [normRef(i.invoice_number), i.client_name as string]));

    const prompt = `You are a financial data extractor for a NZ personal finance app.

About the user (use this to work out which way the money flows):
- Their own email addresses: ${ownEmails.join(', ') || 'unknown'}
- Their own business: ${businessName || 'unknown'}

Analyse these emails and extract financial items. For each email, identify:
- Type: "invoice" | "bill" | "rates" | "receipt" | "statement" | "mortgage" | "insurance" | "subscription" | "other"
- Category: "business" | "household" | "personal"
- Direction: "payable" if the user has to pay it, or "receivable" if someone owes the user. An invoice issued BY the user's own business (including a copy the user sent or cc'd to themselves) is "receivable".
- Vendor: the business that issued the document
- Counterparty: who the money goes to (payable) or comes from (receivable). For an invoice the user's business issued, this is the customer it was billed to.
- Amount: the total to be paid, in NZD, INCLUDING GST
- GST amount if shown
- Due date (ISO format if present)
- Description (brief, what it's for)
- Reference / invoice number if present
- Already paid: true/false (look for "payment confirmed", "direct debit", "paid" language)

Return a JSON array only, no markdown. Each item: { emailId, type, category, direction, vendor, counterparty, amount, gst, dueDate, description, reference, paid }
Skip emails that contain no extractable financial data (newsletters, marketing etc).

Emails:
${JSON.stringify(emailSummaries, null, 2)}`;

    const settings = await getPlatformSettings();
    const response = await ai.messages.create({
      model: settings['model_inbox'] || DEFAULT_MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    let parsed: any[] = [];
    try {
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (_) {}

    const byId = new Map(allMessages.map(m => [m.id, m]));
    const scannedAt = new Date().toISOString();
    const str = (v: any, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

    // The model answers in camelCase; the table (and the Inbox page) use snake_case.
    const rows = parsed
      .filter(i => i && typeof i.emailId === 'string' && byId.has(i.emailId))
      .map(i => {
        const msg = byId.get(i.emailId);
        const reference = str(i.reference, 200);
        let direction: 'payable' | 'receivable' = i.direction === 'receivable' ? 'receivable' : 'payable';
        let counterparty = str(i.counterparty, 200);
        let category = ITEM_CATEGORIES.has(i.category) ? i.category : 'personal';

        // Firm rules override the model:
        // 1. The reference is one of the user's own Fennec invoices -> it's owed to them.
        const ownClient = reference ? invoiceByRef.get(normRef(reference)) : undefined;
        if (ownClient !== undefined) {
          direction = 'receivable';
          counterparty = ownClient || counterparty;
          category = 'business';
        // 2. Sent from the user's own address and issued by their business -> also theirs.
        } else if (ownEmails.includes(emailAddress(getHeader(msg, 'from'))) && businessName && sameName(i.vendor, businessName)) {
          direction = 'receivable';
          category = 'business';
        }

        return {
          user_id: userId,
          email_id: i.emailId,
          type: ITEM_TYPES.has(i.type) ? i.type : 'other',
          category,
          direction,
          counterparty,
          amount: numOrNull(i.amount),
          gst: numOrNull(i.gst),
          due_date: dateOrNull(i.dueDate),
          email_date: emailDate(getHeader(msg, 'date')),
          description: str(i.description, 500),
          vendor: str(i.vendor, 200) ?? 'Unknown',
          reference,
          paid: i.paid === true,
          scanned_at: scannedAt,
        };
      });

    if (rows.length) {
      // A rescan must not undo a bank match the user already has.
      const { data: existing } = await supabase.from('gmail_scanned_items')
        .select('email_id, paid').eq('user_id', userId).in('email_id', rows.map(r => r.email_id));
      const alreadyPaid = new Set((existing ?? []).filter((e: any) => e.paid).map((e: any) => e.email_id));
      for (const r of rows) if (alreadyPaid.has(r.email_id)) r.paid = true;

      let { error: saveErr } = await supabase.from('gmail_scanned_items').upsert(rows, { onConflict: 'user_id,email_id' });
      if (saveErr && /column/i.test(saveErr.message)) {
        // inbox_reconcile_migration.sql not run yet: save what the old table can hold.
        const legacy = rows.map(({ direction, counterparty, email_date, ...rest }) => rest);
        ({ error: saveErr } = await supabase.from('gmail_scanned_items').upsert(legacy, { onConflict: 'user_id,email_id' }));
      }
      if (saveErr) throw new Error(`Couldn't save scanned items: ${saveErr.message}`);
    }

    await supabase.from('gmail_tokens').update({ last_scanned_at: scannedAt }).eq('user_id', userId);
    const settled = await reconcileInboxItems(supabase, userId).catch(() => 0);

    res.json({ items: rows, scanned: allMessages.length, settled });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/gmail/items ──────────────────────────────────────────────────────
// Return previously scanned items, after checking the bank for any that have
// since been paid.
router.get('/items', requireAuth, async (req: any, res) => {
  await reconcileInboxItems(supabase, req.user.id).catch(() => 0);
  const { data } = await supabase.from('gmail_scanned_items')
    .select('*')
    .eq('user_id', req.user.id)
    .order('scanned_at', { ascending: false })
    .limit(100);
  res.json({ items: data || [] });
});

// ── PATCH /api/gmail/items/:id ────────────────────────────────────────────────
// Dismiss / restore an item, or mark it paid or unpaid by hand.
router.patch('/items/:id', requireAuth, async (req: any, res) => {
  const { dismissed, paid } = req.body ?? {};
  const update: Record<string, any> = {};
  if (typeof dismissed === 'boolean') update.dismissed = dismissed;
  if (typeof paid === 'boolean') {
    update.paid = paid;
    // Unmarking releases the bank transaction so it can match something else.
    if (!paid) Object.assign(update, { matched_transaction_id: null, paid_date: null, matched_at: null });
  }
  if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });
  const { data, error } = await supabase.from('gmail_scanned_items')
    .update(update).eq('id', req.params.id).eq('user_id', req.user.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json({ item: data });
});

export default router;
