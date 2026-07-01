const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

async function getToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const { createClient } = await import('./supabase')
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || null
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getToken()
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `API error ${res.status}`)
  }
  return res.json()
}

export const api = {
  searchStocks: (q: string) =>
    apiFetch(`/api/prices/search?q=${encodeURIComponent(q)}`),

  getPrices: (tickers: string[]) =>
    apiFetch(`/api/prices?tickers=${tickers.join(',')}`),

  getQuote: (ticker: string) =>
    apiFetch(`/api/prices/quote/${ticker}`),

  getChart: (ticker: string, range = '1y') =>
    apiFetch(`/api/prices/chart/${ticker}?range=${range}`),

  getNews: (tickers: string[] = []) =>
    apiFetch(`/api/news${tickers.length ? `?tickers=${tickers.join(',')}` : ''}`),

  getIPOs: () => apiFetch('/api/news/ipo'),

  getEarningsCalendar: (tickers: string[]) =>
    apiFetch(`/api/news/earnings?tickers=${tickers.join(',')}`),

  getRecentFilings: (tickers: string[]) =>
    apiFetch(`/api/news/filings?tickers=${tickers.join(',')}`),

  getAnalystRecommendations: (tickers: string[]) =>
    apiFetch(`/api/news/analyst?tickers=${tickers.join(',')}`),

  getASXAnnouncements: (tickers: string[]) =>
    apiFetch(`/api/news/asx-announcements?tickers=${tickers.join(',')}`),

  analyzeStock: (ticker: string, data: any, riskLevel?: number) =>
    apiFetch('/api/ai/analyze', { method: 'POST', body: JSON.stringify({ ticker, data, riskLevel }) }),

  getTop10: (market: string, timeframe: string, newsContext?: string) =>
    apiFetch('/api/ai/top10', { method: 'POST', body: JSON.stringify({ market, timeframe, newsContext }) }),

  getOpportunities: (riskLevel: number, holdings: string[], sector = 'All', market = 'US', newsContext?: string, userInterests?: { topSectors: string[]; topTickers: string[] }) =>
    apiFetch('/api/ai/opportunities', { method: 'POST', body: JSON.stringify({ riskLevel, holdings, sector, market, newsContext, userInterests }) }),

  getNewsDigest: (headlines: string[], portfolio: string[]) =>
    apiFetch('/api/ai/news-digest', { method: 'POST', body: JSON.stringify({ headlines, portfolio }) }),

  analyzeIPO: (ipo: any) =>
    apiFetch('/api/ai/ipo-analysis', { method: 'POST', body: JSON.stringify({ ipo }) }),

  deepDive: (ticker: string, context: string) =>
    apiFetch('/api/ai/deep-dive', { method: 'POST', body: JSON.stringify({ ticker, context }) }),

  draftPost: (ticker: string, signal: string, context: string) =>
    apiFetch('/api/ai/draft-post', { method: 'POST', body: JSON.stringify({ ticker, signal, context }) }),

  importCSV: (csv: string) =>
    apiFetch('/api/import/csv', { method: 'POST', body: JSON.stringify({ csv }) }),

  syncCSVPreview: (csv: string) =>
    apiFetch('/api/import/sync', { method: 'POST', body: JSON.stringify({ csv, preview: true }) }),

  syncCSV: (csv: string) =>
    apiFetch('/api/import/sync', { method: 'POST', body: JSON.stringify({ csv }) }),

  importScreenshot: (imageBase64: string, mediaType?: string) =>
    apiFetch('/api/import/screenshot', { method: 'POST', body: JSON.stringify({ imageBase64, mediaType }) }),

  checkAlerts: () =>
    apiFetch('/api/alerts/check', { method: 'POST' }),

  getPremiumStatus: () =>
    apiFetch('/api/premium/status'),

  getAiUsage: () =>
    apiFetch('/api/ai/usage'),

  verifyPortfolio: (documentBase64: string, mediaType: string) =>
    apiFetch('/api/premium/verify', { method: 'POST', body: JSON.stringify({ documentBase64, mediaType }) }),

  verifyPortfolioCSV: (csv: string) =>
    apiFetch('/api/premium/verify-csv', { method: 'POST', body: JSON.stringify({ csv }) }),

  verifyPortfolioEmail: (brokerEmail: string) =>
    apiFetch('/api/premium/verify-email', { method: 'POST', body: JSON.stringify({ brokerEmail }) }),

  verifyBrokerAccount: (imageBase64: string, mediaType: string) =>
    apiFetch('/api/premium/verify-account', { method: 'POST', body: JSON.stringify({ imageBase64, mediaType }) }),

  evaluateBadges: () =>
    apiFetch('/api/premium/evaluate-badges', { method: 'POST' }),

  getLeaderboard: () =>
    apiFetch('/api/premium/leaderboard'),

  // Admin only
  adminGetUsers: () =>
    apiFetch('/api/admin/users'),

  adminSetTier: (userId: string, tier: 'free' | 'premium') =>
    apiFetch(`/api/admin/users/${userId}/tier`, { method: 'PATCH', body: JSON.stringify({ tier }) }),

  async *streamChat(messages: any[], portfolio: string[]) {
    const token = await getToken()
    const res = await fetch(`${API}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages, portfolio }),
    })
    if (!res.ok) throw new Error('Chat stream failed')
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') return
          try {
            const parsed = JSON.parse(data)
            if (parsed.text) yield parsed.text
          } catch {}
        }
      }
    }
  },
}
