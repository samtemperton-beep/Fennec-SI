import axios from 'axios';

const FINNHUB = 'https://finnhub.io/api/v1';
const key = () => process.env.FINNHUB_API_KEY || '';

// Finnhub's plan only covers US listings (anything else answers 403), so symbols
// with an exchange suffix (FPH.NZ, CBA.AX) are priced from Yahoo instead. Callers
// must send the suffix: a bare "FPH" is a different, US company.
const NON_US = /\.(NZ|AX|L|TO|V|HK|SI|T|DE|PA|AS|SW)$/i;

async function yahooMeta(symbol: string) {
  const { data } = await axios.get(
    // A one-day range, so chartPreviousClose is yesterday's close and the change is today's.
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
    { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const meta = data?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (!meta || !Number.isFinite(price) || price <= 0) throw new Error(`No quote found for ${symbol}`);
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
  const change = Number.isFinite(prev) && prev > 0 ? price - prev : undefined;
  return {
    price,
    name: (meta.longName || meta.shortName) as string | undefined,
    change,
    changePct: change !== undefined ? (change / prev) * 100 : undefined,
    w52Hi: Number(meta.fiftyTwoWeekHigh) || null,
    w52Lo: Number(meta.fiftyTwoWeekLow) || null,
    exchange: (meta.fullExchangeName || meta.exchangeName || null) as string | null,
    currency: (meta.currency || null) as string | null,
  };
}

export async function fetchPrices(tickers: string[]): Promise<Record<string, { price: number; name?: string; changePct?: number }>> {
  const results = await Promise.all(
    tickers.map(async t => {
      try {
        if (NON_US.test(t)) {
          const y = await yahooMeta(t);
          return [t, { price: y.price, name: y.name, changePct: y.changePct }] as [string, { price: number; name?: string; changePct?: number }];
        }
        const [{ data: q }, { data: p }] = await Promise.all([
          axios.get(`${FINNHUB}/quote?symbol=${t}&token=${key()}`, { timeout: 8000 }),
          axios.get(`${FINNHUB}/stock/profile2?symbol=${t}&token=${key()}`, { timeout: 8000 }),
        ]);
        if (!q.c) throw new Error('no Finnhub price');
        // dp = percent change since the previous close
        return [t, { price: q.c, name: p.name || undefined, changePct: Number.isFinite(q.dp) ? q.dp : undefined }] as [string, { price: number; name?: string; changePct?: number }];
      } catch {
        // Finnhub busy or rate limited: Yahoo also has US prices.
        try {
          const y = await yahooMeta(t);
          return [t, { price: y.price, name: y.name, changePct: y.changePct }] as [string, { price: number; name?: string; changePct?: number }];
        } catch {
          return [t, { price: 0 }] as [string, { price: number }];
        }
      }
    })
  );
  return Object.fromEntries(results);
}

/** A quote from Yahoo alone: price, today's change and 52-week range, without Finnhub's fundamentals. */
async function yahooQuote(ticker: string) {
  const y = await yahooMeta(ticker);
  return {
    ticker, name: y.name || ticker, price: y.price, change: y.change ?? null, changePct: y.changePct ?? null,
    volume: null, marketCap: null, pe: null, forwardPE: null, divYield: null,
    w52Hi: y.w52Hi, w52Lo: y.w52Lo, sector: null, industry: null,
    exchange: y.exchange, currency: y.currency || (NON_US.test(ticker) ? 'NZD' : 'USD'), avgVolume: null,
  };
}

export async function fetchQuote(ticker: string) {
  if (NON_US.test(ticker)) return yahooQuote(ticker);
  let q: any, p: any, metricsRes: any;
  try {
    [{ data: q }, { data: p }, metricsRes] = await Promise.all([
      axios.get(`${FINNHUB}/quote?symbol=${ticker}&token=${key()}`, { timeout: 8000 }),
      axios.get(`${FINNHUB}/stock/profile2?symbol=${ticker}&token=${key()}`, { timeout: 8000 }),
      axios.get(`${FINNHUB}/stock/metric?symbol=${ticker}&metric=all&token=${key()}`, { timeout: 8000 }).catch(() => ({ data: {} })),
    ]);
  } catch {
    // Finnhub busy or rate limited: fall back to Yahoo's basic quote.
    return yahooQuote(ticker);
  }
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
