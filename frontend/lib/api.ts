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

// All values NZD. Mirrors backend/src/services/networth.ts.
export interface NetWorthBreakdown {
  total: number
  bank: number
  investments: number
  kiwisaver: number
  property: number
  debt: number
}
export interface NetWorthResponse {
  current: NetWorthBreakdown & {
    propertySource: 'market_estimate' | 'rv' | 'purchase_price' | null
    bankSyncedAt: string | null
    missingFx: string[]
    hasData: boolean
  }
  history: (NetWorthBreakdown & { date: string })[]
  historyAvailable: boolean
}

export interface PartnerInfo { name: string; email: string | null }
export type PartnerStatus =
  | { status: 'none' }
  | { status: 'pending'; code: string }
  | { status: 'linked'; partner: PartnerInfo; since?: string }

export interface HealthResult { group: string; name: string; ok: boolean; ms: number; detail: string }
export interface HealthRun { id: number; ran_at: string; trigger: 'scheduled' | 'manual'; ok: boolean; failed: number; results: HealthResult[] }

export type CategoryScope = 'household' | 'business'
export interface CategoryMatch {
  id: string; keyword: string; category_name: string; scope: CategoryScope
  status: 'pending' | 'approved' | 'rejected'; source: 'starter' | 'admin' | 'users'; suggestions: number
}

export interface MyBuddy {
  id: string; email: string; status: 'pending' | 'active'; name: string | null
  shareAmounts: boolean; shareBudgets: boolean; shareGoals: boolean
}
export interface FollowedPerson {
  id: string; name: string
  avatarColor: string | null; avatarEmoji: string | null; avatarUrl: string | null
  points: number; streakWeeks: number
  pledges: { name: string; keptDays: number }[]
  slips: { pledge: string; date: string; amount: number | null }[]
  overBudget: string[] | null
  goalsMissed: string[] | null
}
export interface BuddiesResponse {
  ready: boolean
  mine: MyBuddy[]
  invites: { id: string; from: string }[]
  following: FollowedPerson[]
}

export interface CommunityPerson {
  id: string; username: string | null
  avatarColor: string | null; avatarEmoji: string | null; avatarUrl: string | null
  joined: string | null; verified: boolean
  badges: { id: string; name: string; icon: string }[]
}
export interface ReportGroup {
  key: string; kind: 'post' | 'comment'; id: number; status: string
  item: { id: number; user_id: string; username: string; body: string; ticker?: string | null; hidden: boolean; created_at: string } | null
  reports: { reason: string; note: string | null; created_at: string }[]
}

export interface SavingsTip {
  title: string
  saving: number
  detail: string
  action: string
  category: 'subscriptions' | 'dining' | 'groceries' | 'phone' | 'debt' | 'general'
}

export const api = {
  searchStocks: (q: string) =>
    apiFetch(`/api/prices/search?q=${encodeURIComponent(q)}`),
  /** Every market (NZX / ASX / US) a share code is listed on. See lib/markets.ts. */
  lookupCode: (code: string) =>
    apiFetch(`/api/prices/lookup?code=${encodeURIComponent(code)}`),

  getPrices: (tickers: string[]) =>
    apiFetch(`/api/prices?tickers=${tickers.join(',')}`),

  getQuote: (ticker: string) =>
    apiFetch(`/api/prices/quote/${ticker}`),

  getChart: (ticker: string, range = '1y') =>
    apiFetch(`/api/prices/chart/${ticker}?range=${range}`),

  getMarketTicker: () =>
    apiFetch('/api/prices/market-ticker'),

  getProfiles: (tickers: string[]): Promise<{ profiles: Record<string, { status: 'ok' | 'empty' | 'error'; industry: string | null; name: string | null }> }> =>
    apiFetch(`/api/prices/profiles?tickers=${encodeURIComponent(tickers.join(','))}`),

  getDividends: (symbols: string[]): Promise<{ dividends: Record<string, { status: 'ok' | 'unknown' | 'error'; currency: string | null; payments: { date: string; amount: number }[] }> }> =>
    apiFetch(`/api/prices/dividends?symbols=${encodeURIComponent(symbols.join(','))}`),

  getFxRates: (currencies: string[]): Promise<{ base: 'NZD'; rates: Record<string, number | null> }> =>
    apiFetch(`/api/prices/fx-rates?currencies=${encodeURIComponent(currencies.join(','))}`),

  getFx: (): Promise<{ pair: 'USDNZD'; rate: number; asOf: string }> =>
    apiFetch('/api/prices/fx'),

  getNetWorth: (): Promise<NetWorthResponse> =>
    apiFetch('/api/networth'),

  getNews: (tickers: string[] = []) =>
    apiFetch(`/api/news${tickers.length ? `?tickers=${tickers.join(',')}` : ''}`),

  getIPOs: () => apiFetch('/api/news/ipo'),

  // Pulls holdings (e.g. Hatch) and KiwiSaver from Akahu and makes them the
  // source of truth. preview=true reports changes without applying them.
  syncAkahu: (opts: { preview?: boolean; removeUnmatched?: boolean } = {}) =>
    apiFetch('/api/akahu/sync', { method: 'POST', body: JSON.stringify(opts) }),

  // Tokens are encrypted server-side; the browser can't write the table directly.
  saveAkahuCredentials: (appToken: string, userToken: string) =>
    apiFetch('/api/finance/credentials', { method: 'POST', body: JSON.stringify({ app_token: appToken, user_token: userToken }) }),

  disconnectAkahu: () => apiFetch('/api/finance/akahu', { method: 'DELETE' }),

  partnerStatus: (): Promise<PartnerStatus> => apiFetch('/api/partner'),
  partnerInvite: (): Promise<{ code: string }> => apiFetch('/api/partner/invite', { method: 'POST', body: JSON.stringify({}) }),
  partnerInviteInfo: (code: string): Promise<{ own: boolean; name?: string }> => apiFetch(`/api/partner/invite/${encodeURIComponent(code)}`),
  partnerAccept: (code: string): Promise<{ ok: true; partner: PartnerInfo }> => apiFetch('/api/partner/accept', { method: 'POST', body: JSON.stringify({ code }) }),
  partnerUnlink: () => apiFetch('/api/partner', { method: 'DELETE' }),

  sendFeedback: (body: { kind: string; message: string; page: string; screenshot?: { name: string; type: string; data: string } }) =>
    apiFetch('/api/feedback', { method: 'POST', body: JSON.stringify(body) }),

  deleteAccount: () => apiFetch('/api/account', { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) }),

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
    apiFetch('/api/premium/sync', { method: 'POST', body: JSON.stringify({ csv, preview: true }) }),

  syncCSV: (csv: string) =>
    apiFetch('/api/premium/sync', { method: 'POST', body: JSON.stringify({ csv }) }),

  importScreenshot: (imageBase64: string, mediaType?: string) =>
    apiFetch('/api/import/screenshot', { method: 'POST', body: JSON.stringify({ imageBase64, mediaType }) }),

  checkAlerts: () =>
    apiFetch('/api/alerts/check', { method: 'POST' }),

  getNotifications: () =>
    apiFetch('/api/alerts/notifications'),

  markNotificationsRead: (ids?: number[]) =>
    apiFetch('/api/alerts/notifications/mark-read', { method: 'POST', body: JSON.stringify({ ids }) }),

  getUnreadCount: (): Promise<{ count: number }> =>
    apiFetch('/api/alerts/notifications/unread-count'),

  // ── Rewards, pledges and accountability buddies ──
  refreshRewards: (): Promise<{ ok: boolean; new: number }> =>
    apiFetch('/api/accountability/refresh', { method: 'POST' }),
  getBuddies: (): Promise<BuddiesResponse> =>
    apiFetch('/api/accountability/buddies'),
  inviteBuddy: (email: string) =>
    apiFetch('/api/accountability/buddies', { method: 'POST', body: JSON.stringify({ email }) }),
  acceptBuddy: (id: string) =>
    apiFetch(`/api/accountability/buddies/${id}/accept`, { method: 'POST' }),
  removeBuddy: (id: string) =>
    apiFetch(`/api/accountability/buddies/${id}`, { method: 'DELETE' }),
  updateBuddy: (id: string, body: { shareAmounts?: boolean; shareBudgets?: boolean; shareGoals?: boolean }) =>
    apiFetch(`/api/accountability/buddies/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  clearReadNotifications: () =>
    apiFetch('/api/alerts/notifications', { method: 'DELETE' }),

  getNotificationPrefs: () =>
    apiFetch('/api/alerts/prefs'),

  // ── Gmail (bills found in email) ──
  gmailStatus: (): Promise<{ connected: boolean; email: string | null; lastScanned: string | null; configured: boolean }> =>
    apiFetch('/api/gmail/status'),
  gmailItems: (): Promise<{ items: import('./bills').EmailItem[] }> =>
    apiFetch('/api/gmail/items'),
  gmailScan: (): Promise<{ scanned: number; items: unknown[]; settled?: number }> =>
    apiFetch('/api/gmail/scan', { method: 'POST', body: JSON.stringify({}) }),
  gmailAuthUrl: (): Promise<{ url: string }> =>
    apiFetch('/api/gmail/auth-url'),
  gmailDisconnect: () =>
    apiFetch('/api/gmail/disconnect', { method: 'DELETE' }),
  gmailUpdateItem: (id: string, patch: { dismissed?: boolean; paid?: boolean }) =>
    apiFetch(`/api/gmail/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  saveNotificationPrefs: (prefs: object) =>
    apiFetch('/api/alerts/prefs', { method: 'PUT', body: JSON.stringify(prefs) }),

  getPlan: (): Promise<import('./plan').Plan> =>
    apiFetch('/api/premium/plan'),

  getPremiumStatus: () =>
    apiFetch('/api/premium/status'),

  getAiUsage: () =>
    apiFetch('/api/ai/usage'),

  setupHelp: (messages: { role: 'user' | 'assistant'; content: string }[]): Promise<{ reply: string }> =>
    apiFetch('/api/ai/setup-help', { method: 'POST', body: JSON.stringify({ messages }) }),

  getDailySummary: (facts: object, date: string, refresh = false): Promise<{ summary: string; generatedAt: string; cached: boolean }> =>
    apiFetch('/api/ai/daily-summary', { method: 'POST', body: JSON.stringify({ facts, date, refresh }) }),

  evaluateBadges: () =>
    apiFetch('/api/premium/evaluate-badges', { method: 'POST' }),

  getLeaderboard: () =>
    apiFetch('/api/premium/leaderboard'),

  // Admin only
  adminGetUsers: () =>
    apiFetch('/api/admin/users'),

  adminSetTier: (userId: string, tier: 'free' | 'premium') =>
    apiFetch(`/api/admin/users/${userId}/tier`, { method: 'PATCH', body: JSON.stringify({ tier }) }),

  adminResetUsage: (userId: string) =>
    apiFetch(`/api/admin/users/${userId}/reset-usage`, { method: 'POST' }),

  getSpendSummary: () =>
    apiFetch('/api/finance/spend-summary'),

  getSavingsTips: () =>
    apiFetch('/api/finance/savings-tips', { method: 'POST' }),

  adminGetStats: () =>
    apiFetch('/api/admin/stats'),

  adminGetHealth: (): Promise<{ runs: HealthRun[] }> =>
    apiFetch('/api/admin/health'),

  adminRunHealth: (): Promise<{ ok: boolean; failed: number; results: HealthResult[] }> =>
    apiFetch('/api/admin/health/run', { method: 'POST' }),

  adminGetCategoryMatches: (): Promise<{ matches: CategoryMatch[]; categories: Record<CategoryScope, string[]> }> =>
    apiFetch('/api/admin/category-matches'),

  adminAddCategoryMatch: (body: { keyword: string; category_name: string; scope: CategoryScope }): Promise<{ applied: number }> =>
    apiFetch('/api/admin/category-matches', { method: 'POST', body: JSON.stringify(body) }),

  adminUpdateCategoryMatch: (id: string, body: { status?: CategoryMatch['status']; category_name?: string }): Promise<{ applied?: number; removed?: number }> =>
    apiFetch(`/api/admin/category-matches/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  adminSuggestCategoryMatches: (): Promise<{ added: number; considered?: number }> =>
    apiFetch('/api/admin/category-matches/from-my-data', { method: 'POST' }),

  adminGetReports: (status: 'open' | 'closed'): Promise<{ groups: ReportGroup[] }> =>
    apiFetch(`/api/admin/reports?status=${status}`),

  adminResolveReport: (kind: 'post' | 'comment', id: number, action: 'keep' | 'hide' | 'remove') =>
    apiFetch('/api/admin/reports/resolve', { method: 'POST', body: JSON.stringify({ kind, id, action }) }),

  communityPeople: (ids: string[]): Promise<{ people: CommunityPerson[] }> =>
    apiFetch(`/api/social/people?ids=${ids.join(',')}`),

  reportContent: (body: { postId?: number; commentId?: number; reason: string; note?: string }): Promise<{ ok: boolean; hidden?: boolean; already?: boolean }> =>
    apiFetch('/api/social/report', { method: 'POST', body: JSON.stringify(body) }),

  adminGetUsageStats: () =>
    apiFetch('/api/admin/usage-stats'),

  adminGetSettings: () =>
    apiFetch('/api/admin/settings'),

  adminResetModels: (tier: 'free' | 'premium') =>
    apiFetch(`/api/admin/settings/models/${tier}`, { method: 'DELETE' }),

  adminSetSetting: (key: string, value: string) =>
    apiFetch(`/api/admin/settings/${key}`, { method: 'PATCH', body: JSON.stringify({ value }) }),

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

  // Encrypted personal details. See backend/src/routes/private.ts.
  getPrivateFields: (): Promise<{ fields: Record<PrivateField, { saved: boolean; hint: string | null }> }> =>
    apiFetch('/api/private/fields'),

  revealPrivateFields: (fields: PrivateField[]): Promise<{ values: Partial<Record<PrivateField, string | null>> }> =>
    apiFetch('/api/private/reveal', { method: 'POST', body: JSON.stringify({ fields }) }),

  /** An empty string clears a detail. The row (business details, home loan) must already be saved. */
  savePrivateFields: (values: Partial<Record<PrivateField, string>>): Promise<{ ok: true }> =>
    apiFetch('/api/private/fields', { method: 'PUT', body: JSON.stringify(values) }),
}

export type PrivateField = 'ird_number' | 'gst_number' | 'bank_account' | 'home_address'
