import axios from 'axios';

// Dividend history per symbol, for the portfolio income estimate.
//
// Uses Yahoo's chart endpoint with dividend events, which (unlike Finnhub's free
// tier) covers ETFs as well as stocks and gives real payment dates and amounts.
// Same unofficial endpoint the app already uses for charts, so it can be blocked
// or change shape; failures are reported as 'error', never as "pays nothing".
//
//   ok       - symbol found; payments may be empty (a real non-payer)
//   unknown  - Yahoo doesn't know the symbol
//   error    - request failed (rate limit, timeout); retry later

export interface DividendPayment {
  date: string; // YYYY-MM-DD (UTC)
  amount: number; // per share, in `currency`
}

export interface DividendResult {
  status: 'ok' | 'unknown' | 'error';
  currency: string | null;
  payments: DividendPayment[];
}

const TTL_MS = 24 * 60 * 60 * 1000;
const ERROR_TTL_MS = 2 * 60 * 1000;
const MAX_SYMBOLS = 40;
const CONCURRENCY = 4;
const VALID_SYMBOL = /^[A-Z0-9][A-Z0-9.^=-]{0,14}$/;

const cache = new Map<string, { value: DividendResult; at: number }>();

export function resetDividendCache(): void {
  cache.clear();
}

async function fetchOne(symbol: string): Promise<DividendResult> {
  try {
    const { data } = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
      params: { range: '2y', interval: '1mo', events: 'div' },
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
    });
    const result = data?.chart?.result?.[0];
    if (!result) return { status: 'unknown', currency: null, payments: [] };

    const events = Object.values(result.events?.dividends ?? {}) as { date: number; amount: number }[];
    const seen = new Set<string>();
    const payments: DividendPayment[] = [];
    for (const e of events) {
      if (!Number.isFinite(e?.date) || !Number.isFinite(e?.amount) || e.amount <= 0) continue;
      const date = new Date(e.date * 1000).toISOString().slice(0, 10);
      if (seen.has(date)) continue; // same-day duplicates
      seen.add(date);
      payments.push({ date, amount: e.amount });
    }
    payments.sort((a, b) => a.date.localeCompare(b.date));
    return { status: 'ok', currency: typeof result.meta?.currency === 'string' ? result.meta.currency : null, payments };
  } catch {
    return { status: 'error', currency: null, payments: [] };
  }
}

/** Dividend history (about two years) for up to 40 symbols, cached. Invalid symbols are skipped. */
export async function getDividends(symbols: string[]): Promise<Record<string, DividendResult>> {
  const wanted = [...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter((s) => VALID_SYMBOL.test(s)))].slice(0, MAX_SYMBOLS);
  const out: Record<string, DividendResult> = {};
  const todo: string[] = [];

  const now = Date.now();
  for (const s of wanted) {
    const hit = cache.get(s);
    const ttl = hit?.value.status === 'error' ? ERROR_TTL_MS : TTL_MS;
    if (hit && now - hit.at < ttl) out[s] = hit.value;
    else todo.push(s);
  }

  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const s = todo[next++];
      const value = await fetchOne(s);
      cache.set(s, { value, at: Date.now() });
      out[s] = value;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return out;
}
