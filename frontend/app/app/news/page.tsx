'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Modal } from '@/components/shared/Modal'
import { WatchlistButton } from '@/components/shared/WatchlistButton'
import { timeAgo } from '@/lib/utils'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { IconExternalLink, IconBookmark, IconBookmarkFilled, IconShare, IconSend } from '@tabler/icons-react'
import { toast } from 'sonner'

interface NewsItem {
  id: number; headline: string; summary?: string; source: string; url: string
  datetime: number; sentiment: 'positive' | 'negative' | 'neutral'; ticker?: string
}

const SENT_COLORS = { positive: 'var(--green)', negative: 'var(--red)', neutral: 'var(--amber)' }
const DEV_USER_ID = '851a4abb-27f2-4c32-9fb3-28ef4c22af49'

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sentFilter, setSentFilter] = useState('All')
  const [listFilter, setListFilter] = useState('All') // All | Portfolio | Watchlist
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
    // Load saved article IDs from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem(`saved_news_${uid}`) || '[]')
      setSavedIds(new Set(saved))
    } catch {}

    setLoading(true)
    try {
      const data = await api.getNews(portfolioTickers.slice(0, 5))
      setNews(data)
      if (data.length > 0) {
        const headlines = data.map((n: NewsItem) => n.headline)
        const d = await api.getNewsDigest(headlines, portfolioTickers)
        setDigest(d)
      }
    } catch (e: any) {
      toast.error(e.message)
    }
    setLoading(false)
  }

  async function openDeepDive(item: NewsItem) {
    setSelected(item)
    setDeepDive(null)
    setDiving(true)
    try {
      const d = await api.deepDive(item.ticker || 'market', `${item.headline}. ${item.summary || ''}`)
      setDeepDive(d)
    } catch (e: any) {
      console.error('Deep dive failed:', e)
      setDeepDive({ what_happened: 'Analysis unavailable — please try again shortly.', why_it_matters: e?.message || '' })
    }
    setDiving(false)
  }

  function toggleSave(item: NewsItem) {
    if (!userId) return
    setSavedIds(prev => {
      const next = new Set(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      localStorage.setItem(`saved_news_${userId}`, JSON.stringify([...next]))
      toast.success(next.has(item.id) ? 'Article saved for later' : 'Article removed from saved')
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
      await supabase.from('posts').insert({
        user_id: userId,
        username: profile?.username || 'user',
        type: 'news',
        body: shareBody.trim(),
        ticker: shareItem.ticker || null,
      })
      toast.success('Shared to community!')
      setShareItem(null)
      setShareBody('')
    } catch (e: any) {
      toast.error(e.message)
    }
    setSharing(false)
  }

  const portfolioSet = new Set(portfolio)
  const watchlistSet = new Set(watchlist)

  const filtered = news.filter(n => {
    if (showSaved) return savedIds.has(n.id)
    if (sentFilter !== 'All' && n.sentiment !== sentFilter.toLowerCase()) return false
    if (listFilter === 'Portfolio') return n.ticker && portfolioSet.has(n.ticker)
    if (listFilter === 'Watchlist') return n.ticker && watchlistSet.has(n.ticker)
    return true
  })

  const sentCounts = {
    positive: news.filter(n => n.sentiment === 'positive').length,
    negative: news.filter(n => n.sentiment === 'negative').length,
    neutral: news.filter(n => n.sentiment === 'neutral').length,
  }
  const pieData = [
    { name: 'Positive', value: sentCounts.positive, color: 'var(--green)' },
    { name: 'Negative', value: sentCounts.negative, color: 'var(--red)' },
    { name: 'Neutral', value: sentCounts.neutral, color: 'var(--amber)' },
  ].filter(d => d.value > 0)

  return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }} className="grid-cols-1 xl:grid-cols-[1fr_280px]">
      <div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 16 }}>Market News</h1>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Sentiment */}
          {['All', 'Positive', 'Negative'].map(f => (
            <button key={f} onClick={() => setSentFilter(f)}
              style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', background: sentFilter === f ? 'var(--accent)' : 'var(--surface)', color: sentFilter === f ? 'white' : 'var(--text2)', border: sentFilter === f ? 'none' : '1px solid var(--border)' }}
            >{f}</button>
          ))}
          <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
          {/* List filter */}
          {['All', 'Portfolio', 'Watchlist'].map(f => (
            <button key={f} onClick={() => { setListFilter(f); setShowSaved(false) }}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer',
                background: !showSaved && listFilter === f ? (f === 'Portfolio' ? 'rgba(16,185,129,0.2)' : f === 'Watchlist' ? 'rgba(91,106,255,0.2)' : 'var(--accent)') : 'var(--surface)',
                color: !showSaved && listFilter === f ? (f === 'Portfolio' ? 'var(--green)' : f === 'Watchlist' ? 'var(--accent2)' : 'white') : 'var(--text2)',
                border: !showSaved && listFilter === f ? 'none' : '1px solid var(--border)',
              }}
            >{f === 'All' ? 'All News' : `My ${f}`}</button>
          ))}
          <button onClick={() => setShowSaved(s => !s)}
            className="flex items-center gap-1"
            style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer',
              background: showSaved ? 'rgba(245,158,11,0.2)' : 'var(--surface)',
              color: showSaved ? 'var(--amber)' : 'var(--text2)',
              border: showSaved ? 'none' : '1px solid var(--border)',
            }}
          >
            <IconBookmarkFilled size={11} /> Saved {savedIds.size > 0 && `(${savedIds.size})`}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><LoadingSpinner size={32} /></div>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-12">
            <p style={{ color: 'var(--text2)', fontSize: 14 }}>No news matching your filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((n, i) => {
              const inPortfolio = !!(n.ticker && portfolioSet.has(n.ticker))
              const inWatchlist = !!(n.ticker && watchlistSet.has(n.ticker))
              return (
                <div key={i} className="card hover:border-accent transition-colors cursor-pointer" onClick={() => openDeepDive(n)} style={{ transition: 'border-color 0.2s' }}>
                  <div className="flex items-start gap-3">
                    <div style={{ width: 3, flexShrink: 0, alignSelf: 'stretch', borderRadius: 2, background: SENT_COLORS[n.sentiment] }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, lineHeight: 1.4, marginBottom: 4 }}>{n.headline}</p>
                      {n.summary && <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 6 }}>{n.summary.slice(0, 150)}{n.summary.length > 150 ? '…' : ''}</p>}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif' }}>{n.source}</span>
                        <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: `${SENT_COLORS[n.sentiment]}18`, color: SENT_COLORS[n.sentiment], fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'capitalize' }}>{n.sentiment}</span>
                        {n.ticker && <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--accent2)', fontWeight: 700 }}>{n.ticker}</span>}
                        {n.ticker && (
                          <span onClick={e => e.stopPropagation()}>
                            <WatchlistButton ticker={n.ticker} userId={userId} inWatchlist={inWatchlist} inPortfolio={inPortfolio} onAdded={t => setWatchlist(prev => [...prev, t])} />
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>{timeAgo(n.datetime)}</span>
                        {/* Save & Share */}
                        <span onClick={e => { e.stopPropagation(); toggleSave(n) }}
                          title={savedIds.has(n.id) ? 'Remove from saved' : 'Save for later'}
                          style={{ cursor: 'pointer', color: savedIds.has(n.id) ? 'var(--amber)' : 'var(--text2)', lineHeight: 0 }}
                        >
                          {savedIds.has(n.id) ? <IconBookmarkFilled size={14} /> : <IconBookmark size={14} />}
                        </span>
                        <span onClick={e => openShare(n, e)}
                          title="Share to community"
                          style={{ cursor: 'pointer', color: 'var(--text2)', lineHeight: 0 }}
                        >
                          <IconShare size={14} />
                        </span>
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
        {pieData.length > 0 && (
          <div className="card">
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Sentiment</p>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={3}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: any, name: any) => [v, name]} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontFamily: 'DM Mono, monospace' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center gap-1">
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {digest && (
          <div className="card">
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 10, fontSize: 14 }}>AI Digest</p>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text2)', marginBottom: 10 }}>{digest.summary}</p>
            {digest.action && (
              <div style={{ padding: '8px 12px', background: 'rgba(91,106,255,0.1)', border: '1px solid rgba(91,106,255,0.2)', borderRadius: 8, fontSize: 12 }}>
                💡 {digest.action}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Deep Dive Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="News Deep Dive" wide>
        {selected && (
          <div>
            <div className="flex items-start justify-between gap-3 mb-3">
              <h4 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, lineHeight: 1.4 }}>{selected.headline}</h4>
              {selected.ticker && (
                <div style={{ flexShrink: 0 }}>
                  <WatchlistButton
                    ticker={selected.ticker} userId={userId} size="md"
                    inWatchlist={watchlistSet.has(selected.ticker)}
                    inPortfolio={portfolioSet.has(selected.ticker)}
                    onAdded={t => setWatchlist(prev => [...prev, t])}
                  />
                </div>
              )}
            </div>
            <a href={selected.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mb-6" style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'Syne, sans-serif' }}>
              <IconExternalLink size={13} /> View original article
            </a>
            {diving ? (
              <div className="flex justify-center py-8"><LoadingSpinner size={32} /></div>
            ) : deepDive ? (
              <div className="space-y-4">
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

      {/* Share to Community modal */}
      <Modal open={!!shareItem} onClose={() => setShareItem(null)} title="Share to Community">
        {shareItem && (
          <div className="space-y-4">
            <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
              {shareItem.headline}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 6 }}>Your take (optional)</label>
              <textarea
                value={shareBody}
                onChange={e => setShareBody(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Add your thoughts..."
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 13, resize: 'none', outline: 'none' }}
              />
              <p style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'right', marginTop: 2 }}>{shareBody.length}/500</p>
            </div>
            <button onClick={submitShare} disabled={sharing || !shareBody.trim()}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg"
              style={{ background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, opacity: sharing || !shareBody.trim() ? 0.6 : 1 }}
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
