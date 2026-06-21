import axios from 'axios';
import Parser from 'rss-parser';

const rss = new Parser({ timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FennecSI/1.0)' } });
const FINNHUB = 'https://finnhub.io/api/v1';
const key = () => process.env.FINNHUB_API_KEY || '';

export interface NewsItem {
  id: string;
  headline: string;
  summary?: string;
  source: string;
  url: string;
  datetime: number;
  ticker?: string;
  sentiment?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dedup(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter(n => {
    // Deduplicate by URL and by headline similarity (first 60 chars)
    const urlKey = n.url?.split('?')[0] || '';
    const headKey = n.headline?.slice(0, 60).toLowerCase() || '';
    const key = urlKey || headKey;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    if (headKey) seen.add(headKey);
    return true;
  });
}

function simpleSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const t = text.toLowerCase();
  const pos = ['surge', 'soar', 'jump', 'rally', 'gain', 'beat', 'record', 'rise', 'up', 'bull', 'profit', 'growth', 'strong', 'boost', 'win', 'positive', 'upgraded', 'buy', 'outperform'];
  const neg = ['fall', 'drop', 'plunge', 'crash', 'loss', 'miss', 'decline', 'down', 'bear', 'weak', 'sell', 'cut', 'risk', 'warn', 'concern', 'fear', 'downgrade', 'layoff', 'debt'];
  const posScore = pos.filter(w => t.includes(w)).length;
  const negScore = neg.filter(w => t.includes(w)).length;
  if (posScore > negScore) return 'positive';
  if (negScore > posScore) return 'negative';
  return 'neutral';
}

let idCounter = Date.now();
function uid() { return String(++idCounter); }

// ─── Source: Finnhub general ─────────────────────────────────────────────────

async function finnhubGeneral(): Promise<NewsItem[]> {
  try {
    const { data } = await axios.get(`${FINNHUB}/news?category=general&token=${key()}`, { timeout: 8000 });
    return (data || []).slice(0, 20).map((n: any) => ({
      id: String(n.id || uid()),
      headline: n.headline,
      summary: n.summary,
      source: n.source,
      url: n.url,
      datetime: (n.datetime || 0) * 1000,
      sentiment: simpleSentiment(`${n.headline} ${n.summary || ''}`),
    }));
  } catch { return []; }
}

// ─── Source: Finnhub company news ────────────────────────────────────────────

async function finnhubCompany(tickers: string[]): Promise<NewsItem[]> {
  const from = new Date(Date.now() - 7 * 86400_000).toISOString().split('T')[0];
  const to = new Date().toISOString().split('T')[0];
  const results: NewsItem[] = [];
  for (const ticker of tickers.slice(0, 5)) {
    try {
      const { data } = await axios.get(
        `${FINNHUB}/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${key()}`,
        { timeout: 8000 }
      );
      results.push(...(data || []).slice(0, 8).map((n: any) => ({
        id: String(n.id || uid()),
        headline: n.headline,
        summary: n.summary,
        source: n.source,
        url: n.url,
        datetime: (n.datetime || 0) * 1000,
        ticker,
        sentiment: simpleSentiment(`${n.headline} ${n.summary || ''}`),
      })));
    } catch {}
  }
  return results;
}

// ─── Source: Yahoo Finance RSS (per ticker) ───────────────────────────────────

async function yahooRSS(tickers: string[]): Promise<NewsItem[]> {
  const results: NewsItem[] = [];
  for (const ticker of tickers.slice(0, 6)) {
    try {
      const feed = await rss.parseURL(
        `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ticker}&region=US&lang=en-US`
      );
      results.push(...(feed.items || []).slice(0, 6).map(item => ({
        id: uid(),
        headline: item.title || '',
        summary: item.contentSnippet || item.summary || '',
        source: 'Yahoo Finance',
        url: item.link || '',
        datetime: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
        ticker,
        sentiment: simpleSentiment(`${item.title} ${item.contentSnippet || ''}`),
      })));
    } catch {}
  }
  return results;
}

// ─── Source: Google News RSS ─────────────────────────────────────────────────

async function googleNewsRSS(tickers: string[], generalQuery = ''): Promise<NewsItem[]> {
  const queries: string[] = [];
  for (const t of tickers.slice(0, 4)) queries.push(`${t}+stock`);
  if (generalQuery) queries.push(generalQuery);
  if (queries.length === 0) queries.push('stock+market+finance');

  const results: NewsItem[] = [];
  for (const q of queries) {
    try {
      const feed = await rss.parseURL(
        `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`
      );
      const ticker = tickers.find(t => q.startsWith(t));
      results.push(...(feed.items || []).slice(0, 8).map(item => ({
        id: uid(),
        headline: item.title?.replace(/ - [^-]+$/, '') || '', // strip " - Source" suffix Google adds
        summary: item.contentSnippet || '',
        source: (item.title?.match(/ - ([^-]+)$/) || [])[1]?.trim() || 'Google News',
        url: item.link || '',
        datetime: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
        ticker,
        sentiment: simpleSentiment(`${item.title} ${item.contentSnippet || ''}`),
      })));
    } catch {}
  }
  return results;
}

// ─── Source: MarketWatch RSS ──────────────────────────────────────────────────

async function marketWatchRSS(): Promise<NewsItem[]> {
  try {
    const feed = await rss.parseURL('https://feeds.marketwatch.com/marketwatch/topstories/');
    return (feed.items || []).slice(0, 10).map(item => ({
      id: uid(),
      headline: item.title || '',
      summary: item.contentSnippet || '',
      source: 'MarketWatch',
      url: item.link || '',
      datetime: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
      sentiment: simpleSentiment(`${item.title} ${item.contentSnippet || ''}`),
    }));
  } catch { return []; }
}

// ─── Source: Reuters Business RSS ────────────────────────────────────────────

async function reutersRSS(): Promise<NewsItem[]> {
  try {
    const feed = await rss.parseURL('https://feeds.reuters.com/reuters/businessNews');
    return (feed.items || []).slice(0, 10).map(item => ({
      id: uid(),
      headline: item.title || '',
      summary: item.contentSnippet || '',
      source: 'Reuters',
      url: item.link || '',
      datetime: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
      sentiment: simpleSentiment(`${item.title} ${item.contentSnippet || ''}`),
    }));
  } catch { return []; }
}

// ─── Source: Seeking Alpha RSS ────────────────────────────────────────────────

async function seekingAlphaRSS(): Promise<NewsItem[]> {
  try {
    const feed = await rss.parseURL('https://seekingalpha.com/market_currents.xml');
    return (feed.items || []).slice(0, 10).map(item => ({
      id: uid(),
      headline: item.title || '',
      summary: item.contentSnippet?.slice(0, 200) || '',
      source: 'Seeking Alpha',
      url: item.link || '',
      datetime: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
      sentiment: simpleSentiment(`${item.title} ${item.contentSnippet || ''}`),
    }));
  } catch { return []; }
}

// ─── Source: Alpha Vantage News & Sentiment ───────────────────────────────────

async function alphaVantageNews(tickers: string[]): Promise<NewsItem[]> {
  const avKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!avKey || avKey === 'demo') return [];
  try {
    const tickerParam = tickers.slice(0, 5).join(',');
    const { data } = await axios.get(
      `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${tickerParam}&limit=20&apikey=${avKey}`,
      { timeout: 10000 }
    );
    return (data?.feed || []).slice(0, 20).map((n: any) => {
      const avSentiment = n.overall_sentiment_label?.toLowerCase() || '';
      const sentiment: 'positive' | 'negative' | 'neutral' =
        avSentiment.includes('bull') || avSentiment === 'positive' ? 'positive'
        : avSentiment.includes('bear') || avSentiment === 'negative' ? 'negative'
        : 'neutral';
      const primaryTicker = n.ticker_sentiment?.[0]?.ticker;
      return {
        id: uid(),
        headline: n.title || '',
        summary: n.summary || '',
        source: n.source || 'Alpha Vantage',
        url: n.url || '',
        datetime: n.time_published
          ? new Date(n.time_published.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')).getTime()
          : Date.now(),
        ticker: primaryTicker && tickers.includes(primaryTicker) ? primaryTicker : undefined,
        sentiment,
      };
    });
  } catch { return []; }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchNews(tickers: string[] = []): Promise<NewsItem[]> {
  // Run all sources in parallel — individual failures are swallowed inside each fn
  const [
    fhGeneral, fhCompany, yahoo, google, mw, reuters, sa, av,
  ] = await Promise.all([
    finnhubGeneral(),
    tickers.length ? finnhubCompany(tickers) : Promise.resolve([]),
    tickers.length ? yahooRSS(tickers) : Promise.resolve([]),
    googleNewsRSS(tickers),
    marketWatchRSS(),
    reutersRSS(),
    seekingAlphaRSS(),
    alphaVantageNews(tickers),
  ]);

  // Merge: ticker-specific news first, then general
  const tickerNews = [...fhCompany, ...yahoo, ...google.filter(n => n.ticker), ...av.filter(n => n.ticker)];
  const generalNews = [...fhGeneral, ...google.filter(n => !n.ticker), ...av.filter(n => !n.ticker), ...mw, ...reuters, ...sa];

  const merged = dedup([...tickerNews, ...generalNews]);

  // Sort by recency, filter out items with no headline or url
  return merged
    .filter(n => n.headline && n.url)
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, 80);
}
