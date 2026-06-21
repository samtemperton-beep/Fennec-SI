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
import { IconRefresh, IconBrain, IconPlus, IconUpload, IconShield, IconShieldCheck, IconExternalLink } from '@tabler/icons-react'
import { getBrokerById, getBrokerTradeUrl, type Broker } from '@/lib/brokers'
import Link from 'next/link'
import { PortfolioGoal } from '@/components/portfolio/PortfolioGoal'
import { BadgesDisplay } from '@/components/premium/BadgesDisplay'
import { VerifyPortfolioModal } from '@/components/premium/VerifyPortfolioModal'
import { PremiumBadge } from '@/components/premium/PremiumBadge'
import { toast } from 'sonner'

const RISK_LABELS = ['', 'Very Conservative', 'Conservative', 'Moderate-Conservative', 'Moderate', 'Moderate', 'Moderate-Aggressive', 'Aggressive', 'Aggressive', 'Very Aggressive', 'Maximum Risk']
const RISK_COLOR = (r: number) => r <= 3 ? 'var(--green)' : r <= 6 ? 'var(--amber)' : 'var(--red)'

function RiskCard({ riskLevel }: { riskLevel: number }) {
  const pct = ((riskLevel - 1) / 9) * 100
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <IconShield size={15} style={{ color: RISK_COLOR(riskLevel) }} />
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14 }}>Risk Tolerance</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 13, color: RISK_COLOR(riskLevel) }}>
            {RISK_LABELS[riskLevel]} ({riskLevel}/10)
          </span>
          <Link href="/settings" style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}
            onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text)'}
            onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text2)'}
          >
            Edit
          </Link>
        </div>
      </div>
      <div style={{ position: 'relative', height: 6, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 4,
          width: `${pct}%`,
          background: `linear-gradient(to right, var(--green), var(--amber) 50%, var(--red))`,
          backgroundSize: '200% 100%',
          backgroundPosition: `${pct}% 0`,
        }} />
      </div>
      <div className="flex justify-between mt-1">
        <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'Syne, sans-serif' }}>Conservative</span>
        <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'Syne, sans-serif' }}>Aggressive</span>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8 }}>
        AI signals are calibrated to your risk profile. Change in{' '}
        <Link href="/settings" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Settings</Link>.
      </p>
    </div>
  )
}

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [analyzingSet, setAnalyzingSet] = useState(new Set<number>())
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [riskLevel, setRiskLevel] = useState(5)
  const [isPremium, setIsPremium] = useState(false)
  const [badges, setBadges] = useState<any[]>([])
  const [verification, setVerification] = useState<any>(null)
  const [aiUsage, setAiUsage] = useState<{ used: number; limit: number; unlimited?: boolean } | null>(null)
  const [broker, setBroker] = useState<Broker | null>(null)
  const [form, setForm] = useState({ ticker: '', shares: '', buy_price: '', market: 'US' })
  const [csvText, setCsvText] = useState('')
  const supabase = createClient()

  useEffect(() => {
    const DEV_USER_ID = '851a4abb-27f2-4c32-9fb3-28ef4c22af49'
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? DEV_USER_ID
      setUserId(uid)
      const { data: profile } = await supabase.from('profiles').select('risk_level, broker').eq('id', uid).single()
      if (profile?.risk_level) setRiskLevel(profile.risk_level)
      if (profile?.broker) setBroker(getBrokerById(profile.broker) ?? null)
      loadHoldings(uid)
      api.getPremiumStatus().then(s => {
        setIsPremium(s.tier === 'premium')
        setBadges(s.badges || [])
        setVerification(s.verification)
      }).catch(() => {})
      api.getAiUsage().then(setAiUsage).catch(() => {})
    })
  }, [])

  async function loadHoldings(uid: string) {
    setLoading(true)
    const { data } = await supabase.from('holdings').select('*').eq('user_id', uid).order('added_at', { ascending: false })
    const rows = data || []
    setHoldings(rows)
    setLoading(false)
    // Enrich with live prices + company names in background
    if (rows.length) {
      try {
        const tickers = [...new Set(rows.map((h: any) => h.ticker as string))]
        const priceData = await api.getPrices(tickers)
        setHoldings(rows.map((h: any) => ({
          ...h,
          current_price: priceData[h.ticker]?.price ?? h.current_price,
          name: priceData[h.ticker]?.name ?? h.name,
        })))
      } catch {}
    }
  }

  async function refreshPrices() {
    if (!holdings.length) return
    setRefreshing(true)
    try {
      const tickers = [...new Set(holdings.map(h => h.ticker))]
      const data = await api.getPrices(tickers)
      const updates = holdings.map(h => ({
        ...h,
        current_price: data[h.ticker]?.price ?? h.current_price,
        name: data[h.ticker]?.name ?? h.name,
      }))
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
      const result = await api.analyzeStock(h.ticker, { price: h.current_price, buyPrice: h.buy_price, sector: h.sector }, riskLevel)
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
    if (!isPremium && holdings.length >= 10) {
      toast.error('Free plan limit: 10 holdings. Upgrade to Premium for unlimited.')
      return
    }
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
    if (!isPremium && holdings.length >= 10) {
      toast.error('Free plan limit: 10 holdings. Upgrade to Premium for unlimited.')
      return
    }
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
  ]

  const portfolio = holdings.map(h => h.ticker)

  return (
    <div style={{ padding: '24px' }}>
      {/* Header with Verify + Import on right */}
      <div className="flex items-center justify-between mb-6">
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Portfolio</h1>
        <div className="flex items-center gap-2">
          {isPremium && (
            <button onClick={() => setVerifyOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: verification?.status === 'verified' ? 'rgba(16,185,129,0.12)' : 'rgba(251,191,36,0.12)', border: `1px solid ${verification?.status === 'verified' ? 'rgba(16,185,129,0.3)' : 'rgba(251,191,36,0.3)'}`, color: verification?.status === 'verified' ? 'var(--green)' : '#f59e0b', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
              <IconShieldCheck size={14} /> {verification?.status === 'verified' ? 'Verified' : 'Verify'}
            </button>
          )}
          {broker && (
            <a
              href={broker.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: 'var(--green)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textDecoration: 'none' }}
            >
              {broker.flag} {broker.name} <IconExternalLink size={13} />
            </a>
          )}
          <button onClick={() => setImportOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            <IconUpload size={14} /> Import
          </button>
        </div>
      </div>

      <StatsBar stats={stats} />

      {/* Free tier usage bar */}
      {aiUsage && !aiUsage.unlimited && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="flex items-center justify-between mb-1">
              <span style={{ fontSize: 12, fontFamily: 'Syne, sans-serif', color: 'var(--text2)' }}>Daily AI calls</span>
              <span style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: aiUsage.used >= aiUsage.limit ? 'var(--red)' : 'var(--text)' }}>
                {aiUsage.used} / {aiUsage.limit}
              </span>
            </div>
            <div style={{ height: 4, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, width: `${Math.min(100, (aiUsage.used / aiUsage.limit) * 100)}%`, background: aiUsage.used >= aiUsage.limit ? 'var(--red)' : aiUsage.used >= aiUsage.limit * 0.8 ? 'var(--amber)' : 'var(--accent)' }} />
            </div>
          </div>
          <Link href="/settings" style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 600, color: '#f59e0b', textDecoration: 'none', whiteSpace: 'nowrap', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, padding: '4px 10px' }}>
            ✦ Upgrade
          </Link>
        </div>
      )}

      {!loading && !isPremium && holdings.length >= 8 && holdings.length < 10 && (
        <div style={{ marginTop: 8, padding: '8px 14px', borderRadius: 8, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', fontSize: 12, color: '#f59e0b', fontFamily: 'Syne, sans-serif' }}>
          You have {10 - holdings.length} holding slot{10 - holdings.length !== 1 ? 's' : ''} left on the free plan.{' '}
          <Link href="/settings" style={{ color: '#f59e0b', fontWeight: 700, textDecoration: 'underline' }}>Upgrade to Premium</Link> for unlimited.
        </div>
      )}

      {/* Risk tolerance — below stats, above goal */}
      {!loading && holdings.length > 0 && (
        <div style={{ marginTop: 16 }}><RiskCard riskLevel={riskLevel} /></div>
      )}

      {!loading && totalValue > 0 && (
        <div style={{ marginTop: 16 }}>
          <PortfolioGoal currentValue={totalValue} userId={userId} />
        </div>
      )}

      {/* Action buttons — below portfolio goal */}
      {!loading && holdings.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap mt-4">
          <button onClick={refreshPrices} disabled={refreshing} className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>
            {refreshing ? <LoadingSpinner size={14} /> : <IconRefresh size={14} />} Refresh Prices
          </button>
          <button onClick={analyzeAll} className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: 'rgba(91,106,255,0.18)', border: '1px solid rgba(91,106,255,0.4)', color: 'var(--accent2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>
            <IconBrain size={15} /> Analyze All
          </button>
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg ml-auto" style={{ background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>
            <IconPlus size={15} /> Add Stock
          </button>
        </div>
      )}

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
              <HoldingsTable holdings={holdings} analyzingSet={analyzingSet} onDelete={deleteHolding} onAnalyze={analyzeHolding} broker={broker} />
            </div>
            {holdings.length > 1 && <PLChart holdings={holdings} />}
            {badges.length > 0 && <BadgesDisplay badges={badges} />}
          </div>
          <div style={{ position: 'sticky', top: 24, alignSelf: 'start' }}>
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

      <VerifyPortfolioModal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        onVerified={(tickers) => {
          setVerification({ status: 'verified', verified_tickers: tickers })
          api.getPremiumStatus().then(s => setBadges(s.badges || [])).catch(() => {})
          toast.success(`${tickers.length} holding${tickers.length !== 1 ? 's' : ''} verified!`)
        }}
      />

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
