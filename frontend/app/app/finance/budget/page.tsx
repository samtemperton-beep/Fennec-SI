'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { toast } from 'sonner'

const supabase = createClient()
const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
const monthLabel = new Intl.DateTimeFormat('en-NZ', { month: 'long', year: 'numeric' })

const CATEGORY_COLORS = ['#5B7CF0','#14B8A6','#22C55E','#F59E0B','#EF4444','#A855F7','#F97316','#0EA5E9','#EC4899','#6366F1']
function catColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length]
}

interface Category { id: string; name: string; monthly_budget: number | null }

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
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  const { start, end, label } = getMonthBounds(offset)

  useEffect(() => { load() }, [offset])

  async function load() {
    setLoading(true)
    const [{ data: cats }, { data: txs }] = await Promise.all([
      supabase.from('fin_categories').select('id, name, monthly_budget').eq('scope', 'household').order('name'),
      supabase.from('fin_transactions')
        .select('category_id, amount')
        .gte('date', start.toISOString().slice(0, 10))
        .lte('date', end.toISOString().slice(0, 10))
        .lt('amount', 0),
    ])
    setCategories(cats || [])
    const totals: Record<string, number> = {}
    for (const t of txs || []) {
      if (t.category_id) totals[t.category_id] = (totals[t.category_id] || 0) + Math.abs(Number(t.amount))
    }
    setSpent(totals)
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

  const totalBudget = categories.reduce((s, c) => s + (c.monthly_budget || 0), 0)
  const totalSpent = Object.values(spent).reduce((s, v) => s + v, 0)
  const catsWithBudget = categories.filter(c => c.monthly_budget)
  const catsWithSpend = categories.filter(c => spent[c.id])

  return (
    <div style={{ padding: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Budget</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Monthly spending vs. budget by category</p>
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
          { label: 'Budgeted', value: totalBudget, color: 'var(--primary)' },
          { label: 'Spent', value: totalSpent, color: totalSpent > totalBudget ? 'var(--red)' : 'var(--text)' },
          { label: 'Remaining', value: Math.max(0, totalBudget - totalSpent), color: 'var(--green)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text2)', marginBottom: 6 }}>{s.label}</p>
            <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 22, color: s.color }}>{currency.format(s.value)}</p>
          </div>
        ))}
      </div>

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><LoadingSpinner size={28} /></div> : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {categories.length === 0 ? (
            <p style={{ padding: 32, textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>No categories yet.</p>
          ) : categories.map((cat, i) => {
            const s = spent[cat.id] || 0
            const budget = cat.monthly_budget || 0
            const pct = budget > 0 ? Math.min((s / budget) * 100, 100) : 0
            const over = budget > 0 && s > budget
            const statusColor = over ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--green)'
            return (
              <div key={cat.id} style={{ padding: '14px 20px', borderBottom: i < categories.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: catColor(cat.name), flexShrink: 0 }} />
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, flex: 1 }}>{cat.name}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: over ? 'var(--red)' : 'var(--text)' }}>{currency.format(s)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>/</span>
                  {editing === cat.id ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveBudget(cat.id); if (e.key === 'Escape') setEditing(null) }}
                        style={{ width: 80, padding: '3px 7px', borderRadius: 6, border: '1px solid var(--primary)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontFamily: 'DM Mono, monospace', outline: 'none' }} />
                      <button onClick={() => saveBudget(cat.id)} style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--primary)', color: 'white', border: 'none', fontSize: 11, cursor: 'pointer' }}>Save</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditing(cat.id); setEditVal(String(budget || '')) }}
                      style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, textDecoration: budget ? 'none' : 'underline dotted' }}>
                      {budget ? currency.format(budget) : 'Set budget'}
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
          })}
        </div>
      )}
    </div>
  )
}
