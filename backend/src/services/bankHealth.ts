import type { SupabaseClient } from '@supabase/supabase-js';

// Bank connection health (bank_health_migration.sql). Each bank sync records
// what Akahu said about every account: whether the bank connection is active,
// when Akahu last got data from the bank, and the newest transaction Fennec
// holds. From that, diagnose() explains why transactions might not be updating
// and what the person can do, for Settings, the fox chat and a support report.
// Deliberately no balances, transaction descriptions or tokens.
// Best-effort throughout: a failure here must never fail a sync.

export interface AccountHealth {
  name: string;
  bank: string;
  type: string;
  status: string;            // Akahu: ACTIVE or INACTIVE
  refreshedTx: string | null; // when Akahu last got transactions from the bank
  refreshedBalance: string | null;
  newestTx: string | null;    // newest transaction date Fennec holds for it
  fetched: number;            // transactions Akahu returned this sync
  error?: string;
}

export interface BankHealth {
  checked_at: string;
  ok: boolean;
  error: string | null;
  accounts: AccountHealth[];
  added: number;
  last_ok_at: string | null;
  last_added_at: string | null;
  refresh_requested_at: string | null;
  report_sent_at: string | null;
}

export interface Finding { level: 'ok' | 'info' | 'warn' | 'problem'; title: string; fix: string }

const clip = (s: unknown, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function saveHealth(
  supabase: SupabaseClient,
  userId: string,
  h: { ok: boolean; error?: string | null; accounts?: AccountHealth[]; added?: number },
) {
  const now = new Date().toISOString();
  const row: Record<string, any> = { user_id: userId, checked_at: now, ok: h.ok, error: h.ok ? null : clip(h.error) };
  if (h.accounts) row.accounts = h.accounts;
  if (h.ok) {
    row.last_ok_at = now;
    row.added = h.added ?? 0;
    if ((h.added ?? 0) > 0) row.last_added_at = now;
  }
  const { error } = await supabase.from('bank_sync_health').upsert(row, { onConflict: 'user_id' });
  if (error) console.error('[bank health] could not save:', error.message); // before the migration
}

export async function loadHealth(supabase: SupabaseClient, userId: string): Promise<BankHealth | null> {
  const { data, error } = await supabase.from('bank_sync_health').select('*').eq('user_id', userId).maybeSingle();
  if (error) return null;
  return (data as BankHealth) ?? null;
}

const HOUR = 3_600_000;
const ago = (iso: string | null | undefined, now = Date.now()) => (iso ? (now - Date.parse(iso)) / HOUR : Infinity);
export function whenText(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return 'never';
  const h = ago(iso, now);
  if (h < 1) return 'within the last hour';
  if (h < 24) return `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
const dayText = (date: string | null) => (date ? new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'none yet');

/**
 * Why transactions might not be updating, most serious first. `connected` is
 * whether Akahu tokens are saved; `tokensProblem` whether Akahu rejected them.
 */
export function diagnose(h: BankHealth | null, connected: boolean, tokensProblem: boolean, now = Date.now()): Finding[] {
  const out: Finding[] = [];
  if (!connected) {
    return [{ level: 'info', title: "Your bank isn't connected", fix: 'Connect it in Settings → Akahu Sync, or add accounts and transactions by hand.' }];
  }
  if (tokensProblem || /rejected your tokens|tokens? (were |was )?rejected|unauthori/i.test(h?.error ?? '')) {
    out.push({ level: 'problem', title: 'Akahu stopped accepting your tokens', fix: 'Copy fresh App and User tokens from my.akahu.nz/developers and save them in Settings → Akahu Sync. Nothing updates until then.' });
  }
  if (!h) {
    out.push({ level: 'info', title: "Fennec hasn't checked your bank yet", fix: 'Press Sync on the Transactions or Accounts page. After that Fennec checks by itself every few hours.' });
    return out;
  }
  if (!h.ok && !out.length) {
    out.push({ level: 'problem', title: `The last sync failed (${whenText(h.checked_at, now)})`, fix: `Akahu said: "${clip(h.error, 160)}". Press Sync to try again. If it keeps failing, send a connection report to the Fennec team.` });
  }
  if (h.ok && h.accounts.length === 0) {
    out.push({ level: 'problem', title: 'Akahu shared no accounts', fix: 'Sign in at my.akahu.nz and check your bank is connected and your personal app can see its accounts.' });
  }
  const lapsed = [...new Set(h.accounts.filter(a => a.status === 'INACTIVE').map(a => a.bank))];
  if (lapsed.length) {
    out.push({ level: 'problem', title: `${lapsed.join(', ')} needs reconnecting`, fix: `The bank's connection to Akahu has lapsed (banks ask you to sign in again from time to time). Sign in at my.akahu.nz and reconnect ${lapsed.length > 1 ? 'them' : 'it'}. Your Fennec tokens stay the same.` });
  }
  for (const a of h.accounts.filter(a => a.error)) {
    out.push({ level: 'warn', title: `Couldn't read transactions for ${a.name}`, fix: `Akahu said: "${clip(a.error, 140)}". Press Sync to try again; the other accounts still updated.` });
  }
  // Akahu refreshes from each bank about once a day.
  const stale = h.accounts.filter(a => a.status !== 'INACTIVE' && !a.error && ago(a.refreshedTx ?? a.refreshedBalance, now) > 48);
  const staleBanks = [...new Set(stale.map(a => a.bank))];
  if (staleBanks.length) {
    const oldest = stale.map(a => a.refreshedTx ?? a.refreshedBalance).filter(Boolean).sort()[0] ?? null;
    out.push({ level: 'warn', title: `Akahu hasn't had new data from ${staleBanks.join(', ')} ${oldest ? `for ${whenText(oldest, now).replace(/ ago$/, '')}` : 'since it was connected'}`, fix: 'Akahu normally fetches from each bank about once a day. Tap "Ask Akahu to fetch now", then Sync in a few minutes. If it stays stuck, sign in at my.akahu.nz to check the bank connection.' });
  }
  if (h.ok && ago(h.checked_at, now) > 12) {
    out.push({ level: 'warn', title: `Fennec last checked your bank ${whenText(h.checked_at, now)}`, fix: 'Press Sync on the Transactions page to check now.' });
  }
  if (!out.some(f => f.level === 'problem' || f.level === 'warn')) {
    out.push({ level: 'ok', title: 'Your bank connection looks healthy', fix: `Fennec last checked ${whenText(h.checked_at, now)} and${h.last_added_at ? ` last found new transactions ${whenText(h.last_added_at, now)}` : " hasn't found new transactions yet"}.` });
  }
  // Always true, and the usual answer to "my purchase isn't showing".
  out.push({ level: 'info', title: 'Recent card purchases show once your bank settles them', fix: "Fennec brings in transactions once your bank has settled them, so a card purchase usually appears 1 to 3 working days later, dated the day the bank processed it." });
  return out;
}

/** Plain-text summary for the fox chat and support reports. */
export function healthText(h: BankHealth | null, findings: Finding[], now = Date.now()) {
  const lines: string[] = [];
  if (h) {
    lines.push(`Last bank check: ${whenText(h.checked_at, now)} (${h.ok ? 'succeeded' : 'failed'}). Last successful: ${whenText(h.last_ok_at, now)}. New transactions last found: ${whenText(h.last_added_at, now)}.`);
    for (const a of h.accounts.slice(0, 15)) {
      lines.push(`- ${a.bank} / ${a.name} (${a.type}): connection ${a.status}; Akahu last got transactions from the bank ${whenText(a.refreshedTx, now)}; newest transaction in Fennec ${dayText(a.newestTx)}${a.error ? `; error: ${clip(a.error, 120)}` : ''}`);
    }
  }
  lines.push('What Fennec found:');
  for (const f of findings) lines.push(`- [${f.level}] ${f.title}. ${f.fix}`);
  return lines.join('\n');
}

/** Asks Akahu to fetch fresh data from the bank now. Never throws. */
export async function requestAkahuRefresh(appToken: string, userToken: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('https://api.akahu.io/v1/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}`, 'X-Akahu-Id': appToken },
    });
    if (res.ok) return { ok: true, message: 'Akahu is fetching from your bank now. Press Sync in a few minutes to bring in anything new.' };
    if (res.status === 429) return { ok: false, message: 'Akahu fetched from your bank in the last few minutes. Press Sync to bring in anything new.' };
    if (res.status === 401) return { ok: false, message: 'Akahu didn\'t accept your tokens. Save fresh ones from my.akahu.nz/developers.' };
    const body: any = await res.json().catch(() => ({}));
    return { ok: false, message: `Akahu couldn't fetch right now${body?.message ? ` (${clip(body.message, 120)})` : ''}. It refreshes by itself about once a day.` };
  } catch {
    return { ok: false, message: "Couldn't reach Akahu just now. Try again shortly." };
  }
}
