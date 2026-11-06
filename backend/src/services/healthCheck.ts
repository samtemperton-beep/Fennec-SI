import type { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';
import { complete, MODELS } from './llm';
import { emailAdmins, escapeHtml as esc } from './adminEmail';
import { lookupProperty, valuationRollCoverage } from './linz';
import { encryptionAvailable } from './tokenCrypto';

// The nightly health check. It visits the website and the API the way a visitor
// would, asks each AI model for a one-word reply, checks the database and the
// background bank sync, and reports server errors since the last run. Results
// are saved to health_checks for the admin page, and failures are emailed.

export interface CheckResult { group: string; name: string; ok: boolean; ms: number; detail: string }

const TIMEOUT_MS = 20_000;
// NZ time, so it runs late at night for the people using Fennec.
const RUN_FROM_HOUR = 2;
const RUN_UNTIL_HOUR = 6;
const TICK_MS = 15 * 60 * 1000;

// ── Server errors between runs ──────────────────────────────────────────────
// Counted in memory, so a redeploy starts the count again.
let errorsSince = new Date();
const serverErrors = new Map<string, number>();

/** Express middleware: counts 5xx responses by route. */
export function countServerErrors(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => {
    if (res.statusCode < 500) return;
    // Route path, not the full URL, so ids and tickers don't split the count.
    const key = `${req.method} ${req.baseUrl}${req.route?.path ?? ''}`;
    serverErrors.set(key, (serverErrors.get(key) ?? 0) + 1);
  });
  next();
}

async function timed(group: string, name: string, fn: () => Promise<string>, timeoutMs = TIMEOUT_MS): Promise<CheckResult> {
  const start = Date.now();
  try {
    const detail = await Promise.race([
      fn(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error(`No answer after ${timeoutMs / 1000}s`)), timeoutMs)),
    ]);
    return { group, name, ok: true, ms: Date.now() - start, detail };
  } catch (e: any) {
    return { group, name, ok: false, ms: Date.now() - start, detail: String(e?.message ?? e).slice(0, 300) };
  }
}

/** Fetches a URL and checks the status (and optionally the body). */
async function page(url: string, expect: { status?: number[]; contains?: string; json?: (body: any) => string | null }) {
  const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Fennec health check' } });
  const statuses = expect.status ?? [200];
  if (!statuses.includes(res.status)) throw new Error(`Status ${res.status}, expected ${statuses.join(' or ')}`);
  if (expect.contains) {
    const text = await res.text();
    if (!text.includes(expect.contains)) throw new Error(`Page loaded but "${expect.contains}" is missing`);
  }
  if (expect.json) {
    const problem = expect.json(await res.json());
    if (problem) throw new Error(problem);
  }
  return `Status ${res.status}`;
}

export async function runHealthCheck(supabase: SupabaseClient): Promise<CheckResult[]> {
  const site = (process.env.FRONTEND_URL || 'https://www.fennecsi.com').replace(/\/+$/, '');
  const api = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/+$/, '');
  const checks: Promise<CheckResult>[] = [];

  // Website. Signed-in pages should send a visitor without a session to sign in.
  const pages: [string, string][] = [['Home', '/'], ['Sign in', '/login'], ['FAQ', '/faq'], ['Privacy', '/privacy'], ['Terms', '/terms']];
  for (const [name, path] of pages) {
    checks.push(timed('Website', name, () => page(site + path, { contains: 'Fennec' })));
  }
  for (const path of ['/app/dashboard', '/app/portfolio', '/app/finance/accounts', '/app/settings']) {
    checks.push(timed('Website', `${path} asks for sign-in`, async () => {
      const res = await fetch(site + path, { redirect: 'manual' });
      const to = res.headers.get('location') || '';
      if (res.status < 300 || res.status >= 400 || !to.includes('/login')) throw new Error(`Status ${res.status}${to ? ` to ${to}` : ''}, expected a redirect to sign-in`);
      return 'Redirects to sign-in';
    }));
  }

  // API, through its public address.
  checks.push(timed('API', 'Server up', () => page(`${api}/health`, { json: b => b?.status === 'ok' ? null : 'Unexpected reply' })));
  checks.push(timed('API', 'FAQ', () => page(`${api}/api/faq`, { json: b => Array.isArray(b) && b.length ? null : 'Empty list' })));
  for (const ticker of ['AAPL', 'FPH.NZ', 'CBA.AX']) {
    checks.push(timed('Market data', `${ticker} price`, () => page(`${api}/api/prices/quote/${ticker}`, {
      json: b => (typeof b?.price === 'number' && b.price > 0 ? null : 'No price in the reply'),
    })));
  }
  checks.push(timed('Market data', 'USD to NZD rate', () => page(`${api}/api/prices/fx`, { json: b => (b ? null : 'No rate') })));
  checks.push(timed('Market data', 'News', () => page(`${api}/api/news`, { json: b => (Array.isArray(b) && b.length ? null : 'No news items') })));

  // AI: every model the app can use, with the smallest possible request.
  for (const model of MODELS) {
    checks.push(timed('AI', model, async () => {
      const text = await complete({ model, maxTokens: 10, messages: [{ role: 'user', content: 'Reply with the single word OK.' }] });
      if (!text.trim()) throw new Error('Empty reply');
      return `Replied "${text.trim().slice(0, 20)}"`;
    }));
  }

  // LINZ property lookup (Home Loan page), on a well-known address.
  checks.push(timed('Property data', 'LINZ lookup', async () => {
    const key = process.env.LINZ_API_KEY;
    if (!key) throw new Error('LINZ_API_KEY is not set');
    const p = await lookupProperty('1 Queen Street, Auckland Central, Auckland', key);
    if (!p.legal_description && !p.title_no) throw new Error(`Found ${p.full_address} but no property boundary for it`);
    const cv = p.valuation?.capital_value ? `, CV $${p.valuation.capital_value.toLocaleString('en-NZ')}` : ', no open valuation for this council';
    return `${p.full_address}: ${p.legal_description ?? p.title_no}${p.area_sqm ? `, ${p.area_sqm} m²` : ''}${cv}`;
  }));
  // Information only: which councils' valuations Fennec can show.
  checks.push(timed('Property data', 'Councils with open valuations', async () => {
    const key = process.env.LINZ_API_KEY;
    if (!key) throw new Error('LINZ_API_KEY is not set');
    const list = await valuationRollCoverage(key);
    if (!list.length) return 'None found in the open valuation roll';
    const total = list.reduce((s, c) => s + c.properties, 0);
    return `${list.length} councils, ${total.toLocaleString('en-NZ')} properties: ${list.map(c => `${c.name} (${c.properties.toLocaleString('en-NZ')})`).join(', ')}`;
  }, 60_000));

  // Database and the background bank sync.
  checks.push(timed('Database', 'Reachable', async () => {
    const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return `${count ?? 0} accounts`;
  }));
  checks.push(timed('Bank sync', 'Background sync is running', async () => {
    const { data, error } = await supabase.from('akahu_credentials').select('last_synced_at');
    if (error) throw new Error(error.message);
    if (!data?.length) return 'No bank connections yet';
    const latest = Math.max(...data.map(r => (r.last_synced_at ? Date.parse(r.last_synced_at) : 0)));
    const hours = (Date.now() - latest) / 3_600_000;
    if (hours > 13) throw new Error(`Last sync ${Math.round(hours)} hours ago (it runs every 6 hours)`);
    return `${data.length} connections, last sync ${hours < 1 ? 'under an hour' : `${Math.round(hours)} hours`} ago`;
  }));
  checks.push(timed('Bank sync', 'Connections needing attention', async () => {
    const { data, error } = await supabase.from('akahu_connection_status').select('problem');
    if (error) throw new Error(error.message);
    // A person's own expired connection isn't an outage, so this is information only.
    return data?.length ? `${data.length} people need to reconnect (${data.map(d => d.problem).join(', ')})` : 'None';
  }));

  // Setup the features depend on.
  checks.push(timed('Setup', 'Server settings', async () => {
    const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'RESEND_API_KEY', 'FRONTEND_URL', 'BACKEND_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'FINNHUB_API_KEY', 'LINZ_API_KEY'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`);
    return 'All set';
  }));

  // Bank tokens and IRD/GST/bank numbers and home addresses are encrypted with
  // this key; anything still in plain text means the startup pass hasn't run.
  checks.push(timed('Setup', 'Encryption', async () => {
    if (!encryptionAvailable()) throw new Error('AKAHU_TOKEN_KEY is missing or unusable, so saved details can’t be encrypted or opened');
    const plain = (rows: any[] | null, cols: string[]) =>
      (rows ?? []).filter(r => cols.some(c => typeof r[c] === 'string' && r[c] && !r[c].startsWith('enc:'))).length;
    const [biz, home] = await Promise.all([
      supabase.from('business_settings').select('ird_number, gst_number, bank_account'),
      supabase.from('home_loan').select('address'),
    ]);
    if (biz.error || home.error) throw new Error((biz.error ?? home.error)!.message);
    const left = plain(biz.data, ['ird_number', 'gst_number', 'bank_account']) + plain(home.data, ['address']);
    if (left) throw new Error(`${left} saved row(s) still have details in plain text`);
    return 'Key set; all saved details encrypted';
  }));

  const results = await Promise.all(checks);

  // Server errors since the last run, then start counting again.
  const total = [...serverErrors.values()].reduce((a, b) => a + b, 0);
  const top = [...serverErrors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} (${n})`).join(', ');
  results.push({
    group: 'API', name: 'Server errors since last check', ms: 0,
    // A few are normal (a provider hiccup); lots means something is broken.
    ok: total < 25,
    detail: total ? `${total} since ${errorsSince.toISOString().slice(0, 16).replace('T', ' ')} UTC: ${top}` : `None since ${errorsSince.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  });
  serverErrors.clear();
  errorsSince = new Date();

  return results;
}

/** Runs the check, saves it, and emails the admins if anything failed. */
export async function runAndRecord(supabase: SupabaseClient, trigger: 'scheduled' | 'manual') {
  const results = await runHealthCheck(supabase);
  const failed = results.filter(r => !r.ok);
  const { error } = await supabase.from('health_checks').insert({ trigger, ok: failed.length === 0, failed: failed.length, results });
  if (error) console.error('[health check] could not save results:', error.message);
  await supabase.from('health_checks').delete().lt('ran_at', new Date(Date.now() - 90 * 86_400_000).toISOString());

  if (failed.length && trigger === 'scheduled') {
    const rows = failed.map(r => `<li><strong>${esc(r.group)}: ${esc(r.name)}</strong><br>${esc(r.detail)}</li>`).join('');
    const site = (process.env.FRONTEND_URL || 'https://www.fennecsi.com').replace(/\/+$/, '');
    const err = await emailAdmins(supabase, {
      subject: `Fennec health check: ${failed.length} problem${failed.length === 1 ? '' : 's'}`,
      html: `<p>Last night's check found ${failed.length} of ${results.length} checks failing:</p><ul>${rows}</ul>
<p>Full results are on the <a href="${site}/app/admin">admin page</a>, under Health.</p>`,
    });
    if (err) console.error('[health check] could not email admins:', err);
  }
  return { ok: failed.length === 0, failed: failed.length, results };
}

const nzNow = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
};

let running = false;

/** Once a night between 2am and 6am NZ time. A restart doesn't cause a second run. */
export function startNightlyHealthCheck(client?: SupabaseClient) {
  const supabase =
    client ?? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { realtime: { transport: ws as any } });
  async function tick() {
    const now = nzNow();
    if (running || now.hour < RUN_FROM_HOUR || now.hour >= RUN_UNTIL_HOUR) return;
    running = true;
    try {
      const { data } = await supabase.from('health_checks').select('ran_at').eq('trigger', 'scheduled')
        .order('ran_at', { ascending: false }).limit(1).maybeSingle();
      const lastNz = data?.ran_at
        ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date(data.ran_at))
        : null;
      if (lastNz === now.date) return;
      const r = await runAndRecord(supabase, 'scheduled');
      console.log(`[health check] ${r.results.length - r.failed}/${r.results.length} passed`);
    } catch (e: any) {
      console.error('[health check] run failed:', e?.message ?? e);
      await emailAdmins(supabase, { subject: 'Fennec health check could not run', html: `<p>${esc(String(e?.message ?? e))}</p>` }).catch(() => {});
    } finally {
      running = false;
    }
  }
  setInterval(tick, TICK_MS);
  setTimeout(tick, 60_000);
  console.log('[health check] nightly check enabled (2am NZ time)');
}
