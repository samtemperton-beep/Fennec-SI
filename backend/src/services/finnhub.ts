import axios from 'axios';

const BASE = 'https://finnhub.io/api/v1';

function key() {
  return process.env.FINNHUB_API_KEY || '';
}

export async function fetchNews(tickers: string[] = []) {
  const results: any[] = [];
  if (tickers.length === 0) {
    const { data } = await axios.get(`${BASE}/news?category=general&token=${key()}`);
    return data.slice(0, 30).map(normalizeNews);
  }
  for (const ticker of tickers.slice(0, 5)) {
    const from = new Date(Date.now() - 7 * 86400_000).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    try {
      const { data } = await axios.get(
        `${BASE}/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${key()}`
      );
      results.push(...data.slice(0, 10).map((n: any) => ({ ...normalizeNews(n), ticker })));
    } catch {}
  }
  return results;
}

export async function fetchIPOs() {
  const from = new Date().toISOString().split('T')[0];
  const to = new Date(Date.now() + 90 * 86400_000).toISOString().split('T')[0];
  const { data } = await axios.get(`${BASE}/calendar/ipo?from=${from}&to=${to}&token=${key()}`);
  return data?.ipoCalendar || [];
}

/** Upcoming earnings dates for a list of tickers (next `days` days). */
export async function fetchEarningsCalendar(tickers: string[], days = 30) {
  const from = new Date().toISOString().split('T')[0];
  const to = new Date(Date.now() + days * 86400_000).toISOString().split('T')[0];
  const results: any[] = [];
  for (const symbol of tickers.slice(0, 20)) {
    try {
      const { data } = await axios.get(
        `${BASE}/calendar/earnings?from=${from}&to=${to}&symbol=${symbol}&token=${key()}`,
        { timeout: 6000 }
      );
      const items = (data?.earningsCalendar || []).map((e: any) => ({
        symbol: e.symbol,
        date: e.date,
        hour: e.hour, // 'bmo' = before open, 'amc' = after close, 'dmh' = during hours
        epsEstimate: e.epsEstimate,
        revenueEstimate: e.revenueEstimate,
        quarter: e.quarter,
        year: e.year,
      }));
      results.push(...items);
    } catch {}
  }
  return results.sort((a, b) => a.date.localeCompare(b.date));
}

/** Recent SEC filings (8-K, 10-Q, 10-K) for a list of tickers. */
export async function fetchRecentFilings(tickers: string[], days = 14) {
  const from = new Date(Date.now() - days * 86400_000).toISOString().split('T')[0];
  const to = new Date().toISOString().split('T')[0];
  const results: any[] = [];
  for (const symbol of tickers.slice(0, 10)) {
    try {
      const { data } = await axios.get(
        `${BASE}/stock/filings?symbol=${symbol}&from=${from}&to=${to}&token=${key()}`,
        { timeout: 6000 }
      );
      const items = (data?.data || data || [])
        .filter((f: any) => ['8-K', '10-Q', '10-K', '6-K'].includes(f.form))
        .slice(0, 5)
        .map((f: any) => ({
          symbol,
          form: f.form,
          filedDate: f.filedDate,
          reportDate: f.reportDate,
          url: f.reportUrl || f.url || `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${symbol}&type=${f.form}`,
          description: formDescription(f.form),
        }));
      results.push(...items);
    } catch {}
  }
  return results.sort((a, b) => b.filedDate.localeCompare(a.filedDate));
}

function formDescription(form: string): string {
  const map: Record<string, string> = {
    '8-K':  'Current Report — material event',
    '10-Q': 'Quarterly Report (10-Q)',
    '10-K': 'Annual Report (10-K)',
    '6-K':  'Foreign Private Issuer Report',
  };
  return map[form] || form;
}

/** Latest analyst recommendation consensus for each ticker. */
export async function fetchAnalystRecommendations(tickers: string[]) {
  const results: any[] = [];
  for (const symbol of tickers.slice(0, 15)) {
    try {
      const [recRes, ptRes] = await Promise.all([
        axios.get(`${BASE}/stock/recommendation?symbol=${symbol}&token=${key()}`, { timeout: 6000 }),
        axios.get(`${BASE}/stock/price-target?symbol=${symbol}&token=${key()}`, { timeout: 6000 }),
      ]);
      const latest = (recRes.data || [])[0];
      const pt = ptRes.data;
      if (!latest) continue;
      const total = (latest.buy || 0) + (latest.hold || 0) + (latest.sell || 0) + (latest.strongBuy || 0) + (latest.strongSell || 0);
      const bullish = (latest.buy || 0) + (latest.strongBuy || 0);
      const bearish = (latest.sell || 0) + (latest.strongSell || 0);
      results.push({
        symbol,
        period: latest.period,
        buy: latest.buy,
        strongBuy: latest.strongBuy,
        hold: latest.hold,
        sell: latest.sell,
        strongSell: latest.strongSell,
        total,
        bullPct: total > 0 ? Math.round((bullish / total) * 100) : null,
        bearPct: total > 0 ? Math.round((bearish / total) * 100) : null,
        consensus: total > 0
          ? bullish / total >= 0.6 ? 'BUY'
          : bearish / total >= 0.4 ? 'SELL'
          : 'HOLD'
          : null,
        targetMean: pt?.targetMean ?? null,
        targetHigh: pt?.targetHigh ?? null,
        targetLow: pt?.targetLow ?? null,
        lastUpdated: pt?.lastUpdated ?? null,
      });
    } catch {}
  }
  return results;
}

function normalizeNews(n: any) {
  return {
    id: n.id,
    headline: n.headline,
    summary: n.summary,
    source: n.source,
    url: n.url,
    image: n.image,
    datetime: n.datetime * 1000,
    category: n.category,
    related: n.related,
  };
}
