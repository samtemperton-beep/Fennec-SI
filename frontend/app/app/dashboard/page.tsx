'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import {
  IconTrendingUp, IconBuildingBank, IconTarget, IconArrowRight,
  IconChartBar, IconArrowsExchange, IconWallet, IconNewSection,
  IconArrowDownRight, IconPigMoney,
} from '@tabler/icons-react'

function fmt(n: number) {
  return n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null)
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null)
  const [bankBalance, setBankBalance] = useState<number | null>(null)
  const [monthSpend, setMonthSpend] = useState<number | null>(null)
  const [activeGoals, setActiveGoals] = useState<any[]>([])
  const [kiwiSaver, setKiwiSaver] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // Placeholder data shown until real data syncs from Akahu
  const MOCK = {
    portfolioValue: 24580,
    bankBalance: 12340,
    monthSpend: 3210,
    goals: [
      { name: 'Emergency Fund', target_amount: 10000, current_amount: 6500 },
      { name: 'Holiday 2027', target_amount: 5000, current_amount: 1200 },
      { name: 'New Car', target_amount: 20000, current_amount: 4800 },
    ],
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const [{ data: p }, { data: holdings }, { data: accounts }, { data: txns }, { data: goals }, { data: ks }] = await Promise.all([
        supabase.from('profiles').select('username').eq('id', user.id).single(),
        supabase.from('holdings').select('quantity, avg_price').eq('user_id', user.id),
        supabase.from('fin_accounts').select('current_balance').eq('owner', 'me'),
        supabase.from('fin_transactions').select('amount').gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]).lt('amount', 0),
        supabase.from('fin_goals').select('name, target_amount, current_amount').eq('status', 'active').limit(3),
        supabase.from('fin_kiwisaver').select('current_balance').eq('user_id', user.id).maybeSingle(),
      ])

      setProfile(p)

      if (holdings && holdings.length > 0) {
        const total = holdings.reduce((s: number, h: any) => s + (h.quantity * h.avg_price), 0)
        setPortfolioValue(total)
      }

      if (accounts && accounts.length > 0) {
        const total = accounts.reduce((s: number, a: any) => s + (a.current_balance || 0), 0)
        setBankBalance(total)
      }

      if (txns && txns.length > 0) {
        const total = txns.reduce((s: number, t: any) => s + Math.abs(t.amount), 0)
        setMonthSpend(total)
      }

      if (goals && goals.length > 0) setActiveGoals(goals)
      if (ks?.current_balance) setKiwiSaver(Number(ks.current_balance))

      setLoading(false)
    }
    load()
  }, [])

  const displayPortfolio = portfolioValue ?? MOCK.portfolioValue
  const displayBank = bankBalance ?? MOCK.bankBalance
  const displaySpend = monthSpend ?? MOCK.monthSpend
  const displayGoals = activeGoals.length > 0 ? activeGoals : MOCK.goals
  const isMock = portfolioValue === null && bankBalance === null
  const displayKiwiSaver = kiwiSaver ?? 0
  const netWorth = displayPortfolio + displayBank + displayKiwiSaver
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const quickLinks = [
    { href: '/app/portfolio', label: 'Portfolio', icon: IconChartBar, section: 'Investing' },
    { href: '/app/finance/accounts', label: 'Accounts', icon: IconBuildingBank, section: 'Finance' },
    { href: '/app/finance/transactions', label: 'Transactions', icon: IconArrowsExchange, section: 'Finance' },
    { href: '/app/finance/budget', label: 'Budget', icon: IconWallet, section: 'Finance' },
    { href: '/app/finance/goals', label: 'Goals', icon: IconTarget, section: 'Finance' },
    { href: '/app/finance/kiwisaver', label: 'KiwiSaver', icon: IconPigMoney, section: 'Finance' },
    { href: '/app/news', label: 'News', icon: IconNewSection, section: 'Investing' },
  ]

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, sans-serif', color: 'var(--text)', margin: 0 }}>
          {greeting}{profile?.username ? `, ${profile.username}` : ''}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
          {new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Net Worth + stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
        {/* Net Worth */}
        <div style={{ gridColumn: 'span 2', background: 'var(--primary)', borderRadius: 14, padding: '22px 24px', color: 'white', position: 'relative' }}>
          {isMock && !loading && (
            <div style={{ position: 'absolute', top: 10, right: 12, fontSize: 9, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>
              SAMPLE DATA
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Net Worth</div>
          <div style={{ fontSize: 32, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {loading ? '—' : fmt(netWorth)}
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 10, opacity: 0.75 }}>Portfolio</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{loading ? '—' : fmt(displayPortfolio)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, opacity: 0.75 }}>Bank</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{loading ? '—' : fmt(displayBank)}</div>
            </div>
            {displayKiwiSaver > 0 && (
              <div>
                <div style={{ fontSize: 10, opacity: 0.75 }}>KiwiSaver</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(displayKiwiSaver)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Monthly spend */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconArrowDownRight size={15} style={{ color: 'var(--primary)' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>This Month</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {loading ? '—' : fmt(displaySpend)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>spending so far</div>
        </div>

        {/* Active goals */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconTarget size={15} style={{ color: 'var(--primary)' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Goals</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {displayGoals.length}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>active savings goals</div>
        </div>
      </div>

      {/* Goals progress */}
      {displayGoals.length > 0 && !loading && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Savings Goals{isMock && <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, marginLeft: 8 }}>(sample)</span>}</span>
            <Link href="/app/finance/goals" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <IconArrowRight size={12} />
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {displayGoals.map((g: any) => {
              const pct = Math.min(100, Math.round((g.current_amount / g.target_amount) * 100))
              return (
                <div key={g.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{g.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text2)' }}>{fmt(g.current_amount)} / {fmt(g.target_amount)}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
