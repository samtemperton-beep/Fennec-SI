import axios from 'axios';

// Company industry lookup (Finnhub profile2) for the portfolio balance check.
//
// Finnhub returns an industry for stocks and an EMPTY profile for ETFs/funds and
// for symbols it doesn't cover, so "empty" is real information. A failed request
// (rate limit, timeout) is a different thing and must never be read as "empty",
// or a stock would be mistaken for a fund. Hence the three statuses.

export interface ProfileResult {
  status: 'ok' | 'empty' | 'error';
  industry: string | null;
  name: string | null;
}

const FINNHUB = 'https://finnhub.io/api/v1';
const TTL_MS = 24 * 60 * 60 * 1000; // industries almost never change
const ERROR_TTL_MS = 2 * 60 * 1000; // don't hammer the API while it is failing
const MAX_TICKERS = 40;
const CONCURRENCY = 4; // Finnhub's free tier allows ~60 calls a minute
const VALID_TICKER = /^[A-Z0-9][A-Z0-9.:^=-]{0,14}$/;

const cache = new Map<string, { value: ProfileResult; at: number }>();

export function resetProfileCache(): void {
  cache.clear();
}

async function fetchOne(ticker: string): Promise<ProfileResult> {
  try {
    const { data } = await axios.get(`${FINNHUB}/stock/profile2`, {
      params: { symbol: ticker, token: process.env.FINNHUB_API_KEY || '' },
      timeout: 8000,
    });
    const industry = typeof data?.finnhubIndustry === 'string' && data.finnhubIndustry.trim() ? data.finnhubIndustry.trim() : null;
    const name = typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : null;
    if (!industry && !name) return { status: 'empty', industry: null, name: null };
    return { status: 'ok', industry, name };
  } catch {
    return { status: 'error', industry: null, name: null };
  }
}

/** Profiles for up to 40 tickers, cached. Invalid tickers are skipped. */
export async function getProfiles(tickers: string[]): Promise<Record<string, ProfileResult>> {
  const wanted = [...new Set(tickers.map((t) => String(t).trim().toUpperCase()).filter((t) => VALID_TICKER.test(t)))].slice(0, MAX_TICKERS);
  const out: Record<string, ProfileResult> = {};
  const todo: string[] = [];

  const now = Date.now();
  for (const t of wanted) {
    const hit = cache.get(t);
    const ttl = hit?.value.status === 'error' ? ERROR_TTL_MS : TTL_MS;
    if (hit && now - hit.at < ttl) out[t] = hit.value;
    else todo.push(t);
  }

  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const t = todo[next++];
      const value = await fetchOne(t);
      cache.set(t, { value, at: Date.now() });
      out[t] = value;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return out;
}
