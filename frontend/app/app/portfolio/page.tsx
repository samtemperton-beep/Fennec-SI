'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { HoldingsTable, type Holding } from '@/components/portfolio/HoldingsTable'
import { PLChart } from '@/components/portfolio/PLChart'
import { AIAdvisor } from '@/components/portfolio/AIAdvisor'
import { StatsBar } from '@/components/shared/StatsBar'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { fmtCurrency } from '@/lib/utils'
import { IconRefresh, IconBrain, IconPlus, IconUpload } from '@tabler/icons-react'
import { toast } from 'sonner'

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [analyzingSet, setAnalyzingSet] = useState(new Set<number>())
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState({ ticker: '', shares: '', buy_price: '', market: 'US' })
  const [csvText, setCsvText] = useState('')
  const supabase = createClient()

  useEffect(() => {
    const DEV_USER_ID = '851a4abb-27f2-4c32-9fb3-28ef4c22af49'
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? DEV_USER_ID
      setUserId(uid)
      loadHoldings(uid)
    })
  }, [])

  async function loadHoldings(uid: string) {
    setLoading(true)
    const { data } = await supabase.from('holdings').select('*').eq('user_id', uid).order('added_at', { ascending: false })
    setHoldings(data || [])
    setLoading(false)
  }

  async function refreshPrices() {
    if (!holdings.length) return
    setRefreshing(true)
    try {
      const tickers = [...new Set(holdings.map(h => h.ticker))]
      const prices = await api.getPrices(tickers)
      const updates = holdings.map(h => ({ ...h, current_price: prices[h.ticker] ?? h.current_price }))
      setHoldings(updates)
      for (const h of updates) {
        await supabase.from('holdings').update({ current_price: h.current_price }).eq('id', h.id)
      }
      toast.success('Prices updated')
    } catch (e: any) {
      toast.error('Failed to refresh: ' + e.message)
    }
    setRefreshing(false)
  }

  async function analyzeHolding(h: Holding) {
    setAnalyzingSet(s => new Set(s).add(h.id))
    try {
      const result = await api.analyzeStock(h.ticker, { price: h.current_price, buyPrice: h.buy_price, sector: h.sector })
      await supabase.from('holdings').update({ signal: result.signal, signal_reason: result.reason }).eq('id', h.id)
      setHoldings(prev => prev.map(p => p.id === h.id ? { ...p, signal: result.signal, signal_reason: result.reason } : p))
    } catch (e: any) {
      toast.error(`Analysis failed for ${h.ticker}`)
    }
    setAnalyzingSet(s => { const n = new Set(s); n.delete(h.id); return n })
  }

  async function analyzeAll() {
    for (let i = 0; i < holdings.length; i++) {
      await analyzeHolding(holdings[i])
      if (i < holdings.length - 1) await new Promise(r => setTimeout(r, 1500))
    }
    toast.success('All analyzed')
  }

  async function deleteHolding(id: number) {
    await supabase.from('holdings').delete().eq('id', id)
    setHoldings(prev => prev.filter(h => h.id !== id))
    toast.success('Holding removed')
  }

  async function addHolding(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    const { data, error } = await supabase.from('holdings').insert({
      user_id: userId,
      ticker: form.ticker.toUpperCase(),
      shares: parseFloat(form.shares),
      buy_price: parseFloat(form.buy_price),
      market: form.market,
      current_price: parseFloat(form.buy_price),
    }).select().single()
    if (error) return toast.error(error.message)
    setHoldings(prev => [data, ...prev])
    setAddOpen(false)
    setForm({ ticker: '', shares: '', buy_price: '', market: 'US' })
    toast.success(`${form.ticker.toUpperCase()} added`)
  }

  async function importCSV() {
    if (!csvText.trim() || !userId) return
    try {
      const { holdings: imported } = await api.importCSV(csvText)
      for (const h of imported) {
        const { data } = await supabase.from('holdings').insert({
          user_id: userId, ticker: h.ticker, shares: h.shares,
          buy_price: h.buyPrice, current_price: h.buyPrice, market: h.market,
        }).select().single()
        if (data) setHoldings(prev => [data, ...prev])
      }
      setImportOpen(false)
      toast.success(`Imported ${imported.length} holdings`)
    } catch (e: any) {
      toast.error('Import failed: ' + e.message)
    }
  }

  const totalValue = holdings.reduce((s, h) => s + h.current_price * h.shares, 0)
  const totalCost = holdings.reduce((s, h) => s + h.buy_price * h.shares, 0)
  const totalPL = totalValue - totalCost
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0
  const signals = holdings.filter(h => h.signal).length

  const stats = [
    { label: 'Portfolio Value', value: totalValue, type: 'currency' as const },
    { label: 'Total P&L', value: totalPL, type: 'currency' as const, positive: totalPL >= 0 },
    { label: 'P&L %', value: totalPLPct, type: 'pct' as const, positive: totalPLPct >= 0 },
    { label: 'Holdings', value: holdings.length, type: 'number' as const },
    { label: 'AI Signals', value: signals, type: 'number' as const },
  ]

  const portfolio = holdings.map(h => h.ticker)

  return (
    <div style={{ padding: '24px' }}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Portfolio</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={refreshPrices} disabled={refreshing} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            {refreshing ? <LoadingSpinner size={14} /> : <IconRefresh size={14} />} Refresh
          </button>
          <button onClick={analyzeAll} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(91,106,255,0.15)', border: '1px solid rgba(91,106,255,0.3)', color: 'var(--accent2)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            <IconBrain size={14} /> Analyze All
          </button>
          <button onClick={() => setImportOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            <IconUpload size={14} /> Import
          </button>
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            <IconPlus size={14} /> Add Stock
          </button>
        </div>
      </div>

      <StatsBar stats={stats} />

      {loading ? (
        <div className="flex items-center justify-center py-20"><LoadingSpinner size={32} /></div>
      ) : holdings.length === 0 ? (
        <div className="card text-center py-16">
          <IconBrain size={40} style={{ color: 'var(--text2)', margin: '0 auto 12px' }} />
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 18, marginBottom: 8 }}>No holdings yet</p>
          <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Add stocks manually or import from your broker</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setAddOpen(true)} style={{ background: 'var(--accent)', color: 'white', padding: '10px 20px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>Add Stock</button>
            <button onClick={() => setImportOpen(true)} style={{ background: 'var(--surface2)', color: 'var(--text)', padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>Import CSV</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: holdings.length ? '1fr 320px' : '1fr', gap: 20 }} className="xl:grid-cols-[1fr_320px] grid-cols-1">
          <div className="space-y-4">
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <HoldingsTable holdings={holdings} analyzingSet={analyzingSet} onDelete={deleteHolding} onAnalyze={analyzeHolding} />
            </div>
            {holdings.length > 1 && <PLChart holdings={holdings} />}
          </div>
          <div style={{ height: 600 }}>
            <AIAdvisor portfolio={portfolio} />
          </div>
        </div>
      )}

      {/* Add Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Stock">
        <form onSubmit={addHolding} className="space-y-4">
          {[
            { label: 'Ticker', key: 'ticker', placeholder: 'AAPL' },
            { label: 'Shares', key: 'shares', placeholder: '10', type: 'number' },
            { label: 'Buy Price', key: 'buy_price', placeholder: '150.00', type: 'number' },
          ].map(f => (
            <div key={f.key}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>{f.label}</label>
              <input
                type={f.type || 'text'}
                placeholder={f.placeholder}
                value={(form as any)[f.key]}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                required
                step={f.type === 'number' ? 'any' : undefined}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
              />
            </div>
          ))}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Market</label>
            <select value={form.market} onChange={e => setForm(p => ({ ...p, market: e.target.value }))} style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}>
              <option>US</option><option>ASX</option><option>NZX</option>
            </select>
          </div>
          <button type="submit" style={{ width: '100%', background: 'var(--accent)', color: 'white', padding: '10px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            Add to Portfolio
          </button>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import Portfolio" wide>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>Upload a CSV from Hatch, Sharesies, or IBKR — we auto-detect the format.</p>
        <label
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: '32px 16px', borderRadius: 8, cursor: 'pointer',
            border: '2px dashed var(--border)', background: 'var(--surface2)',
            color: 'var(--text2)', fontSize: 13,
          }}
        >
          <IconUpload size={24} style={{ color: 'var(--accent)' }} />
          {csvText ? <span style={{ color: 'var(--text)' }}>File loaded — ready to import</span> : <span>Click to choose a CSV file</span>}
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = ev => setCsvText(ev.target?.result as string)
              reader.readAsText(file)
            }}
          />
        </label>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button onClick={importCSV} disabled={!csvText} style={{ background: 'var(--accent)', color: 'white', padding: '10px 20px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600, opacity: csvText ? 1 : 0.5 }}>
            Import
          </button>
          <button onClick={() => { setImportOpen(false); setCsvText('') }} style={{ background: 'var(--surface2)', color: 'var(--text)', padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  )
}
