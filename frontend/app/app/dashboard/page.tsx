'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { IconLayoutGrid } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'
import { localDate } from '@/lib/utils'
import { householdCashFlow, type CashFlow } from '@/lib/spending'
import { api, type NetWorthResponse } from '@/lib/api'
import { gatherInsights, netWorthTrendInsights, sortInsights, type Insight } from '@/lib/insights'
import { NetWorthCard, totalOf, type NetWorthPart } from '@/components/dashboard/NetWorthCard'
import { InsightsFeed } from '@/components/dashboard/InsightsFeed'
import { CashFlowCard } from '@/components/dashboard/CashFlowCard'
import { DailySummaryCard } from '@/components/dashboard/DailySummaryCard'
import { GoalsCard } from '@/components/dashboard/GoalsCard'
import { QuickLinksCard } from '@/components/dashboard/QuickLinksCard'
import { LayoutEditor } from '@/components/dashboard/LayoutEditor'
import { CARD_INFO, DEFAULT_LAYOUT, normaliseLayout, type CardId, type LayoutItem } from '@/components/dashboard/layout'

export default function DashboardPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [netWorth, setNetWorth] = useState<NetWorthResponse | null>(null)
  const [netWorthError, setNetWorthError] = useState<string | null>(null)
  const [excluded, setExcluded] = useState<NetWorthPart[]>([])
  const [cashThisMonth, setCashThisMonth] = useState<CashFlow | null>(null)
  const [cashLastMonth, setCashLastMonth] = useState<CashFlow | null>(null)
  const [goals, setGoals] = useState<any[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [insightsLoading, setInsightsLoading] = useState(true)

  const [summary, setSummary] = useState<{ text: string; at: string } | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryRefreshing, setSummaryRefreshing] = useState(false)
  const summaryRequested = useRef(false)

  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT)
  const [editingLayout, setEditingLayout] = useState(false)

  const now = new Date()
  const monthLabel = now.toLocaleDateString('en-NZ', { month: 'long' })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)

      // Optional preference columns are read on their own, so the dashboard still
      // loads if a migration hasn't been run yet.
      supabase.from('profiles').select('networth_excluded').eq('id', user.id).single()
        .then(({ data }) => { if (Array.isArray(data?.networth_excluded)) setExcluded(data.networth_excluded) })
      supabase.from('profiles').select('dashboard_layout').eq('id', user.id).single()
        .then(({ data }) => { if (data?.dashboard_layout) setLayout(normaliseLayout(data.dashboard_layout)) })

      const today = localDate()
      const monthStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1))
      // Last month up to the same day, capped at last month's final day.
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastEnd = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate()))

      // fin_goals and the cash-flow tables are household-scoped by RLS (goals have no
      // user_id column), so they're read the same way the Finance pages read them.
      const [{ data: p }, cashNow, cashPrev, { data: g }, nw] = await Promise.all([
        supabase.from('profiles').select('username, enabled_features').eq('id', user.id).single(),
        householdCashFlow(supabase, monthStart, today),
        householdCashFlow(supabase, localDate(lastStart), localDate(lastEnd)),
        supabase.from('fin_goals').select('id, name, target_amount, current_amount').eq('status', 'active').order('created_at').limit(3),
        api.getNetWorth().catch((e: Error) => { setNetWorthError(e.message); return null }),
      ])

      setProfile(p)
      setNetWorth(nw)
      setCashThisMonth(cashNow)
      setCashLastMonth(cashPrev)
      setGoals(g ?? [])
      setLoading(false)

      // Notifications load after the headline numbers so they never hold the page up.
      gatherInsights({ supabase, userId: user.id, netWorth: nw, enabledFeatures: p?.enabled_features ?? null })
        .then(setInsights)
        .catch(() => setInsights([]))
        .finally(() => setInsightsLoading(false))
    }
    load()
  }, [])

  // Computed client-side only to avoid SSR/client mismatch
  const [greeting, setGreeting] = useState('')
  const [dateLabel, setDateLabel] = useState('')
  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
    setDateLabel(new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' }))
  }, [])

  // The net worth trend item follows the include/exclude toggles, so it's derived here.
  const allInsights = useMemo(() => {
    const history = (netWorth?.history ?? []).map(p => ({ date: p.date, total: totalOf(p, excluded) }))
    return sortInsights([...insights, ...netWorthTrendInsights(history)])
  }, [insights, netWorth, excluded])

  // ── Daily briefing ──
  function summaryFacts() {
    const c = netWorth?.current
    return {
      date: localDate(),
      name: profile?.username ?? null,
      netWorth: c ? {
        total: Math.round(totalOf(c, excluded)),
        excludedFromTotal: excluded,
        parts: { bank: c.bank, investments: c.investments, kiwisaver: c.kiwisaver, property: c.property, homeLoan: c.debt },
      } : null,
      cashFlowThisMonth: cashThisMonth ? {
        month: monthLabel,
        moneyIn: cashThisMonth.income,
        moneyOut: cashThisMonth.spending,
        moneyOutSameTimeLastMonth: cashLastMonth?.spending ?? null,
      } : null,
      goals: goals.map(g => ({ name: g.name, saved: Number(g.current_amount), target: Number(g.target_amount) })),
      notifications: allInsights.slice(0, 12).map(i => ({ severity: i.severity, area: i.section, title: i.title, detail: i.detail ?? null })),
    }
  }

  async function loadSummary(refresh: boolean) {
    if (refresh) setSummaryRefreshing(true)
    setSummaryError(null)
    try {
      const r = await api.getDailySummary(summaryFacts(), localDate(), refresh)
      setSummary({ text: r.summary, at: r.generatedAt })
    } catch (e: any) {
      setSummaryError(e.message?.includes('limit') ? e.message : 'Fennec couldn’t write today’s briefing just now. Try Refresh in a moment.')
    } finally {
      setSummaryLoading(false)
      setSummaryRefreshing(false)
    }
  }

  const summaryVisible = layout.some(l => l.id === 'summary' && !l.hidden)
  useEffect(() => {
    // Wait until everything the briefing describes has loaded, then ask once.
    if (loading || insightsLoading || !summaryVisible || summaryRequested.current) return
    summaryRequested.current = true
    loadSummary(false)
  }, [loading, insightsLoading, summaryVisible])

  // ── Preferences ──
  async function toggleNetWorthPart(part: NetWorthPart) {
    const next = excluded.includes(part) ? excluded.filter(p => p !== part) : [...excluded, part]
    setExcluded(next)
    if (!userId) return
    const { error } = await supabase.from('profiles').update({ networth_excluded: next }).eq('id', userId)
    if (error) toast.error(`Couldn't save that preference: ${error.message}`)
  }

  async function changeLayout(next: LayoutItem[]) {
    setLayout(next)
    if (!userId) return
    const { error } = await supabase.from('profiles').update({ dashboard_layout: next }).eq('id', userId)
    if (error) toast.error(`Couldn't save your layout: ${error.message}`)
  }

  const noData = !loading && netWorth?.current && !netWorth.current.hasData
  const enabledFeatures: string[] | null = profile?.enabled_features ?? null

  function renderCard(id: CardId) {
    switch (id) {
      case 'summary':
        return (
          <DailySummaryCard
            summary={summary?.text ?? null}
            generatedAt={summary?.at ?? null}
            loading={summaryLoading && !summaryError}
            error={summaryError}
            onRefresh={() => loadSummary(true)}
            refreshing={summaryRefreshing}
          />
        )
      case 'networth':
        return (
          <>
            <NetWorthCard data={netWorth} loading={loading} error={netWorthError} excluded={excluded} onToggle={toggleNetWorthPart} />
            {noData && (
              <div className="dash-card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Connect your bank and investments to see your full net worth.</span>
                <Link href="/app/settings" style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>Connect Akahu →</Link>
              </div>
            )}
          </>
        )
      case 'insights':
        return <InsightsFeed insights={allInsights} loading={loading || insightsLoading} />
      case 'cashflow':
        return <CashFlowCard thisMonth={cashThisMonth} lastMonth={cashLastMonth} monthLabel={monthLabel} loading={loading} />
      case 'goals':
        return <GoalsCard goals={goals} loading={loading} />
      case 'quicklinks':
        return <QuickLinksCard enabledFeatures={enabledFeatures} />
    }
  }

  return (
    <div className="dash-page">
      <div className="dash-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, sans-serif', color: 'var(--text)', margin: 0 }}>
            {greeting}{profile?.username ? `, ${profile.username}` : ''}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{dateLabel}</p>
        </div>
        {!editingLayout && (
          <button className="dash-customise" onClick={() => setEditingLayout(true)}>
            <IconLayoutGrid size={14} /> Customise
          </button>
        )}
      </div>

      {editingLayout ? (
        <LayoutEditor layout={layout} onChange={changeLayout} onDone={() => setEditingLayout(false)} />
      ) : (
        <div className="dash-grid">
          {layout.filter(l => !l.hidden).map(l => (
            <div key={l.id} className={CARD_INFO[l.id].half ? 'dash-cell half' : 'dash-cell'}>
              {renderCard(l.id)}
            </div>
          ))}
          {layout.every(l => l.hidden) && (
            <div className="dash-cell dash-card" style={{ fontSize: 13, color: 'var(--text2)' }}>
              Every card is hidden. Use Customise to bring some back.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
