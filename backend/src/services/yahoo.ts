import axios from 'axios';

const BASE = 'https://query1.finance.yahoo.com/v8/finance';
const QUOTE_BASE = 'https://query1.finance.yahoo.com/v7/finance';

export async function fetchPrices(tickers: string[]): Promise<Record<string, number>> {
  const symbols = tickers.join(',');
  const url = `${QUOTE_BASE}/quote?symbols=${symbols}&fields=regularMarketPrice`;
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000,
  });
  const result: Record<string, number> = {};
  const quotes = data?.quoteResponse?.result || [];
  for (const q of quotes) {
    result[q.symbol] = q.regularMarketPrice ?? 0;
  }
  return result;
}

export async function fetchQuote(ticker: string) {
  const url = `${QUOTE_BASE}/quote?symbols=${ticker}`;
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000,
  });
  const q = data?.quoteResponse?.result?.[0];
  if (!q) throw new Error(`No quote found for ${ticker}`);
  return {
    ticker: q.symbol,
    name: q.longName || q.shortName,
    price: q.regularMarketPrice,
    change: q.regularMarketChange,
    changePct: q.regularMarketChangePercent,
    volume: q.regularMarketVolume,
    marketCap: q.marketCap,
    pe: q.trailingPE,
    forwardPE: q.forwardPE,
    divYield: q.dividendYield ? q.dividendYield * 100 : null,
    w52Hi: q['52WeekHigh'],
    w52Lo: q['52WeekLow'],
    sector: q.sector,
    industry: q.industry,
    exchange: q.fullExchangeName,
    currency: q.currency,
    avgVolume: q.averageDailyVolume10Day,
  };
}

export async function fetchChart(ticker: string, range = '1y'): Promise<any[]> {
  const intervalMap: Record<string, string> = {
    '1d': '5m', '5d': '15m', '1mo': '1d', '6mo': '1d', '1y': '1wk', '5y': '1mo',
  };
  const interval = intervalMap[range] || '1d';
  const url = `${BASE}/chart/${ticker}?range=${range}&interval=${interval}`;
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000,
  });
  const result = data?.chart?.result?.[0];
  if (!result) return [];
  const timestamps: number[] = result.timestamp || [];
  const ohlcv = result.indicators?.quote?.[0] || {};
  return timestamps.map((ts, i) => ({
    t: ts * 1000,
    o: ohlcv.open?.[i],
    h: ohlcv.high?.[i],
    l: ohlcv.low?.[i],
    c: ohlcv.close?.[i],
    v: ohlcv.volume?.[i],
  }));
}
