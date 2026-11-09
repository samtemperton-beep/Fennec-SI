'use client'
export const dynamic = 'force-dynamic'
import { localDate } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconChevronLeft, IconChevronRight, IconBulb, IconRefresh, IconCoin, IconDeviceTv, IconShoppingCart, IconPhone, IconCreditCard, IconChartLine } from '@tabler/icons-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { SavingsTip } from '@/lib/api'
import { isIncomeCategory } from '@/lib/categories'
import { NewCategory } from '@/components/finance/NewCategory'
import { BudgetHelper } from '@/components/finance/BudgetHelper'
import { IconWand } from '@tabler/icons-react'

const supabase = createClient()
const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
const monthLabel = new Intl.DateTimeFormat('en-NZ', { month: 'long', year: 'numeric' })

const CATEGORY_COLORS = ['#5B7CF0','#14B8A6','#22C55E','#F59E0B','#EF4444','#A855F7','#F97316','#0EA5E9','#EC4899','#6366F1']
function catColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length]
}

// For income categories, monthly_budget is the income you expect each month.
interface Category { id: string; name: string; monthly_budget: number | null; kind?: string | null }

function getMonthBounds(offset: number) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { start, end, label: monthLabel.format(start) }
}

export default function BudgetPage() {
  const [offset, setOffset] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [spent, setSpent] = useState<Record<string, number>>({})
  const [received, setReceived] = useState<Record<string, number>>({})
  const [helperOpen, setHelperOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [tips, setTips] = useState<SavingsTip[] | null>(null)
  const [tipsLoading, setTipsLoading] = useState(false)

  const { start, end, label } = getMonthBounds(offset)

  useEffect(() => { load() }, [offset])

  async function load() {
    setLoading(true)
    const [{ data: cats }, { data: txs }] = await Promise.all([
      // '*' so this works before and after category_kind_migration.sql adds `kind`.
      supabase.from('fin_categories').select('*').eq('scope', 'household').order('name'),
      supabase.from('fin_transactions')
        .select('category_id, amount')
        .gte('date', localDate(start))
        .lte('date', localDate(end))
        .not('category_id', 'is', null),
    ])
    setCategories((cats || []) as Category[])
    // Money out per category (spending), and money in per category (income received).
    const out: Record<string, number> = {}
    const into: Record<string, number> = {}
    for (const t of txs || []) {
      const amt = Number(t.amount)
      if (amt < 0) out[t.category_id] = (out[t.category_id] || 0) - amt
      else if (amt > 0) into[t.category_id] = (into[t.category_id] || 0) + amt
    }
    setSpent(out)
    setReceived(into)
    setLoading(false)
  }

  async function saveBudget(catId: string) {
    const val = parseFloat(editVal)
    if (isNaN(val) || val < 0) { toast.error('Invalid amount'); return }
    const { error } = await supabase.from('fin_categories').update({ monthly_budget: val }).eq('id', catId)
    if (error) { toast.error(error.message); return }
    setCategories(prev => prev.map(c => c.id === catId ? { ...c, monthly_budget: val } : c))
    setEditing(null)
  }

  async function loadTips() {
    setTipsLoading(true)
    try {
      const { tips: data } = await api.getSavingsTips()
      setTips(data || [])
    } catch (e: any) {
      toast.error(e.message || 'Could not load savings tips')
    } finally {
      setTipsLoading(false)
    }
  }

  // Income is set and tracked separately, and never counted in the budget.
  const spendingCats = categories.filter(c => !isIncomeCategory(c))
  const incomeCats = categories.filter(c => isIncomeCategory(c))
  const totalBudget = spendingCats.reduce((s, c) => s + (Number(c.monthly_budget) || 0), 0)
  const totalSpent = spendingCats.reduce((s, c) => s + (spent[c.id] || 0), 0)
  const expectedIncome = incomeCats.reduce((s, c) => s + (Number(c.monthly_budget) || 0), 0)
  const receivedIncome = incomeCats.reduce((s, c) => s + (received[c.id] || 0), 0)

  const addCategory = (c: Category) => setCategories(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))

  // One row: the category, this month's amount, and its limit (or expected income), editable.
  const row = (cat: Category, i: number, list: Category[], income: boolean) => {
    const s = income ? (received[cat.id] || 0) : (spent[cat.id] || 0)
    const budget = Number(cat.monthly_budget) || 0
    const pct = budget > 0 ? Math.min((s / budget) * 100, 100) : 0
    const over = !income && budget > 0 && s > budget
    const statusColor = income ? 'var(--green)' : over ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--green)'
    return (
      <div key={cat.id} style={{ padding: '14px 20px', borderBottom: i < list.length - 1 ? '1px solid var(--border)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: catColor(cat.name), flexShrink: 0 }} />
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, flex: 1 }}>{cat.name}</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: over ? 'var(--red)' : income && s > 0 ? 'var(--green)' : 'var(--text)' }}>{currency.format(s)}</span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>/</span>
          {editing === cat.id ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveBudget(cat.id); if (e.key === 'Escape') setEditing(null) }}
                aria-label={income ? `Expected ${cat.name} each month` : `Monthly budget for ${cat.name}`}
                style={{ width: 80, padding: '3px 7px', borderRadius: 6, border: '1px solid var(--primary)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontFamily: 'DM Mono, monospace', outline: 'none' }} />
              <button onClick={() => saveBudget(cat.id)} style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--primary)', color: 'white', border: 'none', fontSize: 11, cursor: 'pointer' }}>Save</button>
            </div>
          ) : (
            <button onClick={() => { setEditing(cat.id); setEditVal(String(budget || '')) }}
              style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, textDecoration: budget ? 'none' : 'underline dotted' }}>
              {budget ? currency.format(budget) : income ? 'Set expected' : 'Set budget'}
            </button>
          )}
        </div>
        {budget > 0 && (
          <div style={{ height: 5, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: statusColor, borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
        )}
      </div>
    )
  }

  const sectionHead = (title: string, note: string, kind: 'spending' | 'income') => (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
      <div>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15 }}>{title}</h2>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{note}</p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {kind === 'spending' && !helperOpen && (
          <button onClick={() => setHelperOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer' }}>
            <IconWand size={13} /> Suggest budgets
          </button>
        )}
        <NewCategory defaultKind={kind} onCreated={c => addCategory(c as Category)} />
      </div>
    </div>
  )

  return (
    <div style={{ padding: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Budget</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Monthly spending against your budget, and income kept separate</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setOffset(o => o - 1)} style={{ padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer', lineHeight: 0 }}><IconChevronLeft size={16} /></button>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, minWidth: 130, textAlign: 'center' }}>{label}</span>
          <button onClick={() => setOffset(o => Math.min(o + 1, 0))} disabled={offset === 0} style={{ padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: offset === 0 ? 'var(--text3)' : 'var(--text2)', cursor: offset === 0 ? 'default' : 'pointer', lineHeight: 0 }}><IconChevronRight size={16} /></button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Monthly budget', value: totalBudget, color: 'var(--primary)' },
          { label: 'Spent this month', value: totalSpent, color: totalSpent > totalBudget ? 'var(--red)' : 'var(--text)' },
          { label: 'Remaining', value: Math.max(0, totalBudget - totalSpent), color: 'var(--green)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text2)', marginBottom: 6 }}>{s.label}</p>
            <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 22, color: s.color }}>{currency.format(s.value)}</p>
          </div>
        ))}
      </div>

      {/* AI Savings Tips */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tips?.length ? 16 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconBulb size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>AI Savings Tips</span>
            {tips && <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 4 }}>Based on your transactions this month</span>}
          </div>
          <button
            onClick={() => { setTips(null); loadTips() }}
            disabled={tipsLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: tipsLoading ? 'var(--surface2)' : 'var(--accent)', color: tipsLoading ? 'var(--text2)' : '#fff', fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: tipsLoading ? 'default' : 'pointer', transition: 'all 0.15s' }}
          >
            {tipsLoading ? <><LoadingSpinner size={12} /><span>Analysing…</span></> : tips ? <><IconRefresh size={13} /><span>Refresh</span></> : <><IconBulb size={13} /><span>Get tips</span></>}
          </button>
        </div>
        {tips && tips.length === 0 && (
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 12 }}>No specific tips right now — your spending looks well-balanced!</p>
        )}
        {tips && tips.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12 }}>
            {tips.map((tip, i) => {
              const Icon = tip.category === 'subscriptions' ? IconDeviceTv : tip.category === 'dining' ? IconCoin : tip.category === 'groceries' ? IconShoppingCart : tip.category === 'phone' ? IconPhone : tip.category === 'debt' ? IconCreditCard : IconChartLine
              return (
                <div key={i} style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Icon size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>{tip.title}</span>
                    </div>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 13, color: 'var(--green)', flexShrink: 0 }}>~${Math.round(tip.saving)}/mo</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, margin: 0 }}>{tip.detail}</p>
                  <p style={{ fontSize: 11.5, color: 'var(--accent)', margin: 0, fontWeight: 500 }}>→ {tip.action}</p>
                </div>
              )
            })}
          </div>
        )}
        {!tips && !tipsLoading && (
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>Fennec will analyse your actual transactions to find personalised savings opportunities.</p>
        )}
      </div>

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><LoadingSpinner size={28} /></div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {sectionHead('Monthly budget', 'Spent this month / your limit for each category. Tap a limit to change it.', 'spending')}
            {helperOpen && (
              <BudgetHelper categories={spendingCats} expectedIncome={expectedIncome} onClose={() => setHelperOpen(false)}
                onApplied={updates => {
                  setCategories(prev => prev.map(c => { const u = updates.find(x => x.id === c.id); return u ? { ...c, monthly_budget: u.monthly_budget } : c }))
                  setHelperOpen(false)
                }} />
            )}
            {spendingCats.length === 0
              ? <p style={{ padding: 32, textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>No spending categories yet.</p>
              : spendingCats.map((c, i) => row(c, i, spendingCats, false))}
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {sectionHead('Income', 'Received this month / what you expect each month. Not counted in your budget.', 'income')}
            {incomeCats.length === 0
              ? <p style={{ padding: 24, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>No income categories yet.</p>
              : incomeCats.map((c, i) => row(c, i, incomeCats, true))}
            {expectedIncome > 0 && (
              <p style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                You expect <strong style={{ color: 'var(--text)' }}>{currency.format(expectedIncome)}</strong> a month and have budgeted <strong style={{ color: 'var(--text)' }}>{currency.format(totalBudget)}</strong>
                {expectedIncome >= totalBudget
                  ? <>, leaving <strong style={{ color: 'var(--green)' }}>{currency.format(expectedIncome - totalBudget)}</strong> unbudgeted to save or invest.</>
                  : <>: <strong style={{ color: 'var(--red)' }}>{currency.format(totalBudget - expectedIncome)}</strong> more than you expect to earn.</>}
                {receivedIncome > 0 && <> {currency.format(receivedIncome)} has come in so far this month.</>}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
