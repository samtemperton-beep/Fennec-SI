// Tracks which sectors, tickers and sources a user engages with
// and returns a personal relevance boost (0–30) for a given article.

export interface NewsPrefs {
  tickers: Record<string, number>
  sectors: Record<string, number>
  sources: Record<string, number>
}

function storageKey(userId: string) {
  return `news_prefs_${userId}`
}

export function loadPrefs(userId: string): NewsPrefs {
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId)) || '{}') as NewsPrefs
  } catch {
    return { tickers: {}, sectors: {}, sources: {} }
  }
}

function savePrefs(userId: string, prefs: NewsPrefs) {
  localStorage.setItem(storageKey(userId), JSON.stringify(prefs))
}

export function recordInteraction(
  userId: string,
  article: { ticker?: string; source?: string },
  sector?: string,
  weight = 1,
) {
  const prefs = loadPrefs(userId)
  if (!prefs.tickers) prefs.tickers = {}
  if (!prefs.sectors) prefs.sectors = {}
  if (!prefs.sources) prefs.sources = {}

  if (article.ticker) prefs.tickers[article.ticker] = (prefs.tickers[article.ticker] || 0) + weight
  if (sector) prefs.sectors[sector] = (prefs.sectors[sector] || 0) + weight
  if (article.source) prefs.sources[article.source] = (prefs.sources[article.source] || 0) + weight

  savePrefs(userId, prefs)
}

export function personalBoost(
  prefs: NewsPrefs,
  article: { ticker?: string; source?: string },
  sector?: string,
): number {
  let boost = 0
  if (article.ticker && prefs.tickers?.[article.ticker]) {
    boost += Math.min(prefs.tickers[article.ticker] * 4, 20)
  }
  if (sector && prefs.sectors?.[sector]) {
    boost += Math.min(prefs.sectors[sector] * 2, 10)
  }
  if (article.source && prefs.sources?.[article.source]) {
    boost += Math.min(prefs.sources[article.source], 5)
  }
  return Math.min(boost, 30)
}

// Returns top engaged sectors/tickers for display and passing to AI
export function topInterests(prefs: NewsPrefs, n = 5) {
  const topSectors = Object.entries(prefs.sectors || {})
    .sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
  const topTickers = Object.entries(prefs.tickers || {})
    .sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
  return { topSectors, topTickers }
}
