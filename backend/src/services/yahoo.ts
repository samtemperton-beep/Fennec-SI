import axios from 'axios';

const FINNHUB = 'https://finnhub.io/api/v1';
const key = () => process.env.FINNHUB_API_KEY || '';

export async function fetchPrices(tickers: string[]): Promise<Record<string, number>> {
  const results = await Promise.all(
    tickers.map(async t => {
      try {
        const { data } = await axios.get(`${FINNHUB}/quote?symbol=${t}&token=${key()}`, { timeout: 8000 });
        return [t, data.c ?? 0] as [string, number];
      } catch {
        return [t, 0] as [string, number];
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
  const now = Math.floor(Date.now() / 1000);
  const fromMap: Record<string, number> = {
    '1d': 86400, '5d': 432000, '1mo': 2592000, '6mo': 15552000, '1y': 31536000, '5y': 157680000,
  };
  const resMap: Record<string, string> = {
    '1d': '5', '5d': '15', '1mo': '60', '6mo': 'D', '1y': 'W', '5y': 'M',
  };
  const from = now - (fromMap[range] || 31536000);
  const resolution = resMap[range] || 'W';
  const { data } = await axios.get(
    `${FINNHUB}/stock/candle?symbol=${ticker}&resolution=${resolution}&from=${from}&to=${now}&token=${key()}`,
    { timeout: 15000 }
  );
  if (data.s !== 'ok') return [];
  return (data.t || []).map((ts: number, i: number) => ({
    t: ts * 1000,
    o: data.o?.[i],
    h: data.h?.[i],
    l: data.l?.[i],
    c: data.c?.[i],
    v: data.v?.[i],
  }));
}
