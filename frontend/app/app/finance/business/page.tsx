'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

const supabase = createClient()
const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })

// NZ tax year: 1 Apr – 31 Mar
function taxYearRange(year: number) {
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` }
}
function currentTaxYear() {
  const now = new Date()
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
}

const COLORS = ['#5B7CF0','#14B8A6','#22C55E','#F59E0B','#EF4444','#A855F7','#F97316','#0EA5E9','#EC4899','#6366F1']
function catColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

interface TxRow { date: string; amount: number; category?: { name: string } | null }

export default function BusinessOverviewPage() {
  const [taxYear, setTaxYear] = useState(currentTaxYear())
  const [transactions, setTransactions] = useState<TxRow[]>([])
  const [loading, setLoading] = useState(true)
  const [noAccounts, setNoAccounts] = useState(false)

  useEffect(() => { load() }, [taxYear])

  async function load() {
    setLoading(true)
    const { from, to } = taxYearRange(taxYear)
    const { data: bizAccounts } = await supabase
      .from('fin_accounts').select('id').eq('is_business', true)

    if (!bizAccounts?.length) {
      setNoAccounts(true); setTransactions([]); setLoading(false); return
    }
    setNoAccounts(false)
    const ids = bizAccounts.map((a: any) => a.id)
    const { data } = await supabase
      .from('fin_transactions')
      .select('date, amount, category:fin_categories(name)')
      .in('account_id', ids)
      .gte('date', from).lte('date', to)
    setTransactions((data as any) || [])
    setLoading(false)
  }

  const income = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expenses = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const netProfit = income - expenses
  const margin = income > 0 ? ((netProfit / income) * 100).toFixed(1) : '—'

  const byCategory = transactions.filter(t => t.amount < 0).reduce<Record<string, number>>((acc, t) => {
    const name = (t.category as any)?.name || 'Uncategorised'
    acc[name] = (acc[name] || 0) + Math.abs(t.amount)
    return acc
  }, {})
  const catEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1])

  // 12 months starting Apr of taxYear
  const months = Array.from({ length: 12 }, (_, i) => {
    const monthIdx = (i + 3) % 12  // 3=Apr, 4=May, ... 2=Mar
    const year = i < 9 ? taxYear : taxYear + 1
    const monthNum = monthIdx + 1
    const label = new Date(year, monthIdx, 1).toLocaleDateString('en-NZ', { month: 'short' })
    const prefix = `${year}-${String(monthNum).padStart(2, '0')}`
    const txs = transactions.filter(t => t.date.startsWith(prefix))
    return {
      label,
      income: txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
      expenses: txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
    }
  })
  const maxBar = Math.max(...months.map(m => Math.max(m.income, m.expenses)), 1)
  const years = Array.from({ length: 5 }, (_, i) => currentTaxYear() - i + 1)

  const kpis = [
    { label: 'Income', value: income, color: 'var(--green)' },
    { label: 'Expenses', value: expenses, color: 'var(--red)' },
    { label: 'Net Profit', value: netProfit, color: netProfit >= 0 ? 'var(--green)' : 'var(--red)' },
    { label: 'Profit Margin', value: null, raw: `${margin}%`, color: 'var(--primary)' },
  ]

  return (
    <div style={{ padding: 28, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Business Overview</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>P&L summary for your business accounts</p>
        </div>
        <select value={taxYear} onChange={e => setTaxYear(Number(e.target.value))}
          style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer' }}>
          {years.map(y => <option key={y} value={y}>{y}–{y + 1} tax year</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><LoadingSpinner size={32} /></div>
      ) : noAccounts ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>No business accounts found</p>
          <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.7 }}>
            In your Accounts page, transactions from business bank accounts need to be marked. Sync your accounts via Akahu, then update the <code>is_business</code> flag in Supabase for the relevant accounts.
          </p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 24 }}>
            {kpis.map(k => (
              <div key={k.label} className="card" style={{ padding: 20 }}>
                <p style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>{k.label}</p>
                <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 24, color: k.color }}>
                  {k.raw ?? currency.format(k.value!)}
                </p>
              </div>
            ))}
          </div>

          {/* Monthly P&L chart */}
          <div className="card" style={{ padding: 20, marginBottom: 24 }}>
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, marginBottom: 16 }}>Monthly P&L — {taxYear}–{taxYear + 1}</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 130 }}>
              {months.map(m => (
                <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ width: '100%', display: 'flex', gap: 1, alignItems: 'flex-end', height: 110 }}>
                    <div style={{ flex: 1, background: '#22C55E', opacity: 0.75, borderRadius: '3px 3px 0 0', height: `${(m.income / maxBar) * 100}%`, minHeight: m.income > 0 ? 2 : 0, transition: 'height 0.3s' }} />
                    <div style={{ flex: 1, background: '#EF4444', opacity: 0.75, borderRadius: '3px 3px 0 0', height: `${(m.expenses / maxBar) * 100}%`, minHeight: m.expenses > 0 ? 2 : 0, transition: 'height 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>{m.label}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              {[['#22C55E', 'Income'], ['#EF4444', 'Expenses']].map(([c, l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: c, opacity: 0.75 }} />
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Expenses by category */}
          {catEntries.length > 0 ? (
            <div className="card" style={{ padding: 20 }}>
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, marginBottom: 16 }}>Expenses by Category</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {catEntries.map(([name, amount]) => (
                  <div key={name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 9, height: 9, borderRadius: '50%', background: catColor(name), flexShrink: 0 }} />
                        <span style={{ fontSize: 13 }}>{name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{expenses > 0 ? ((amount / expenses) * 100).toFixed(1) : 0}%</span>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600 }}>{currency.format(amount)}</span>
                      </div>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--surface2)' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: catColor(name), width: expenses > 0 ? `${(amount / expenses) * 100}%` : '0%', transition: 'width 0.4s' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : transactions.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: 'var(--text2)', fontSize: 14 }}>No transactions for {taxYear}–{taxYear + 1}. Sync your accounts to get started.</p>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
