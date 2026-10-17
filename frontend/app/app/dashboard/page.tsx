'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { toast } from 'sonner'
import { api, type NetWorthResponse } from '@/lib/api'
import { NetWorthCard, type NetWorthPart } from '@/components/dashboard/NetWorthCard'
import {
  IconBuildingBank, IconTarget, IconArrowRight,
  IconChartBar, IconArrowsExchange, IconWallet, IconNewSection,
  IconArrowDownRight, IconPigMoney, IconPlus,
} from '@tabler/icons-react'

function fmt(n: number) {
  return n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null)
  const [netWorth, setNetWorth] = useState<NetWorthResponse | null>(null)
  const [netWorthError, setNetWorthError] = useState<string | null>(null)
  const [monthSpend, setMonthSpend] = useState<number | null>(null)
  const [goals, setGoals] = useState<any[]>([])
  const [excluded, setExcluded] = useState<NetWorthPart[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      // Separate from the main profile read so the dashboard still loads if the column isn't there yet.
      supabase.from('profiles').select('networth_excluded').eq('id', user.id).single()
        .then(({ data }) => { if (Array.isArray(data?.networth_excluded)) setExcluded(data.networth_excluded) })

      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
      // fin_goals and fin_transactions are household-scoped by RLS (goals have no user_id
      // column), so they're read the same way the Finance pages read them.
      const [{ data: p }, { data: txns }, { data: g }, nw] = await Promise.all([
        supabase.from('profiles').select('username').eq('id', user.id).single(),
        supabase.from('fin_transactions').select('amount').gte('date', monthStart).lt('amount', 0),
        supabase.from('fin_goals').select('id, name, target_amount, current_amount').eq('status', 'active').order('created_at').limit(3),
        api.getNetWorth().catch((e: Error) => { setNetWorthError(e.message); return null }),
      ])

      setProfile(p)
      setNetWorth(nw)
      if (txns) setMonthSpend(txns.reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0))
      setGoals(g ?? [])
      setLoading(false)
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

  async function toggleNetWorthPart(part: NetWorthPart) {
    const next = excluded.includes(part) ? excluded.filter(p => p !== part) : [...excluded, part]
    setExcluded(next)
    if (!userId) return
    const { error } = await supabase.from('profiles').update({ networth_excluded: next }).eq('id', userId)
    if (error) toast.error(`Couldn't save that preference: ${error.message}`)
  }

  const noData = !loading && netWorth?.current && !netWorth.current.hasData

  const quickLinks = [
    { href: '/app/portfolio', label: 'Portfolio', icon: IconChartBar, section: 'Investing' },
    { href: '/app/finance/accounts', label: 'Accounts', icon: IconBuildingBank, section: 'Finance' },
    { href: '/app/finance/transactions', label: 'Transactions', icon: IconArrowsExchange, section: 'Finance' },
    { href: '/app/finance/budget', label: 'Budget', icon: IconWallet, section: 'Finance' },
    { href: '/app/finance/goals', label: 'Goals', icon: IconTarget, section: 'Finance' },
    { href: '/app/finance/kiwisaver', label: 'KiwiSaver', icon: IconPigMoney, section: 'Finance' },
    { href: '/app/news', label: 'News', icon: IconNewSection, section: 'Investing' },
  ]

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' } as const

  return (
    <div className="dash-page">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, sans-serif', color: 'var(--text)', margin: 0 }}>
          {greeting}{profile?.username ? `, ${profile.username}` : ''}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{dateLabel}</p>
      </div>

      <NetWorthCard data={netWorth} loading={loading} error={netWorthError} excluded={excluded} onToggle={toggleNetWorthPart} />

      {noData && (
        <div style={{ ...card, marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>Connect your bank and investments to see your full net worth.</span>
          <Link href="/app/settings" style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>Connect Akahu →</Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, margin: '14px 0 24px' }}>
        {/* Monthly spend */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconArrowDownRight size={15} style={{ color: 'var(--primary)' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>This Month</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {loading || monthSpend === null ? '—' : fmt(monthSpend)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>spending so far</div>
        </div>

        {/* Savings goals */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconTarget size={15} style={{ color: 'var(--primary)' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Savings Goals</span>
            </div>
            {goals.length > 0 && (
              <Link href="/app/finance/goals" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                View all <IconArrowRight size={12} />
              </Link>
            )}
          </div>
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>—</div>
          ) : goals.length === 0 ? (
            <Link href="/app/finance/goals" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
              <IconPlus size={14} /> Set your first savings goal
            </Link>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {goals.map((g: any) => {
                const target = Number(g.target_amount)
                const saved = Number(g.current_amount)
                const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0
                return (
                  <div key={g.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{g.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmt(saved)} / {fmt(target)}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: 3, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>Quick Access</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {quickLinks.map(({ href, label, icon: Icon, section }) => (
            <Link key={href} href={href} style={{ textDecoration: 'none', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, transition: 'border-color 0.15s' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} style={{ color: 'var(--primary)' }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{label}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{section}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
