'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Modal } from '@/components/shared/Modal'
import { WatchlistButton } from '@/components/shared/WatchlistButton'
import { timeAgo } from '@/lib/utils'
import { IconExternalLink, IconBookmark, IconBookmarkFilled, IconShare, IconSend, IconBrain, IconFileText } from '@tabler/icons-react'
import { toast } from 'sonner'
import { loadPrefs, recordInteraction, personalBoost } from '@/lib/newsPrefs'

interface NewsItem {
  id: number; headline: string; summary?: string; source: string; url: string
  datetime: number; sentiment: 'positive' | 'negative' | 'neutral'; ticker?: string; relevance?: number
}

const SENT_COLORS = { positive: 'var(--green)', negative: 'var(--red)', neutral: 'var(--amber)' }
const SENT_BG = { positive: 'rgba(34,197,94,0.12)', negative: 'rgba(239,68,68,0.12)', neutral: 'rgba(245,158,11,0.12)' }
const DEV_USER_ID = '851a4abb-27f2-4c32-9fb3-28ef4c22af49'

const BUBBLE_COLORS = ['#5B7CF0','#14B8A6','#22C55E','#F59E0B','#EF4444','#A855F7','#F97316','#0EA5E9','#EC4899','#6366F1']
function tickerColor(t: string) {
  let h = 0
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0
  return BUBBLE_COLORS[h % BUBBLE_COLORS.length]
}

type SentFilter = 'All' | 'Positive' | 'Negative'
type ListFilter = 'All' | 'Portfolio' | 'Watchlist' | 'Filings'

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sentFilter, setSentFilter] = useState<SentFilter>('All')
  const [listFilter, setListFilter] = useState<ListFilter>('All')
  const [selected, setSelected] = useState<NewsItem | null>(null)
  const [deepDive, setDeepDive] = useState<any>(null)
  const [diving, setDiving] = useState(false)
  const [digest, setDigest] = useState<any>(null)
  const [portfolio, setPortfolio] = useState<string[]>([])
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set())
  const [shareItem, setShareItem] = useState<NewsItem | null>(null)
  const [shareBody, setShareBody] = useState('')
  const [sharing, setSharing] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [filings, setFilings] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const uid = user?.id ?? DEV_USER_ID
    setUserId(uid)
    const [{ data: h }, { data: w }] = await Promise.all([
      supabase.from('holdings').select('ticker').eq('user_id', uid),
      supabase.from('watchlist').select('ticker').eq('user_id', uid),
    ])
    const portfolioTickers = h?.map((x: any) => x.ticker) || []
    const watchlistTickers = w?.map((x: any) => x.ticker) || []
    setPortfolio(portfolioTickers)
    setWatchlist(watchlistTickers)
    try {
      const saved = JSON.parse(localStorage.getItem(`saved_news_${uid}`) || '[]')
      setSavedIds(new Set(saved))
    } catch {}
    setLoading(true)
    try {
      const allTickers = [...new Set([...portfolioTickers, ...watchlistTickers])].slice(0, 12)
      const [data, filingsData] = await Promise.allSettled([
        api.getNews(allTickers),
        allTickers.length ? api.getRecentFilings(allTickers) : Promise.resolve([]),
      ])
      const newsItems = data.status === 'fulfilled' ? data.value : []
      setNews(newsItems)
      if (filingsData.status === 'fulfilled') setFilings(filingsData.value || [])
      if (newsItems.length > 0) {
        const headlines = newsItems.map((n: NewsItem) => n.headline)
        const d = await api.getNewsDigest(headlines, portfolioTickers)
        setDigest(d)
      }
    } catch (e: any) {
      toast.error(e.message)
    }
    setLoading(false)
  }

  async function openDeepDive(item: NewsItem) {
    // SEC filings have no article body — just open the SEC page directly
    if (item.source === 'SEC Filing') {
      window.open(item.url, '_blank', 'noopener,noreferrer')
      return
    }
    setSelected(item)
    setDeepDive(null)
    setDiving(true)
    if (userId) recordInteraction(userId, item, undefined, 2)
    try {
      const d = await api.deepDive(item.ticker || 'market', `${item.headline}. ${item.summary || ''}`)
      setDeepDive(d)
    } catch (e: any) {
      setDeepDive({ what_happened: 'Analysis unavailable — please try again shortly.', why_it_matters: e?.message || '' })
    }
    setDiving(false)
  }

  function toggleSave(item: NewsItem) {
    if (!userId) return
    setSavedIds(prev => {
      const next = new Set(prev)
      const adding = !prev.has(item.id)
      if (adding) { next.add(item.id); recordInteraction(userId, item, undefined, 4) } else { next.delete(item.id) }
      localStorage.setItem(`saved_news_${userId}`, JSON.stringify([...next]))
      toast.success(adding ? 'Article saved for later' : 'Article removed from saved')
      return next
    })
  }

  function openShare(item: NewsItem, e: React.MouseEvent) {
    e.stopPropagation()
    setShareItem(item)
    setShareBody(`📰 ${item.headline}${item.ticker ? ` $${item.ticker}` : ''} — ${item.source}`)
  }

  async function submitShare() {
    if (!userId || !shareItem || !shareBody.trim()) return
    setSharing(true)
    try {
      const { data: profile } = await supabase.from('profiles').select('username').eq('id', userId).single()
      await supabase.from('posts').insert({ user_id: userId, username: profile?.username || 'user', type: 'news', body: shareBody.trim(), ticker: shareItem.ticker || null })
      toast.success('Shared to community!')
      setShareItem(null)
      setShareBody('')
    } catch (e: any) { toast.error(e.message) }
    setSharing(false)
  }

  const portfolioSet = new Set(portfolio)
  const watchlistSet = new Set(watchlist)
  const prefs = userId ? loadPrefs(userId) : { tickers: {}, sectors: {}, sources: {} }

  // Inject SEC filings as synthetic news items
  const filingNewsItems: NewsItem[] = filings.map((f, i) => ({
    id: -1000 - i,
    headline: `${f.symbol} filed ${f.form} — ${f.description}`,
    summary: `Filed ${f.filedDate}. Click to view on SEC EDGAR.`,
    source: 'SEC Filing',
    url: f.url,
    datetime: new Date(f.filedDate).getTime(),
    sentiment: 'neutral' as const,
    ticker: f.symbol,
    relevance: 90,
  }))

  const allItems = [...news, ...filingNewsItems]

  const filtered = allItems
    .filter(n => {
      if (showSaved) return savedIds.has(n.id)
      if (sentFilter !== 'All' && n.sentiment !== sentFilter.toLowerCase()) return false
      if (listFilter === 'Portfolio') return n.ticker && portfolioSet.has(n.ticker)
      if (listFilter === 'Watchlist') return n.ticker && watchlistSet.has(n.ticker)
      if (listFilter === 'Filings') return n.source === 'SEC Filing'
      return true
    })
    .map(n => ({ ...n, _score: (n.relevance || 50) + personalBoost(prefs, n) }))
    .sort((a, b) => {
      const tierA = a._score >= 75 ? 2 : a._score >= 55 ? 1 : 0
      const tierB = b._score >= 75 ? 2 : b._score >= 55 ? 1 : 0
      if (tierB !== tierA) return tierB - tierA
      return b.datetime - a.datetime
    })

  return (
    <div style={{ padding: 28 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Market News</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>AI-curated market news ranked by relevance to your portfolio</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {(['All', 'Positive', 'Negative'] as SentFilter[]).map(f => (
          <button key={f} onClick={() => { setSentFilter(f); setShowSaved(false) }}
            style={{ padding: '7px 16px', borderRadius: 20, fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', background: !showSaved && sentFilter === f && listFilter === 'All' ? 'var(--primary)' : 'var(--surface)', color: !showSaved && sentFilter === f && listFilter === 'All' ? 'white' : 'var(--text2)', border: !showSaved && sentFilter === f && listFilter === 'All' ? 'none' : '1px solid var(--border)' }}
          >{f}</button>
        ))}
        <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        {(['Portfolio', 'Watchlist'] as ListFilter[]).map(f => (
          <button key={f} onClick={() => { setListFilter(f === listFilter ? 'All' : f); setSentFilter('All'); setShowSaved(false) }}
            style={{ padding: '7px 16px', borderRadius: 20, fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', background: !showSaved && listFilter === f ? 'var(--accent)' : 'var(--surface)', color: !showSaved && listFilter === f ? 'white' : 'var(--text2)', border: !showSaved && listFilter === f ? 'none' : '1px solid var(--border)' }}
          >My {f}</button>
        ))}
        {filings.length > 0 && (
          <button onClick={() => { setListFilter(listFilter === 'Filings' ? 'All' : 'Filings'); setSentFilter('All'); setShowSaved(false) }}
            style={{ padding: '7px 16px', borderRadius: 20, fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, background: !showSaved && listFilter === 'Filings' ? 'rgba(91,106,255,0.15)' : 'var(--surface)', color: !showSaved && listFilter === 'Filings' ? 'var(--accent2)' : 'var(--text2)', border: !showSaved && listFilter === 'Filings' ? '1px solid rgba(91,106,255,0.4)' : '1px solid var(--border)' }}
          >
            <IconFileText size={12} /> SEC Filings <span style={{ fontSize: 10, background: 'rgba(91,106,255,0.2)', color: 'var(--accent2)', padding: '1px 5px', borderRadius: 8 }}>{filings.length}</span>
          </button>
        )}
        <button onClick={() => setShowSaved(s => !s)}
          style={{ padding: '7px 16px', borderRadius: 20, fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', background: showSaved ? 'rgba(245,158,11,0.15)' : 'var(--surface)', color: showSaved ? 'var(--amber)' : 'var(--text2)', border: showSaved ? '1px solid rgba(245,158,11,0.4)' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <IconBookmarkFilled size={12} /> Saved{savedIds.size > 0 ? ` (${savedIds.size})` : ''}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }} className="grid-cols-1 xl:grid-cols-[1fr_280px]">
        {/* News cards */}
        <div>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card" style={{ height: 180, background: 'var(--surface2)', animation: 'pulse 1.5s infinite' }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="card text-center py-12">
              <p style={{ color: 'var(--text2)', fontSize: 14 }}>No news matching your filters.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map((n, i) => {
                const inPortfolio = !!(n.ticker && portfolioSet.has(n.ticker))
                const inWatchlist = !!(n.ticker && watchlistSet.has(n.ticker))
                const isHighRelevance = (n.relevance || 0) >= 70 && (inPortfolio || inWatchlist)
                return (
                  <div key={i} className="card" onClick={() => openDeepDive(n)}
                    style={{ cursor: 'pointer', padding: 20, borderColor: isHighRelevance ? 'rgba(44,110,106,0.35)' : undefined, transition: 'border-color 0.2s, box-shadow 0.2s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(44,110,106,0.12)'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = ''}
                  >
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      {/* Ticker bubble or sentiment dot */}
                      <div style={{ flexShrink: 0, marginTop: 2 }}>
                        {n.ticker ? (
                          <div style={{ width: 38, height: 38, borderRadius: 9, background: tickerColor(n.ticker), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: Math.max(7, 11 - Math.max(0, n.ticker.length - 3)), color: 'white', letterSpacing: -0.3 }}>{n.ticker.slice(0, 5)}</span>
                          </div>
                        ) : (
                          <div style={{ width: 38, height: 38, borderRadius: 9, background: SENT_BG[n.sentiment], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: SENT_COLORS[n.sentiment] }} />
                          </div>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Source + sentiment + time */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 600, color: 'var(--text2)' }}>{n.source}</span>
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: SENT_BG[n.sentiment], color: SENT_COLORS[n.sentiment], fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'capitalize' }}>{n.sentiment}</span>
                          {inPortfolio && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(34,197,94,0.12)', color: 'var(--green)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>Portfolio</span>}
                          {!inPortfolio && inWatchlist && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--primary-light)', color: 'var(--primary)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>Watchlist</span>}
                          <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>{timeAgo(n.datetime)}</span>
                        </div>

                        {/* Headline */}
                        <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, lineHeight: 1.45, marginBottom: n.summary ? 6 : 10 }}>{n.headline}</p>

                        {/* Summary */}
                        {n.summary && n.summary !== n.headline && (
                          <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 10 }}>{n.summary.slice(0, 140)}{n.summary.length > 140 ? '…' : ''}</p>
                        )}

                        {/* Footer actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          {n.ticker && !inPortfolio && !inWatchlist && (
                            <span onClick={e => e.stopPropagation()}>
                              <WatchlistButton ticker={n.ticker} userId={userId} inWatchlist={false} inPortfolio={false} onAdded={t => setWatchlist(prev => [...prev, t])} />
                            </span>
                          )}
                          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span onClick={e => { e.stopPropagation(); toggleSave(n) }} title={savedIds.has(n.id) ? 'Remove from saved' : 'Save for later'}
                              style={{ cursor: 'pointer', color: savedIds.has(n.id) ? 'var(--amber)' : 'var(--text2)', lineHeight: 0 }}
                            >
                              {savedIds.has(n.id) ? <IconBookmarkFilled size={15} /> : <IconBookmark size={15} />}
                            </span>
                            <span onClick={e => openShare(n, e)} title="Share to community" style={{ cursor: 'pointer', color: 'var(--text2)', lineHeight: 0 }}>
                              <IconShare size={15} />
                            </span>
                            <button onClick={e => { e.stopPropagation(); openDeepDive(n) }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, background: 'var(--primary-light)', border: '1px solid var(--primary)', color: 'var(--primary)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}
                            >
                              <IconBrain size={12} /> Deep Dive
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4 hidden xl:block">
          {digest && (
            <div className="card">
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>AI Digest</p>
              <p style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text2)', marginBottom: 10 }}>{digest.summary}</p>
              {digest.action && (
                <div style={{ padding: '8px 12px', background: 'var(--primary-light)', border: '1px solid rgba(44,110,106,0.25)', borderRadius: 8, fontSize: 12, color: 'var(--primary)' }}>
                  💡 {digest.action}
                </div>
              )}
            </div>
          )}

            {/* Sentiment summary */}
          {news.length > 0 && (() => {
            const pos = news.filter(n => n.sentiment === 'positive').length
            const neg = news.filter(n => n.sentiment === 'negative').length
            const neu = news.filter(n => n.sentiment === 'neutral').length
            const total = news.length
            return (
              <div className="card">
                <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Sentiment</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[{ label: 'Positive', count: pos, color: 'var(--green)' }, { label: 'Neutral', count: neu, color: 'var(--amber)' }, { label: 'Negative', count: neg, color: 'var(--red)' }].map(s => (
                    <div key={s.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontFamily: 'Syne, sans-serif', color: 'var(--text2)' }}>{s.label}</span>
                        <span style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: s.color, fontWeight: 700 }}>{s.count}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--surface2)' }}>
                        <div style={{ height: '100%', borderRadius: 2, width: `${total > 0 ? (s.count / total) * 100 : 0}%`, background: s.color, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Pipeline sources */}
          {(() => {
            const sourceCounts = news.reduce<Record<string, number>>((acc, n) => { acc[n.source] = (acc[n.source] || 0) + 1; return acc }, {})
            const sources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])
            const max = sources[0]?.[1] || 1
            const isReddit = (s: string) => s.startsWith('r/')
            if (!sources.length) return null
            return (
              <div className="card">
                <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
                  Pipeline Sources <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 400, marginLeft: 6 }}>{news.length} articles</span>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sources.map(([src, count]) => (
                    <div key={src}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {isReddit(src) && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,69,0,0.15)', color: '#ff6314', fontWeight: 700 }}>r/</span>}
                          {isReddit(src) ? src.slice(2) : src}
                        </span>
                        <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text2)' }}>{count}</span>
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: 'var(--surface2)' }}>
                        <div style={{ height: '100%', borderRadius: 2, width: `${(count / max) * 100}%`, background: isReddit(src) ? '#ff6314' : 'var(--primary)', opacity: 0.7, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Deep Dive Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="News Deep Dive" wide>
        {selected && (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <h4 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, lineHeight: 1.4 }}>{selected.headline}</h4>
              {selected.ticker && (
                <div style={{ flexShrink: 0 }}>
                  <WatchlistButton ticker={selected.ticker} userId={userId} size="md" inWatchlist={watchlistSet.has(selected.ticker)} inPortfolio={portfolioSet.has(selected.ticker)} onAdded={t => setWatchlist(prev => [...prev, t])} />
                </div>
              )}
            </div>
            <a href={selected.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--primary)', fontFamily: 'Syne, sans-serif', marginBottom: 20, textDecoration: 'none' }}>
              <IconExternalLink size={13} /> View original article
            </a>
            {diving ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}><LoadingSpinner size={32} /></div>
            ) : deepDive ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: 'What happened', value: deepDive.what_happened },
                  { label: 'Why it matters', value: deepDive.why_it_matters },
                  { label: 'Portfolio impact', value: deepDive.portfolio_impact },
                  { label: 'Action suggestion', value: deepDive.action_suggestion },
                ].map(s => s.value && (
                  <div key={s.label}>
                    <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</p>
                    <p style={{ fontSize: 14, lineHeight: 1.7 }}>{s.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      {/* Share modal */}
      <Modal open={!!shareItem} onClose={() => setShareItem(null)} title="Share to Community">
        {shareItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
              {shareItem.headline}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 6 }}>Your take (optional)</label>
              <textarea value={shareBody} onChange={e => setShareBody(e.target.value)} rows={3} maxLength={500} placeholder="Add your thoughts..."
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 13, resize: 'none', outline: 'none' }}
              />
              <p style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'right', marginTop: 2 }}>{shareBody.length}/500</p>
            </div>
            <button onClick={submitShare} disabled={sharing || !shareBody.trim()}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px', borderRadius: 8, background: 'var(--primary)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: sharing || !shareBody.trim() ? 0.6 : 1 }}
            >
              {sharing ? <LoadingSpinner size={16} /> : <IconSend size={16} />}
              Post to Community
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
