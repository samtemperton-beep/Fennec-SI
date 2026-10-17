import axios from 'axios';

// USD→NZD rate from Yahoo ("NZD=X" is NZD per 1 USD). Used for display only: it
// lets the app show an NZD equivalent next to USD broker values. Nothing stored
// is ever converted with it.

export interface FxRate {
  pair: 'USDNZD';
  rate: number; // NZD per 1 USD
  asOf: string; // when Yahoo last updated the rate
}

const TTL_MS = 60 * 60 * 1000;
// A rate outside this band is a bad feed value, not a market move.
const MIN_RATE = 0.5;
const MAX_RATE = 4;

let cached: { value: FxRate; fetchedAt: number } | null = null;

async function fetchUsdNzd(): Promise<FxRate> {
  const { data } = await axios.get(
    'https://query1.finance.yahoo.com/v8/finance/chart/NZD=X?interval=1d&range=5d',
    { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const meta = data?.chart?.result?.[0]?.meta;
  const rate = Number(meta?.regularMarketPrice);
  if (!Number.isFinite(rate) || rate < MIN_RATE || rate > MAX_RATE) {
    throw new Error(`implausible USD/NZD rate: ${meta?.regularMarketPrice}`);
  }
  const ts = Number(meta?.regularMarketTime);
  return {
    pair: 'USDNZD',
    rate,
    asOf: new Date(Number.isFinite(ts) && ts > 0 ? ts * 1000 : Date.now()).toISOString(),
  };
}

/**
 * Current USD→NZD rate, cached for an hour. If Yahoo is down, the last good rate
 * is served (its asOf shows how old it is); null only if there has never been one.
 */
export async function getUsdNzd(): Promise<FxRate | null> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.value;
  try {
    const value = await fetchUsdNzd();
    cached = { value, fetchedAt: Date.now() };
    return value;
  } catch (e: any) {
    console.warn('[fx] could not refresh USD/NZD:', e.message);
    return cached?.value ?? null;
  }
}

// Other currencies → NZD (e.g. AUD for ASX holdings). Same Yahoo feed and
// caching as above; "AUDNZD=X" is NZD per 1 AUD.
const otherCache = new Map<string, { rate: number; fetchedAt: number }>();

/** NZD per 1 unit of `currency`, or null if no rate is available. NZD → 1. */
export async function getRateToNzd(currency: string): Promise<number | null> {
  const cur = currency.toUpperCase();
  if (cur === 'NZD') return 1;
  if (cur === 'USD') return (await getUsdNzd())?.rate ?? null;
  const hit = otherCache.get(cur);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.rate;
  try {
    const { data } = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cur)}NZD=X?interval=1d&range=5d`,
      { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const rate = Number(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`implausible ${cur}/NZD rate`);
    otherCache.set(cur, { rate, fetchedAt: Date.now() });
    return rate;
  } catch (e: any) {
    console.warn(`[fx] could not refresh ${cur}/NZD:`, e.message);
    return hit?.rate ?? null;
  }
}
