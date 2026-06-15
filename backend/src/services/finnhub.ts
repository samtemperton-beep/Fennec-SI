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
