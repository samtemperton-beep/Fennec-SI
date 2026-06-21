'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { SignalBadge } from '@/components/shared/SignalBadge'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Modal } from '@/components/shared/Modal'
import { fmtCurrency, fmtPct, fmtLarge, fmt } from '@/lib/utils'
import { IconPlus, IconBrain, IconRefresh, IconTrash, IconArrowRight, IconCamera, IconChevronUp, IconChevronDown, IconSelector } from '@tabler/icons-react'
import { toast } from 'sonner'

interface WItem {
  id: number; ticker: string; market: string; name?: string; current_price?: number
  change_pct?: number; signal?: string; sector?: string; pe?: number
  mkt_cap?: string; div_yld?: number; w52_lo?: number; w52_hi?: number; note?: string
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [ticker, setTicker] = useState('')
  const [market, setMarket] = useState('US')
  const [analyzingSet, setAnalyzingSet] = useState(new Set<number>())
  const [screenshotOpen, setScreenshotOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterSector, setFilterSector] = useState('All')
  const [filterMarket, setFilterMarket] = useState('All')
  const [filterMktCap, setFilterMktCap] = useState('All')
  const [filterMinPrice, setFilterMinPrice] = useState('')
  const [filterMaxPrice, setFilterMaxPrice] = useState('')
  const supabase = createClient()

  function parseMktCap(s?: string): number {
    if (!s) return -1
    const n = parseFloat(s.replace(/[^0-9.]/g, ''))
    if (s.includes('T')) return n * 1e12
    if (s.includes('B')) return n * 1e9
    if (s.includes('M')) return n * 1e6
    if (s.includes('K')) return n * 1e3
    return n
  }

  function sortValue(item: WItem, col: string): number | string {
    switch (col) {
      case 'Ticker': return item.ticker
      case 'Price': return item.current_price ?? -1
      case 'Change %': return item.change_pct ?? -999
      case 'Mkt Cap': return parseMktCap(item.mkt_cap)
      case 'P/E': return item.pe ?? -1
      case 'Div Yield': return item.div_yld ?? -1
      case '52W Hi': return item.w52_hi ?? -1
      case 'Signal': return item.signal ?? ''
      default: return 0
    }
  }

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sortedItems = sortCol ? [...items].sort((a, b) => {
    const av = sortValue(a, sortCol), bv = sortValue(b, sortCol)
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortDir === 'asc' ? cmp : -cmp
  }) : items

  const sectors = ['All', ...Array.from(new Set(items.map(i => i.sector).filter(Boolean))).sort()] as string[]
  const markets = ['All', ...Array.from(new Set(items.map(i => i.market).filter(Boolean))).sort()] as string[]

  const filteredItems = sortedItems.filter(item => {
    if (filterSector !== 'All' && item.sector !== filterSector) return false
    if (filterMarket !== 'All' && item.market !== filterMarket) return false
    if (filterMinPrice && (item.current_price || 0) < parseFloat(filterMinPrice)) return false
    if (filterMaxPrice && (item.current_price || 0) > parseFloat(filterMaxPrice)) return false
    if (filterMktCap !== 'All') {
      const raw = parseMktCap(item.mkt_cap)
      if (filterMktCap === 'Small' && raw >= 2e9) return false
      if (filterMktCap === 'Mid' && (raw < 2e9 || raw >= 10e9)) return false
      if (filterMktCap === 'Large' && raw < 10e9) return false
    }
    return true
  })

  const activeFilters = [filterSector, filterMarket, filterMktCap].filter(f => f !== 'All').length
    + (filterMinPrice || filterMaxPrice ? 1 : 0)

  useEffect(() => {
    const DEV_USER_ID = '851a4abb-27f2-4c32-9fb3-28ef4c22af49'
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? DEV_USER_ID
      setUserId(uid)
      load(uid)
    })
  }, [])

  async function load(uid: string) {
    setLoading(true)
    const { data } = await supabase.from('watchlist').select('*').eq('user_id', uid)
    const loaded = data || []
    setItems(loaded)
    setLoading(false)
    // Auto-enrich any items missing price data
    const stale = loaded.filter((i: WItem) => !i.current_price)
    if (stale.length > 0) enrichItems(stale)
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !ticker) return
    const t = ticker.toUpperCase()
    if (items.some(i => i.ticker === t)) return toast.error(`${t} is already in your watchlist`)
    const { data: portfolioData } = await supabase.from('holdings').select('ticker').eq('user_id', userId).eq('ticker', t)
    if (portfolioData && portfolioData.length > 0) return toast.error(`${t} is already in your portfolio`)
    const { data, error } = await supabase.from('watchlist').insert({ user_id: userId, ticker: t, market }).select().single()
    if (error) return toast.error(error.message)
    setItems(prev => [data, ...prev])
    setAddOpen(false); setTicker('')
    toast.success(`${t} added to watchlist`)
  }

  async function remove(id: number) {
    await supabase.from('watchlist').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function enrichItems(itemsToEnrich: WItem[]) {
    if (!itemsToEnrich.length) return
    // Process in batches of 3 to avoid Finnhub rate limits (3 calls per ticker)
    for (let i = 0; i < itemsToEnrich.length; i += 3) {
      const batch = itemsToEnrich.slice(i, i + 3)
      await Promise.all(batch.map(async item => {
        try {
          const q = await api.getQuote(item.ticker)
          const updates: Partial<WItem> = {
            name: q.name || item.name,
            current_price: q.price || item.current_price,
            change_pct: q.changePct ?? item.change_pct,
            sector: q.sector || item.sector,
            mkt_cap: q.marketCap ? formatMarketCap(q.marketCap) : item.mkt_cap,
            pe: q.pe || item.pe,
            div_yld: q.divYield || item.div_yld,
            w52_lo: q.w52Lo || item.w52_lo,
            w52_hi: q.w52Hi || item.w52_hi,
          }
          // Update this item in the full list using functional state update
          setItems(prev => prev.map(p => p.id === item.id ? { ...p, ...updates } : p))
          await supabase.from('watchlist').update(updates).eq('id', item.id)
        } catch (e) {
          console.warn(`Failed to enrich ${item.ticker}:`, e)
        }
      }))
    }
  }

  function formatMarketCap(cap: number): string {
    if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`
    return `$${cap}`
  }

  async function refreshPrices() {
    if (!items.length) return
    toast.promise(enrichItems(items), {
      loading: `Fetching data for ${items.length} stocks…`,
      success: 'Watchlist updated',
      error: 'Some quotes failed to load',
    })
  }

  async function analyzeItem(item: WItem) {
    setAnalyzingSet(s => new Set(s).add(item.id))
    try {
      const result = await api.analyzeStock(item.ticker, { price: item.current_price, sector: item.sector })
      await supabase.from('watchlist').update({ signal: result.signal }).eq('id', item.id)
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, signal: result.signal } : i))
    } catch {}
    setAnalyzingSet(s => { const n = new Set(s); n.delete(item.id); return n })
  }

  async function importScreenshot(file: File) {
    if (!userId) return
    setImporting(true)
    try {
      const reader = new FileReader()
      reader.onload = async ev => {
        const base64 = (ev.target?.result as string).split(',')[1]
        const mediaType = file.type as any
        const { holdings } = await api.importScreenshot(base64, mediaType)

        // Get existing watchlist tickers and portfolio tickers
        const existingTickers = new Set(items.map(i => i.ticker.toUpperCase()))
        const { data: portfolioData } = await supabase.from('holdings').select('ticker').eq('user_id', userId)
        const portfolioTickers = new Set((portfolioData || []).map((h: any) => h.ticker.toUpperCase()))

        let added = 0, skippedDupe = 0, skippedPortfolio = 0
        const newlyAddedItems: WItem[] = []
        for (const h of holdings) {
          const t = h.ticker.toUpperCase()
          if (existingTickers.has(t)) { skippedDupe++; continue }
          if (portfolioTickers.has(t)) { skippedPortfolio++; continue }
          const { data } = await supabase.from('watchlist').insert({ user_id: userId, ticker: t, market: 'US' }).select().single()
          if (data) { setItems(prev => [data, ...prev]); existingTickers.add(t); added++; newlyAddedItems.push(data) }
        }

        const parts = [`Added ${added} tickers`]
        if (skippedDupe > 0) parts.push(`${skippedDupe} already in watchlist`)
        if (skippedPortfolio > 0) parts.push(`${skippedPortfolio} already in portfolio`)
        toast.success(parts.join(' · '))
        setScreenshotOpen(false)
        // Auto-fetch full quote data for newly added stocks
        if (newlyAddedItems.length > 0) {
          toast.info('Fetching market data…')
          enrichItems(newlyAddedItems)
        }
      }
      reader.readAsDataURL(file)
    } catch (e: any) {
      toast.error('Import failed: ' + e.message)
    } finally {
      setImporting(false)
    }
  }

  async function addToPortfolio(item: WItem) {
    if (!userId) return
    const buyPrice = item.current_price || 0
    await supabase.from('holdings').insert({ user_id: userId, ticker: item.ticker, shares: 0, buy_price: buyPrice, current_price: buyPrice, market: item.market })
    toast.success(`${item.ticker} added to portfolio`)
  }

  return (
    <div style={{ padding: 24 }}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Watchlist</h1>
        <div className="flex gap-2">
          <button onClick={refreshPrices} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            <IconRefresh size={14} /> Refresh
          </button>
          <button onClick={() => items.forEach(i => analyzeItem(i))} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(91,106,255,0.15)', border: '1px solid rgba(91,106,255,0.3)', color: 'var(--accent2)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            <IconBrain size={14} /> Analyze All
          </button>
          <button onClick={() => setScreenshotOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            <IconCamera size={14} /> Import Screenshot
          </button>
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            <IconPlus size={14} /> Add
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {!loading && items.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          {/* Sector */}
          <select value={filterSector} onChange={e => setFilterSector(e.target.value)}
            style={{ padding: '6px 10px', background: filterSector !== 'All' ? 'rgba(91,106,255,0.15)' : 'var(--surface)', border: `1px solid ${filterSector !== 'All' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, color: filterSector !== 'All' ? 'var(--accent)' : 'var(--text2)', fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 600, outline: 'none' }}
          >
            {sectors.map(s => <option key={s} value={s}>{s === 'All' ? 'All Sectors' : s}</option>)}
          </select>

          {/* Market */}
          {markets.length > 2 && (
            <select value={filterMarket} onChange={e => setFilterMarket(e.target.value)}
              style={{ padding: '6px 10px', background: filterMarket !== 'All' ? 'rgba(91,106,255,0.15)' : 'var(--surface)', border: `1px solid ${filterMarket !== 'All' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, color: filterMarket !== 'All' ? 'var(--accent)' : 'var(--text2)', fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 600, outline: 'none' }}
            >
              {markets.map(m => <option key={m} value={m}>{m === 'All' ? 'All Markets' : m}</option>)}
            </select>
          )}

          {/* Market cap */}
          <select value={filterMktCap} onChange={e => setFilterMktCap(e.target.value)}
            style={{ padding: '6px 10px', background: filterMktCap !== 'All' ? 'rgba(91,106,255,0.15)' : 'var(--surface)', border: `1px solid ${filterMktCap !== 'All' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, color: filterMktCap !== 'All' ? 'var(--accent)' : 'var(--text2)', fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 600, outline: 'none' }}
          >
            {['All', 'Small', 'Mid', 'Large'].map(c => <option key={c} value={c}>{c === 'All' ? 'All Cap Sizes' : `${c}-cap`}</option>)}
          </select>

          {/* Price range */}
          <div className="flex items-center gap-1">
            <input type="number" placeholder="Min $" value={filterMinPrice} onChange={e => setFilterMinPrice(e.target.value)}
              style={{ width: 72, padding: '6px 8px', background: 'var(--surface)', border: `1px solid ${filterMinPrice ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 12, outline: 'none' }}
            />
            <span style={{ color: 'var(--text2)', fontSize: 12 }}>–</span>
            <input type="number" placeholder="Max $" value={filterMaxPrice} onChange={e => setFilterMaxPrice(e.target.value)}
              style={{ width: 72, padding: '6px 8px', background: 'var(--surface)', border: `1px solid ${filterMaxPrice ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 12, outline: 'none' }}
            />
          </div>

          {/* Clear filters */}
          {activeFilters > 0 && (
            <button onClick={() => { setFilterSector('All'); setFilterMarket('All'); setFilterMktCap('All'); setFilterMinPrice(''); setFilterMaxPrice('') }}
              style={{ padding: '6px 10px', background: 'rgba(240,84,84,0.1)', border: '1px solid rgba(240,84,84,0.3)', borderRadius: 8, color: 'var(--red)', fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
            </button>
          )}

          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
            {filteredItems.length} / {items.length} stocks
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size={32} /></div>
      ) : items.length === 0 ? (
        <div className="card text-center py-16">
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 18, marginBottom: 8 }}>Watchlist is empty</p>
          <button onClick={() => setAddOpen(true)} style={{ background: 'var(--accent)', color: 'white', padding: '10px 20px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>Add Stock</button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Ticker', 'Price', 'Change %', 'Mkt Cap', 'P/E', 'Div Yield', '52W Hi', 'Signal', ''].map(h => {
                  const sortable = h !== '' && h !== '52W Range'
                  const active = sortCol === h
                  return (
                    <th key={h}
                      onClick={sortable ? () => toggleSort(h) : undefined}
                      style={{
                        padding: '10px 12px', color: active ? 'var(--accent)' : 'var(--text2)',
                        fontFamily: 'Syne, sans-serif', fontSize: 11, fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        textAlign: h === 'Ticker' ? 'left' : 'center', whiteSpace: 'nowrap',
                        cursor: sortable ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {h}
                        {sortable && (active
                          ? (sortDir === 'asc' ? <IconChevronUp size={11} /> : <IconChevronDown size={11} />)
                          : <IconSelector size={11} style={{ opacity: 0.3 }} />
                        )}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-surface2">
                  <td style={{ padding: '12px', minWidth: 160 }}>
                    <div className="flex items-center gap-2">
                      <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>{item.ticker}</span>
                      {item.market !== 'US' && <span style={{ fontSize: 10, color: 'var(--text2)', background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>{item.market}</span>}
                    </div>
                    {item.name && <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{item.name}</p>}
                    {item.sector && <p style={{ fontSize: 10, color: 'var(--text2)', marginTop: 1, opacity: 0.7 }}>{item.sector}</p>}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{item.current_price ? fmtCurrency(item.current_price) : '—'}</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'DM Mono, monospace', fontSize: 13, color: (item.change_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {item.change_pct != null ? fmtPct(item.change_pct) : '—'}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: 13, color: 'var(--text2)' }}>{item.mkt_cap || '—'}</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{item.pe ? fmt(item.pe, 1) : '—'}</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{item.div_yld ? `${fmt(item.div_yld, 2)}%` : '—'}</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: 12, color: 'var(--text2)' }}>
                    {item.w52_lo && item.w52_hi
                      ? <span title={`Lo: ${fmtCurrency(item.w52_lo)} · Hi: ${fmtCurrency(item.w52_hi)}`}>{fmtCurrency(item.w52_hi)}</span>
                      : '—'}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {analyzingSet.has(item.id) ? (
                      <LoadingSpinner size={14} />
                    ) : item.signal ? (
                      <SignalBadge signal={item.signal} />
                    ) : (
                      <button onClick={() => analyzeItem(item)} style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'Syne, sans-serif', cursor: 'pointer' }}>Analyze</button>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div className="flex gap-1">
                      <button onClick={() => addToPortfolio(item)} title="Add to Portfolio" style={{ color: 'var(--accent)', padding: 4 }}><IconArrowRight size={14} /></button>
                      <button onClick={() => remove(item.id)} style={{ color: 'var(--text2)', padding: 4 }}><IconTrash size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={screenshotOpen} onClose={() => setScreenshotOpen(false)} title="Import from Screenshot">
        <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>Upload a screenshot of any watchlist or stock list — AI will extract the tickers.</p>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '32px 16px', borderRadius: 8, cursor: importing ? 'not-allowed' : 'pointer', border: '2px dashed var(--border)', background: 'var(--surface2)', color: 'var(--text2)', fontSize: 13 }}>
          <IconCamera size={24} style={{ color: 'var(--accent)' }} />
          {importing ? <span>Analysing image...</span> : <span>Click to choose a screenshot (PNG, JPG)</span>}
          <input type="file" accept="image/*" style={{ display: 'none' }} disabled={importing}
            onChange={e => { const f = e.target.files?.[0]; if (f) importScreenshot(f) }}
          />
        </label>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add to Watchlist">
        <form onSubmit={add} className="space-y-4">
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Ticker</label>
            <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" required
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Market</label>
            <select value={market} onChange={e => setMarket(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}
            >
              <option>US</option><option>ASX</option><option>NZX</option>
            </select>
          </div>
          <button type="submit" style={{ width: '100%', background: 'var(--accent)', color: 'white', padding: '10px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            Add to Watchlist
          </button>
        </form>
      </Modal>
    </div>
  )
}
