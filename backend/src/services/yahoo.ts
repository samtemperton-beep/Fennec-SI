import axios from 'axios';

const FINNHUB = 'https://finnhub.io/api/v1';
const key = () => process.env.FINNHUB_API_KEY || '';

export async function fetchPrices(tickers: string[]): Promise<Record<string, { price: number; name?: string }>> {
  const results = await Promise.all(
    tickers.map(async t => {
      try {
        const [{ data: q }, { data: p }] = await Promise.all([
          axios.get(`${FINNHUB}/quote?symbol=${t}&token=${key()}`, { timeout: 8000 }),
          axios.get(`${FINNHUB}/stock/profile2?symbol=${t}&token=${key()}`, { timeout: 8000 }),
        ]);
        return [t, { price: q.c ?? 0, name: p.name || undefined }] as [string, { price: number; name?: string }];
      } catch {
        return [t, { price: 0 }] as [string, { price: number }];
      }
    })
  );
  return Object.fromEntries(results);
}

export async function fetchQuote(ticker: string) {
  const [{ data: q }, { data: p }, metricsRes] = await Promise.all([
    axios.get(`${FINNHUB}/quote?symbol=${ticker}&token=${key()}`, { timeout: 8000 }),
    axios.get(`${FINNHUB}/stock/profile2?symbol=${ticker}&token=${key()}`, { timeout: 8000 }),
    axios.get(`${FINNHUB}/stock/metric?symbol=${ticker}&metric=all&token=${key()}`, { timeout: 8000 }).catch(() => ({ data: {} })),
  ]);
  if (!q.c) throw new Error(`No quote found for ${ticker}`);
  const metrics = (metricsRes as any).data?.metric || {};
  return {
    ticker,
    name: p.name || ticker,
    price: q.c,
    change: q.d,
    changePct: q.dp,
    volume: q.v || null,
    marketCap: p.marketCapitalization ? p.marketCapitalization * 1e6 : null,
    pe: metrics['peTTM'] || null,
    forwardPE: null,
    divYield: metrics['dividendYieldIndicatedAnnual'] || null,
    w52Hi: metrics['52WeekHigh'] || null,
    w52Lo: metrics['52WeekLow'] || null,
    sector: p.finnhubIndustry || null,
    industry: p.finnhubIndustry || null,
    exchange: p.exchange || null,
    currency: p.currency || 'USD',
    avgVolume: null,
  };
}

export async function searchSymbols(query: string): Promise<{ ticker: string; name: string; exchange: string; type: string }[]> {
  const { data } = await axios.get(
    `${FINNHUB}/search?q=${encodeURIComponent(query)}&token=${key()}`,
    { timeout: 8000 }
  );
  return (data?.result || [])
    .filter((r: any) => r.type === 'Common Stock' || r.type === 'ETP')
    .slice(0, 8)
    .map((r: any) => ({
      ticker: r.symbol,
      name: r.description,
      exchange: r.primaryExchange || r.displaySymbol,
      type: r.type,
    }));
}

export async function fetchChart(ticker: string, range = '1y'): Promise<any[]> {
  // Yahoo Finance v8 — supports stocks, ETFs, indices, crypto
  const intervalMap: Record<string, string> = {
    '1d': '5m', '5d': '15m', '1mo': '1h', '6mo': '1d', '1y': '1d', '5y': '1wk',
  };
  const interval = intervalMap[range] || '1d';
  const { data } = await axios.get(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`,
    { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const result = data?.chart?.result?.[0];
  if (!result) return [];
  const timestamps: number[] = result.timestamp || [];
  const quotes = result.indicators?.quote?.[0] || {};
  return timestamps
    .map((ts: number, i: number) => ({
      t: ts * 1000,
      o: quotes.open?.[i] ?? null,
      h: quotes.high?.[i] ?? null,
      l: quotes.low?.[i] ?? null,
      c: quotes.close?.[i] ?? null,
      v: quotes.volume?.[i] ?? null,
    }))
    .filter(p => p.c != null);
}
