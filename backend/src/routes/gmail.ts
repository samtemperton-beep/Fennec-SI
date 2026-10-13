import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
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

// ── GET /api/gmail/auth-url ───────────────────────────────────────────────────
// Returns the Google OAuth URL for the frontend to redirect to
router.get('/auth-url', requireAuth, (req: any, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID not configured' });

  const redirectUri = `${process.env.BACKEND_URL || 'https://your-railway-app.railway.app'}/api/gmail/callback`;
  const state = req.user.id;

  const url = new URL(GMAIL_AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
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
  const { code, state: userId, error } = req.query as any;
  const frontendUrl = process.env.FRONTEND_URL || 'https://fennec-si-app.vercel.app';

  if (error) return res.redirect(`${frontendUrl}/app/settings?gmail_error=${error}`);
  if (!code || !userId) return res.redirect(`${frontendUrl}/app/settings?gmail_error=missing_params`);

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = `${process.env.BACKEND_URL || ''}/api/gmail/callback`;

  try {
    const tokenRes = await fetch(GMAIL_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const tokens = await tokenRes.json() as any;
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    await supabase.from('gmail_tokens').upsert({
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      gmail_email: null,
    }, { onConflict: 'user_id' });

    res.redirect(`${frontendUrl}/app/settings?gmail_connected=1`);
  } catch (e: any) {
    res.redirect(`${frontendUrl}/app/settings?gmail_error=${encodeURIComponent(e.message)}`);
  }
});

// ── GET /api/gmail/status ─────────────────────────────────────────────────────
router.get('/status', requireAuth, async (req: any, res) => {
  const { data } = await supabase.from('gmail_tokens').select('gmail_email, expires_at, last_scanned_at').eq('user_id', req.user.id).maybeSingle();
  res.json({ connected: !!data, email: data?.gmail_email, lastScanned: data?.last_scanned_at });
});

// ── DELETE /api/gmail/disconnect ──────────────────────────────────────────────
router.delete('/disconnect', requireAuth, async (req: any, res) => {
  await supabase.from('gmail_tokens').delete().eq('user_id', req.user.id);
  res.json({ ok: true });
});

// ── Helper: get a valid access token ─────────────────────────────────────────
async function getAccessToken(userId: string): Promise<string> {
  const { data } = await supabase.from('gmail_tokens').select('*').eq('user_id', userId).single();
  if (!data) throw new Error('Gmail not connected');

  if (new Date(data.expires_at) > new Date(Date.now() + 60000)) return data.access_token;

  // Refresh
  const r = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: data.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const tokens = await r.json() as any;
  if (tokens.error) throw new Error('Failed to refresh Gmail token: ' + tokens.error);

  await supabase.from('gmail_tokens').update({
    access_token: tokens.access_token,
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

function extractBody(msg: any): string {
  const parts = msg.payload?.parts || [msg.payload];
  for (const part of parts) {
    if (part?.mimeType === 'text/plain' && part?.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8').slice(0, 3000);
    }
  }
  for (const part of parts) {
    if (part?.mimeType === 'text/html' && part?.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8').replace(/<[^>]+>/g, ' ').slice(0, 3000);
    }
  }
  return msg.snippet || '';
}

function getHeader(msg: any, name: string): string {
  return msg.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

// ── POST /api/gmail/scan ──────────────────────────────────────────────────────
// Scan inbox for financial emails, parse with Claude, return structured items
router.post('/scan', requireAuth, async (req: any, res) => {
  const userId: string = req.user.id;
  const { userKey } = req.body;

  const { data: userRow } = await supabase.auth.admin.getUserById(userId);
  const anthropicKey = userRow?.user?.user_metadata?.anthropic_key || process.env.ANTHROPIC_API_KEY;
  const ai = userKey ? new Anthropic({ apiKey: userKey }) : anthropic;

  try {
    const token = await getAccessToken(userId);

    // Fetch emails from the last 90 days matching financial patterns
    const queries = [
      'subject:(invoice OR receipt OR rates OR statement OR "tax invoice") newer_than:90d',
      'from:(tauranga.govt.nz OR boprc.govt.nz OR payble.com OR xero.com OR myob.com) newer_than:90d',
    ];

    const allMessages: any[] = [];
    for (const q of queries) {
      const msgs = await fetchMessages(token, q, 15);
      for (const m of msgs) {
        if (!allMessages.find(e => e.id === m.id)) allMessages.push(m);
      }
    }

    if (!allMessages.length) return res.json({ items: [], scanned: 0 });

    // Parse each email with Claude
    const emailSummaries = allMessages.map(m => ({
      id: m.id,
      subject: getHeader(m, 'subject'),
      from: getHeader(m, 'from'),
      date: getHeader(m, 'date'),
      body: extractBody(m),
    }));

    const prompt = `You are a financial data extractor for a NZ personal finance app.

Analyse these emails and extract financial items. For each email, identify:
- Type: "invoice" | "bill" | "rates" | "receipt" | "statement" | "mortgage" | "insurance" | "subscription" | "other"
- Category: "business" | "household" | "personal"
- Amount (numeric, NZD, excl GST if stated separately)
- GST amount if shown
- Due date (ISO format if present)
- Description (brief, what it's for)
- Vendor/sender name
- Reference number if present
- Already paid: true/false (look for "payment confirmed", "direct debit", "paid" language)

Return a JSON array only, no markdown. Each item: { emailId, type, category, amount, gst, dueDate, description, vendor, reference, paid }
Skip emails that contain no extractable financial data (newsletters, marketing etc).

Emails:
${JSON.stringify(emailSummaries, null, 2)}`;

    const response = await ai.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    let items: any[] = [];
    try {
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) items = JSON.parse(jsonMatch[0]);
    } catch (_) {}

    // Save results to DB
    if (items.length) {
      await supabase.from('gmail_scanned_items').upsert(
        items.map(item => ({ ...item, user_id: userId, scanned_at: new Date().toISOString() })),
        { onConflict: 'user_id,email_id' }
      );
    }

    await supabase.from('gmail_tokens').update({ last_scanned_at: new Date().toISOString() }).eq('user_id', userId);

    res.json({ items, scanned: allMessages.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/gmail/items ──────────────────────────────────────────────────────
// Return previously scanned items
router.get('/items', requireAuth, async (req: any, res) => {
  const { data } = await supabase.from('gmail_scanned_items')
    .select('*')
    .eq('user_id', req.user.id)
    .order('scanned_at', { ascending: false })
    .limit(100);
  res.json({ items: data || [] });
});

export default router;
