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
  relevance: number; // 0–100, used for sorting
}

// ─── Finance relevance scoring ────────────────────────────────────────────────

const FINANCE_SOURCES = new Set([
  'marketwatch', 'seeking alpha', 'reuters', 'bloomberg', 'cnbc', 'yahoo finance',
  'financial times', 'ft', 'wsj', 'wall street journal', 'barron', 'investopedia',
  'motley fool', 'benzinga', 'the street', 'zacks', 'morningstar', 'kavout',
  'alpha vantage', 'finnhub', 'investing.com', 'nasdaq', 'stock analysis',
  'simply wall st', 'nzx', 'asx', 'sharesight',
  // Reddit finance communities — treated as trusted finance sources
  'r/wallstreetbets', 'r/stocks', 'r/investing', 'r/securityanalysis',
  'r/stockmarket', 'r/asx_bets', 'r/ausfinance', 'r/options', 'r/valueinvesting',
]);

const FINANCE_KEYWORDS = [
  'stock', 'share', 'equity', 'market', 'investor', 'trading', 'trade',
  'earnings', 'revenue', 'profit', 'loss', 'eps', 'ebitda', 'margin',
  'dividend', 'buyback', 'ipo', 'listing', 'merger', 'acquisition', 'm&a',
  'analyst', 'upgrade', 'downgrade', 'rating', 'target price', 'price target',
  'quarterly', 'fiscal', 'guidance', 'forecast', 'outlook',
  'fund', 'etf', 'index', 'portfolio', 'hedge',
  'inflation', 'interest rate', 'fed', 'federal reserve', 'central bank',
  'gdp', 'economy', 'recession', 'bull', 'bear', 'rally', 'correction',
  's&p', 'nasdaq', 'dow', 'asx', 'nzx', 'nyse', 'ftse',
  'bond', 'yield', 'treasury', 'currency', 'forex', 'commodity',
  'oil', 'gold', 'silver', 'crypto', 'bitcoin', 'sector',
  'ipo', 'spac', 'venture', 'capital', 'valuation', 'pe ratio',
];

// Topics that are almost never finance-relevant when they dominate an article
const OFF_TOPIC_SIGNALS = [
  'soccer', 'football', 'basketball', 'cricket', 'rugby', 'tennis', 'golf tournament',
  'world cup', 'premier league', 'nfl', 'nba', 'nhl', 'mlb',
  'celebrity', 'movie', 'album', 'actor', 'singer', 'grammy', 'oscar',
  'weather', 'hurricane', 'earthquake', 'wildfire',
  'recipe', 'restaurant', 'fashion', 'travel destination',
];

function scoreRelevance(item: { headline: string; summary?: string; source: string }): number {
  const text = `${item.headline} ${item.summary || ''}`.toLowerCase();
  const src = item.source.toLowerCase();

  // Trusted finance sources start with a high base
  const isFinanceSrc = [...FINANCE_SOURCES].some(s => src.includes(s));
  let score = isFinanceSrc ? 55 : 20;

  // Strong off-topic signals tank the score immediately
  if (OFF_TOPIC_SIGNALS.some(s => text.includes(s))) score -= 60;

  // Count finance keyword hits
  const hits = FINANCE_KEYWORDS.filter(kw => text.includes(kw)).length;
  score += Math.min(hits * 6, 45); // up to +45

  // Ticker symbol in text is a strong signal
  if (/\$[A-Z]{1,5}\b/.test(item.headline)) score += 15;
  if (/\b(NYSE|NASDAQ|ASX|NZX|LSE):[A-Z]{1,5}\b/i.test(text)) score += 15;

  return Math.max(0, Math.min(100, score));
}

// ─── Ticker extraction ────────────────────────────────────────────────────────

function extractTicker(text: string, knownTickers: string[]): string | undefined {
  // Explicit $TICKER format
  const dollarMatch = text.match(/\$([A-Z]{1,5})\b/);
  if (dollarMatch) {
    const t = dollarMatch[1];
    if (knownTickers.includes(t)) return t;
  }

  // Exchange:TICKER format
  const exchangeMatch = text.match(/\b(?:NYSE|NASDAQ|ASX|NZX|LSE):([A-Z]{1,6})\b/i);
  if (exchangeMatch) {
    const t = exchangeMatch[1].toUpperCase();
    if (knownTickers.includes(t)) return t;
    return t; // return even if not in watchlist — useful for display
  }

  // (TICKER) in parentheses — common in headlines like "Apple (AAPL) reports..."
  const parenMatch = text.match(/\(([A-Z]{1,5})\)/g);
  if (parenMatch) {
    for (const m of parenMatch) {
      const t = m.replace(/[()]/g, '');
      if (t.length >= 2 && t.length <= 5 && /^[A-Z]+$/.test(t) && !['AND', 'BUT', 'FOR', 'THE', 'INC', 'LLC', 'LTD', 'PLC', 'ETF', 'CEO', 'CFO', 'IPO'].includes(t)) {
        if (knownTickers.includes(t)) return t;
      }
    }
    // Second pass: return any valid-looking symbol even if not in known list
    for (const m of parenMatch) {
      const t = m.replace(/[()]/g, '');
      if (t.length >= 2 && t.length <= 5 && /^[A-Z]+$/.test(t) && !['AND', 'BUT', 'FOR', 'THE', 'INC', 'LLC', 'LTD', 'PLC', 'ETF', 'CEO', 'CFO', 'IPO'].includes(t)) {
        return t;
      }
    }
  }

  // Known ticker mentioned as standalone word in headline
  for (const t of knownTickers) {
    const re = new RegExp(`\\b${t}\\b`);
    if (re.test(text)) return t;
  }

  return undefined;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dedup(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter(n => {
    const urlKey = n.url?.split('?')[0] || '';
    const headKey = n.headline?.slice(0, 60).toLowerCase() || '';
    const k = urlKey || headKey;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    if (headKey) seen.add(headKey);
    return true;
  });
}

function simpleSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const t = text.toLowerCase();
  const pos = ['surge', 'soar', 'jump', 'rally', 'gain', 'beat', 'record', 'rise', 'bull', 'profit', 'growth', 'strong', 'boost', 'upgraded', 'buy', 'outperform'];
  const neg = ['fall', 'drop', 'plunge', 'crash', 'loss', 'miss', 'decline', 'bear', 'weak', 'sell', 'cut', 'warn', 'concern', 'fear', 'downgrade', 'layoff', 'debt'];
  const posScore = pos.filter(w => t.includes(w)).length;
  const negScore = neg.filter(w => t.includes(w)).length;
  if (posScore > negScore) return 'positive';
  if (negScore > posScore) return 'negative';
  return 'neutral';
}

let idCounter = Date.now();
function uid() { return String(++idCounter); }

function clean(item: Omit<NewsItem, 'relevance'>, knownTickers: string[]): NewsItem {
  // Fix Google News summaries that just repeat the headline
  let summary = item.summary || '';
  if (summary.toLowerCase().startsWith(item.headline.toLowerCase().slice(0, 40).toLowerCase())) {
    summary = '';
  }
  // Strip trailing " - Source Name" Google appends to headlines
  const headline = item.headline.replace(/ - [A-Z][^\-]{2,40}$/, '').trim();

  const ticker = item.ticker || extractTicker(`${headline} ${summary}`, knownTickers);
  const relevance = scoreRelevance({ headline, summary, source: item.source });

  return { ...item, headline, summary: summary || undefined, ticker, relevance };
}

// ─── Source: Finnhub general ─────────────────────────────────────────────────

async function finnhubGeneral(knownTickers: string[]): Promise<NewsItem[]> {
  try {
    const { data } = await axios.get(`${FINNHUB}/news?category=general&token=${key()}`, { timeout: 8000 });
    return (data || []).slice(0, 25).map((n: any) => clean({
      id: String(n.id || uid()),
      headline: n.headline || '',
      summary: n.summary,
      source: n.source || 'Finnhub',
      url: n.url,
      datetime: (n.datetime || 0) * 1000,
      sentiment: simpleSentiment(`${n.headline} ${n.summary || ''}`),
    }, knownTickers));
  } catch { return []; }
}

// ─── Source: Finnhub company news ────────────────────────────────────────────

async function finnhubCompany(tickers: string[], knownTickers: string[]): Promise<NewsItem[]> {
  const from = new Date(Date.now() - 7 * 86400_000).toISOString().split('T')[0];
  const to = new Date().toISOString().split('T')[0];
  const results: NewsItem[] = [];
  for (const ticker of tickers.slice(0, 5)) {
    try {
      const { data } = await axios.get(
        `${FINNHUB}/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${key()}`,
        { timeout: 8000 }
      );
      results.push(...(data || []).slice(0, 8).map((n: any) => clean({
        id: String(n.id || uid()),
        headline: n.headline || '',
        summary: n.summary,
        source: n.source || 'Finnhub',
        url: n.url,
        datetime: (n.datetime || 0) * 1000,
        ticker,
        sentiment: simpleSentiment(`${n.headline} ${n.summary || ''}`),
      }, knownTickers)));
    } catch {}
  }
  return results;
}

// ─── Source: Yahoo Finance RSS ────────────────────────────────────────────────

async function yahooRSS(tickers: string[], knownTickers: string[]): Promise<NewsItem[]> {
  const results: NewsItem[] = [];
  for (const ticker of tickers.slice(0, 6)) {
    try {
      const feed = await rss.parseURL(
        `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ticker}&region=US&lang=en-US`
      );
      results.push(...(feed.items || []).slice(0, 6).map(item => clean({
        id: uid(),
        headline: item.title || '',
        summary: item.contentSnippet || item.summary || '',
        source: 'Yahoo Finance',
        url: item.link || '',
        datetime: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
        ticker,
        sentiment: simpleSentiment(`${item.title} ${item.contentSnippet || ''}`),
      }, knownTickers)));
    } catch {}
  }
  return results;
}

// ─── Source: Google News RSS ─────────────────────────────────────────────────

async function googleNewsRSS(tickers: string[], knownTickers: string[]): Promise<NewsItem[]> {
  // Finance-specific queries only — avoids sports/entertainment bleed-through
  const queries: { q: string; ticker?: string }[] = [
    { q: 'stock market investing finance' },
    { q: 'earnings revenue quarterly results stocks' },
  ];
  for (const t of tickers.slice(0, 4)) {
    queries.push({ q: `${t} stock earnings`, ticker: t });
  }

  const results: NewsItem[] = [];
  for (const { q, ticker } of queries) {
    try {
      const feed = await rss.parseURL(
        `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`
      );
      results.push(...(feed.items || []).slice(0, 6).map(item => clean({
        id: uid(),
        headline: item.title || '',
        summary: item.contentSnippet || '',
        source: (item.title?.match(/ - ([^-]+)$/) || [])[1]?.trim() || 'Google News',
        url: item.link || '',
        datetime: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
        ticker,
        sentiment: simpleSentiment(`${item.title} ${item.contentSnippet || ''}`),
      }, knownTickers)));
    } catch {}
  }
  return results;
}

// ─── Source: MarketWatch RSS ──────────────────────────────────────────────────

async function marketWatchRSS(knownTickers: string[]): Promise<NewsItem[]> {
  try {
    const feed = await rss.parseURL('https://feeds.marketwatch.com/marketwatch/topstories/');
    return (feed.items || []).slice(0, 12).map(item => clean({
      id: uid(),
      headline: item.title || '',
      summary: item.contentSnippet || '',
      source: 'MarketWatch',
      url: item.link || '',
      datetime: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
      sentiment: simpleSentiment(`${item.title} ${item.contentSnippet || ''}`),
    }, knownTickers));
  } catch { return []; }
}

// ─── Source: Reuters Business RSS ────────────────────────────────────────────

async function reutersRSS(knownTickers: string[]): Promise<NewsItem[]> {
  try {
    const feed = await rss.parseURL('https://feeds.reuters.com/reuters/businessNews');
    return (feed.items || []).slice(0, 12).map(item => clean({
      id: uid(),
      headline: item.title || '',
      summary: item.contentSnippet || '',
      source: 'Reuters',
      url: item.link || '',
      datetime: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
      sentiment: simpleSentiment(`${item.title} ${item.contentSnippet || ''}`),
    }, knownTickers));
  } catch { return []; }
}

// ─── Source: Seeking Alpha RSS ────────────────────────────────────────────────

async function seekingAlphaRSS(knownTickers: string[]): Promise<NewsItem[]> {
  try {
    const feed = await rss.parseURL('https://seekingalpha.com/market_currents.xml');
    return (feed.items || []).slice(0, 12).map(item => clean({
      id: uid(),
      headline: item.title || '',
      summary: item.contentSnippet?.slice(0, 200) || '',
      source: 'Seeking Alpha',
      url: item.link || '',
      datetime: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
      sentiment: simpleSentiment(`${item.title} ${item.contentSnippet || ''}`),
    }, knownTickers));
  } catch { return []; }
}

// ─── Source: Reddit stock communities ────────────────────────────────────────

const REDDIT_SUBS = [
  'wallstreetbets', // retail retail options + meme stocks
  'stocks',         // general US stock discussion
  'investing',      // longer-term investing
  'SecurityAnalysis', // fundamental analysis
  'StockMarket',    // broad market
  'ASX_Bets',       // ASX retail sentiment
  'AusFinance',     // Australian finance
  'options',        // options flow
];

async function redditPosts(knownTickers: string[]): Promise<NewsItem[]> {
  const results: NewsItem[] = [];
  for (const sub of REDDIT_SUBS) {
    try {
      const { data } = await axios.get(
        `https://www.reddit.com/r/${sub}/hot.json?limit=15`,
        {
          timeout: 8000,
          headers: { 'User-Agent': 'FennecSI/1.0 (investment research aggregator)' },
        }
      );
      const posts: any[] = (data?.data?.children || []).map((c: any) => c.data);
      for (const post of posts) {
        if (post.stickied) continue; // skip mod-pinned announcements
        if ((post.score || 0) < 15) continue; // filter very low-engagement posts
        if (post.selftext === '[deleted]' || post.selftext === '[removed]') continue;

        const summary = post.is_self && post.selftext
          ? post.selftext.slice(0, 300).replace(/\n+/g, ' ').trim()
          : undefined;
        // Link posts point to external articles; self posts point to the reddit thread
        const url = post.is_self
          ? `https://reddit.com${post.permalink}`
          : post.url;

        results.push(clean({
          id: uid(),
          headline: post.title,
          summary,
          source: `r/${sub}`,
          url,
          datetime: (post.created_utc || 0) * 1000,
          sentiment: simpleSentiment(`${post.title} ${summary || ''}`),
        }, knownTickers));
      }
    } catch { /* silently skip failed subreddits */ }
  }
  return results;
}

// ─── Source: Alpha Vantage News & Sentiment ───────────────────────────────────

async function alphaVantageNews(tickers: string[], knownTickers: string[]): Promise<NewsItem[]> {
  const avKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!avKey || avKey === 'demo') return [];
  try {
    const tickerParam = tickers.slice(0, 5).join(',');
    const url = tickerParam
      ? `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${tickerParam}&limit=30&apikey=${avKey}`
      : `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=financial_markets,economy_macro&limit=30&apikey=${avKey}`;
    const { data } = await axios.get(url, { timeout: 10000 });
    return (data?.feed || []).slice(0, 30).map((n: any) => {
      const avSentiment = n.overall_sentiment_label?.toLowerCase() || '';
      const sentiment: 'positive' | 'negative' | 'neutral' =
        avSentiment.includes('bull') || avSentiment === 'positive' ? 'positive'
        : avSentiment.includes('bear') || avSentiment === 'negative' ? 'negative'
        : 'neutral';
      const primaryTicker = n.ticker_sentiment?.[0]?.ticker;
      return clean({
        id: uid(),
        headline: n.title || '',
        summary: n.summary || '',
        source: n.source || 'Alpha Vantage',
        url: n.url || '',
        datetime: n.time_published
          ? new Date(n.time_published.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')).getTime()
          : Date.now(),
        ticker: primaryTicker && knownTickers.includes(primaryTicker) ? primaryTicker : primaryTicker,
        sentiment,
      }, knownTickers);
    });
  } catch { return []; }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchNews(tickers: string[] = []): Promise<NewsItem[]> {
  const knownTickers = tickers; // used for ticker matching across all sources

  const [fhGeneral, fhCompany, yahoo, google, mw, reuters, sa, av, reddit] = await Promise.all([
    finnhubGeneral(knownTickers),
    tickers.length ? finnhubCompany(tickers, knownTickers) : Promise.resolve([]),
    tickers.length ? yahooRSS(tickers, knownTickers) : Promise.resolve([]),
    googleNewsRSS(tickers, knownTickers),
    marketWatchRSS(knownTickers),
    reutersRSS(knownTickers),
    seekingAlphaRSS(knownTickers),
    alphaVantageNews(tickers, knownTickers),
    redditPosts(knownTickers),
  ]);

  // Ticker-specific news gets a relevance boost
  const boost = (items: NewsItem[], amount: number) =>
    items.map(n => ({ ...n, relevance: Math.min(100, n.relevance + amount) }));

  const all = dedup([
    ...boost(fhCompany, 20),
    ...boost(yahoo, 15),
    ...boost(google.filter(n => n.ticker), 15),
    ...boost(av.filter(n => n.ticker), 15),
    ...boost(reddit.filter(n => n.ticker), 10), // ticker-matched Reddit posts
    ...fhGeneral,
    ...av.filter(n => !n.ticker),
    ...google.filter(n => !n.ticker),
    ...mw,
    ...reuters,
    ...sa,
    ...reddit.filter(n => !n.ticker), // general Reddit sentiment at natural relevance
  ]);

  return all
    .filter(n => n.headline && n.url && n.relevance >= 30) // drop clearly off-topic
    .sort((a, b) => {
      // Primary: relevance tier (high ≥70, mid 50–69, low <50)
      const tierA = a.relevance >= 70 ? 2 : a.relevance >= 50 ? 1 : 0;
      const tierB = b.relevance >= 70 ? 2 : b.relevance >= 50 ? 1 : 0;
      if (tierB !== tierA) return tierB - tierA;
      // Secondary: recency within the same tier
      return b.datetime - a.datetime;
    })
    .slice(0, 80);
}
