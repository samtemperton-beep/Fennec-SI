import type { SupabaseClient } from '@supabase/supabase-js';
import { getRateToNzd } from './fx';
import { nzDate } from './snapshots';

// Net worth in NZD, built from everything Fennec knows about a user. One
// function serves the dashboard and the history snapshots so the two always agree.
//
//   bank        everyday / savings / credit-card accounts (fin_accounts)
//   investments holdings at their last synced price + broker cash, converted to NZD
//   kiwisaver   fin_kiwisaver balance (or KIWISAVER accounts if that's all there is)
//   property    Home Loan page: market estimate → RV → purchase price
//   debt        LOAN accounts, always negative
//
// Loan, KiwiSaver, investment and broker-wallet accounts are pulled out of
// "bank" so nothing is counted twice.

export interface NetWorth {
  total: number;
  bank: number;
  investments: number;
  kiwisaver: number;
  property: number;
  debt: number;
  propertySource: 'market_estimate' | 'rv' | 'purchase_price' | null;
  bankSyncedAt: string | null; // oldest bank balance, so the UI can say how fresh it is
  missingFx: string[]; // currencies that couldn't be converted (left out of the total)
  hasData: boolean;
}

export interface NetWorthPoint {
  date: string;
  total: number;
  bank: number;
  investments: number;
  kiwisaver: number;
  property: number;
  debt: number;
}

const NON_BANK_TYPES = new Set(['LOAN', 'KIWISAVER', 'INVESTMENT']);
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function currencyForMarket(market: string | null | undefined): string {
  if (market === 'NZX') return 'NZD';
  if (market === 'ASX') return 'AUD';
  return 'USD';
}

export async function computeNetWorth(supabase: SupabaseClient, userId: string): Promise<NetWorth> {
  const [accountsRes, holdingsRes, statusRes, ksRes, loanRes] = await Promise.all([
    supabase.from('fin_accounts').select('type, current_balance, last_synced').eq('user_id', userId),
    supabase.from('holdings').select('shares, current_price, market').eq('user_id', userId),
    supabase.from('akahu_sync_status').select('broker_accounts').eq('user_id', userId).maybeSingle(),
    supabase.from('fin_kiwisaver').select('current_balance').eq('user_id', userId).maybeSingle(),
    supabase.from('home_loan').select('market_estimate, rv, purchase_price').eq('user_id', userId).maybeSingle(),
  ]);

  const accounts: any[] = accountsRes.data ?? [];
  const holdings: any[] = holdingsRes.data ?? [];
  const brokerAccounts: any[] = Array.isArray(statusRes.data?.broker_accounts) ? statusRes.data!.broker_accounts : [];
  const hasBroker = brokerAccounts.length > 0;

  // ── Investments, per currency, then converted ──
  const byCurrency = new Map<string, number>();
  const add = (cur: string, v: number) => byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + v);
  for (const h of holdings) add(currencyForMarket(h.market), num(h.shares) * num(h.current_price));
  for (const a of brokerAccounts) add(String(a.currency || 'USD'), num(a.cashBalance));
  // No holdings at all: fall back to whatever Akahu reports for investment accounts.
  if (holdings.length === 0 && !hasBroker) {
    for (const a of accounts) if (a.type === 'INVESTMENT') add('NZD', num(a.current_balance));
  }

  let investments = 0;
  const missingFx: string[] = [];
  for (const [cur, value] of byCurrency) {
    if (value === 0) continue;
    const rate = await getRateToNzd(cur);
    if (rate === null) missingFx.push(cur);
    else investments += value * rate;
  }

  // ── Bank and debt ──
  let bank = 0;
  let debt = 0;
  let ksFromAccounts = 0;
  let bankSyncedAt: string | null = null;
  for (const a of accounts) {
    const bal = num(a.current_balance);
    if (a.type === 'LOAN') { debt -= Math.abs(bal); continue; }
    if (a.type === 'KIWISAVER') { ksFromAccounts += bal; continue; }
    if (NON_BANK_TYPES.has(a.type)) continue;
    // Broker cash wallets (e.g. Hatch) are already in investments.
    if (a.type === 'WALLET' && hasBroker) continue;
    bank += bal;
    if (a.last_synced && (!bankSyncedAt || a.last_synced < bankSyncedAt)) bankSyncedAt = a.last_synced;
  }

  const kiwisaver = ksRes.data?.current_balance != null ? num(ksRes.data.current_balance) : ksFromAccounts;

  // ── Property ──
  const loan: any = loanRes.data;
  let property = 0;
  let propertySource: NetWorth['propertySource'] = null;
  if (loan) {
    for (const key of ['market_estimate', 'rv', 'purchase_price'] as const) {
      if (num(loan[key]) > 0) { property = num(loan[key]); propertySource = key; break; }
    }
  }

  const total = bank + investments + kiwisaver + property + debt;
  return {
    total: round2(total),
    bank: round2(bank),
    investments: round2(investments),
    kiwisaver: round2(kiwisaver),
    property: round2(property),
    debt: round2(debt),
    propertySource,
    bankSyncedAt,
    missingFx,
    hasData: accounts.length > 0 || holdings.length > 0 || kiwisaver !== 0 || property !== 0,
  };
}

/** Upserts today's (NZ date) point. Returns an error message, or null. */
export async function saveNetWorthSnapshot(supabase: SupabaseClient, userId: string, nw: NetWorth): Promise<string | null> {
  if (!nw.hasData) return null;
  const { error } = await supabase.from('networth_snapshots').upsert(
    {
      user_id: userId,
      snapshot_date: nzDate(),
      total: nw.total,
      bank: nw.bank,
      investments: nw.investments,
      kiwisaver: nw.kiwisaver,
      property: nw.property,
      debt: nw.debt,
      taken_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,snapshot_date' }
  );
  return error ? error.message : null;
}

/** Compute and record. Best-effort: used after background syncs. */
export async function recordNetWorth(supabase: SupabaseClient, userId: string): Promise<void> {
  const nw = await computeNetWorth(supabase, userId);
  const err = await saveNetWorthSnapshot(supabase, userId, nw);
  if (err) console.error('[networth] could not save snapshot:', err);
}

export async function getNetWorthHistory(supabase: SupabaseClient, userId: string): Promise<NetWorthPoint[]> {
  const { data, error } = await supabase
    .from('networth_snapshots')
    .select('snapshot_date, total, bank, investments, kiwisaver, property, debt')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: true });
  if (error) {
    console.error('[networth] could not read history:', error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    date: r.snapshot_date,
    total: num(r.total),
    bank: num(r.bank),
    investments: num(r.investments),
    kiwisaver: num(r.kiwisaver),
    property: num(r.property),
    debt: num(r.debt),
  }));
}
