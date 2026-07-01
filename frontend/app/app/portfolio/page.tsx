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
          <Link href="/app/settings" style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}
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
        <Link href="/app/settings" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Settings</Link>.
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
  const [username, setUsername] = useState('')
  const [form, setForm] = useState({ ticker: '', shares: '', buy_price: '', market: 'US' })
  const [csvText, setCsvText] = useState('')
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const supabase = createClient()

  const userIdRef = useCallback((uid: string) => {
    setUserId(uid)
  }, [])

  async function loadProfile(uid: string) {
    const { data: profile } = await supabase.from('profiles').select('risk_level, broker, username').eq('id', uid).single()
    if (profile?.risk_level != null) setRiskLevel(profile.risk_level)
    if (profile?.broker) setBroker(getBrokerById(profile.broker) ?? null)
    if (profile?.username) setUsername(profile.username)
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const uid = data.user.id
      setUserId(uid)
      await loadProfile(uid)
      loadHoldings(uid)
      api.getPremiumStatus().then(s => {
        setIsPremium(s.tier === 'premium')
        setBadges(s.badges || [])
        setVerification(s.verification)
      }).catch(() => {})
      api.getAiUsage().then(setAiUsage).catch(() => {})
    })
  }, [])

  // Re-read profile when user returns from Settings (e.g. changed risk level)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && userId) {
        loadProfile(userId)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [userId])

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

  async function syncCSV() {
    if (!csvText.trim() || !userId) return
    setSyncing(true)
    try {
      const result = await api.syncCSV(csvText)
      setSyncOpen(false)
      setCsvText('')
      const parts = []
      if (result.added?.length) parts.push(`${result.added.length} added`)
      if (result.updated?.length) parts.push(`${result.updated.length} updated`)
      if (result.removed?.length) parts.push(`${result.removed.length} removed`)
      toast.success(`Portfolio synced — ${parts.join(', ') || 'no changes'}`)
      loadHoldings(userId)
    } catch (e: any) {
      toast.error('Sync failed: ' + e.message)
    }
    setSyncing(false)
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

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const displayName = username || 'there'
  const todayStr = new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // Ring chart: outer = all-time gain progress (0–100% mapped to 0–100% arc), capped at 100%
  const R = 68
  const CIRC = 2 * Math.PI * R
  const gainProgress = totalCost > 0 ? Math.min(1, Math.max(0, totalPLPct / 100)) : 0
  const dashOffset = CIRC * (1 - gainProgress)

  return (
    <div style={{ padding: 28 }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 22, marginBottom: 2 }}>{greeting}, {displayName} 👋</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>{todayStr}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={refreshPrices} disabled={refreshing} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600, cursor: 'pointer', boxShadow: 'var(--sh)' }}>
            {refreshing ? <LoadingSpinner size={13} /> : <IconRefresh size={13} />} Refresh
          </button>
          <button onClick={() => { setCsvText(''); setSyncOpen(true) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600, cursor: 'pointer', boxShadow: 'var(--sh)' }}>
            <IconUpload size={13} /> Sync CSV
          </button>
          {isPremium && (
            <button onClick={() => setVerifyOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: verification?.status === 'verified' ? 'var(--green-light)' : 'var(--surface)', border: `1px solid ${verification?.status === 'verified' ? 'var(--green)' : 'var(--border)'}`, color: verification?.status === 'verified' ? 'var(--green)' : 'var(--text)', boxShadow: 'var(--sh)' }}>
              <IconShieldCheck size={13} /> {verification?.status === 'verified' ? 'Verified' : 'Verify'}
            </button>
          )}
          <button onClick={analyzeAll} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, background: 'var(--primary-light)', border: '1px solid var(--primary)', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <IconBrain size={13} /> Analyse all
          </button>
          <button onClick={() => setAddOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none' }}>
            <IconPlus size={13} /> Add stock
          </button>
        </div>
      </div>

      {/* Summary card with ring chart */}
      {!loading && totalValue > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: 28 }}>
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr]" style={{ gap: 32, alignItems: 'flex-start' }}>
            {/* Ring chart */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', width: 170, height: 170 }}>
                <svg width="170" height="170" viewBox="0 0 170 170" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="85" cy="85" r={R} fill="none" stroke="var(--surface2)" strokeWidth="9" />
                  <circle
                    cx="85" cy="85" r={R} fill="none"
                    stroke="var(--primary)" strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={dashOffset}
                    style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)' }}
                  />
                  <circle cx="85" cy="85" r="54" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray="339" strokeDashoffset="325" opacity=".45" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Portfolio</p>
                  <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 22, fontWeight: 500, color: 'var(--text)', lineHeight: 1.1 }}>{fmtCurrency(totalValue)}</p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: totalPL >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 3 }}>{totalPL >= 0 ? '+' : ''}{totalPLPct.toFixed(2)}% all time</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>Gain</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', opacity: .6 }} />
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>Today</span>
                </div>
              </div>
            </div>

            {/* Metrics + goal */}
            <div>
              <div className="grid grid-cols-2 md:grid-cols-3" style={{ gap: 12, marginBottom: 16 }}>
                <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Total gain</p>
                  <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 20, fontWeight: 500, color: totalPL >= 0 ? 'var(--green)' : 'var(--red)' }}>{totalPL >= 0 ? '+' : ''}{fmtCurrency(totalPL)}</p>
                  <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>since you started</p>
                </div>
                <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Holdings</p>
                  <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 20, fontWeight: 500 }}>{holdings.length}</p>
                  <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{signals} with AI signals</p>
                </div>
                <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>AI usage</p>
                  {aiUsage?.unlimited ? (
                    <>
                      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 20, fontWeight: 500, color: 'var(--primary)' }}>∞</p>
                      <span style={{ background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', color: '#7a3f00', fontSize: 9, padding: '2px 6px', borderRadius: 20, fontWeight: 700 }}>✦ Unlimited</span>
                    </>
                  ) : (
                    <>
                      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 20, fontWeight: 500 }}>{aiUsage?.used || 0}<span style={{ fontSize: 12, color: 'var(--text3)' }}>/{aiUsage?.limit || 10}</span></p>
                      <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'var(--primary)', borderRadius: 2, width: `${Math.min(100, ((aiUsage?.used || 0) / (aiUsage?.limit || 10)) * 100)}%` }} />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Risk bar */}
              <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 16, marginBottom: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <IconShield size={14} style={{ color: RISK_COLOR(riskLevel) }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Risk Tolerance</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 12, color: RISK_COLOR(riskLevel) }}>{RISK_LABELS[riskLevel]} · {riskLevel}/10</span>
                    <Link href="/app/settings" style={{ fontSize: 10, color: 'var(--text2)', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 7px' }}>Edit</Link>
                  </div>
                </div>
                <div style={{ position: 'relative', height: 5, background: 'var(--surface3)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 4, width: `${((riskLevel - 1) / 9) * 100}%`, background: RISK_COLOR(riskLevel) }} />
                </div>
              </div>

              <PortfolioGoal currentValue={totalValue} userId={userId} />
            </div>
          </div>
        </div>
      )}

      {!loading && !isPremium && holdings.length >= 8 && holdings.length < 10 && (
        <div style={{ marginBottom: 16, padding: '8px 14px', borderRadius: 8, background: 'var(--amber-light)', border: '1px solid var(--amber)', fontSize: 12, color: 'var(--amber)' }}>
          {10 - holdings.length} holding slot{10 - holdings.length !== 1 ? 's' : ''} left on the free plan.{' '}
          <Link href="/app/settings" style={{ color: 'var(--amber)', fontWeight: 700, textDecoration: 'underline' }}>Upgrade to Premium</Link> for unlimited.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><LoadingSpinner size={32} /></div>
      ) : holdings.length === 0 ? (
        <div className="card text-center" style={{ padding: '48px 24px' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📊</p>
          <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No holdings yet</p>
          <p style={{ color: 'var(--text2)', marginBottom: 24 }}>Add stocks manually or import from your broker</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setAddOpen(true)} style={{ background: 'var(--primary)', color: 'white', padding: '10px 20px', borderRadius: 10, fontWeight: 700, border: 'none', cursor: 'pointer' }}>Add Stock</button>
            <button onClick={() => setImportOpen(true)} style={{ background: 'var(--surface2)', color: 'var(--text)', padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', fontWeight: 600, cursor: 'pointer' }}>Import CSV</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }} className="xl:grid-cols-[1fr_300px] grid-cols-1">
          <div className="space-y-4">
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '20px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 1 }}>Holdings</p>
                  <p style={{ fontSize: 12, color: 'var(--text2)' }}>Click Analyse to get AI signals</p>
                </div>
                <button onClick={() => setImportOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'none', border: '1px solid var(--border)', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: 'var(--text2)' }}>
                  <IconUpload size={12} /> Import
                </button>
              </div>
              <HoldingsTable holdings={holdings} analyzingSet={analyzingSet} onDelete={deleteHolding} onAnalyze={analyzeHolding} broker={broker} />
            </div>
            {holdings.length > 1 && <PLChart holdings={holdings} />}
            {badges.length > 0 && <BadgesDisplay badges={badges} />}
          </div>
          <div>
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
          <button type="submit" style={{ width: '100%', background: 'var(--primary)', color: 'white', padding: '10px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
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

      {/* Sync Modal */}
      <Modal open={syncOpen} onClose={() => { setSyncOpen(false); setCsvText('') }} title="Sync from CSV" wide>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 4 }}>
          Upload your latest broker CSV to keep Fennec in sync. This will:
        </p>
        <ul style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Update share counts and prices for existing holdings</li>
          <li>Add any new positions you have opened</li>
          <li>Remove positions you have sold</li>
        </ul>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '32px 16px', borderRadius: 8, cursor: 'pointer', border: '2px dashed var(--border)', background: 'var(--surface2)', color: 'var(--text2)', fontSize: 13 }}>
          <IconUpload size={24} style={{ color: 'var(--primary)' }} />
          {csvText ? <span style={{ color: 'var(--text)', fontWeight: 600 }}>CSV loaded — ready to sync</span> : <span>Click to choose a CSV file (Hatch, Sharesies, IBKR)</span>}
          <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = ev => setCsvText(ev.target?.result as string)
            reader.readAsText(file)
          }} />
        </label>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button onClick={syncCSV} disabled={!csvText || syncing} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--primary)', color: 'white', padding: '10px 20px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600, border: 'none', cursor: csvText && !syncing ? 'pointer' : 'not-allowed', opacity: csvText && !syncing ? 1 : 0.5 }}>
            {syncing ? <><LoadingSpinner size={13} /> Syncing…</> : <><IconUpload size={13} /> Sync Portfolio</>}
          </button>
          <button onClick={() => { setSyncOpen(false); setCsvText('') }} style={{ background: 'var(--surface2)', color: 'var(--text)', padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
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
          <IconUpload size={24} style={{ color: 'var(--primary)' }} />
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
          <button onClick={importCSV} disabled={!csvText} style={{ background: 'var(--primary)', color: 'white', padding: '10px 20px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600, opacity: csvText ? 1 : 0.5 }}>
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
