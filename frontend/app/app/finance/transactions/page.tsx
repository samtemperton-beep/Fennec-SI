'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconSearch, IconX, IconCheck } from '@tabler/icons-react'
import { toast } from 'sonner'

const supabase = createClient()
const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })
const dateFormat = new Intl.DateTimeFormat('en-NZ', { day: '2-digit', month: 'short' })

const CATEGORY_COLORS = ['#5B7CF0','#14B8A6','#22C55E','#F59E0B','#EF4444','#A855F7','#F97316','#0EA5E9','#EC4899','#6366F1']
function catColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length]
}

interface Transaction {
  id: string; date: string; description: string; amount: number
  category_id: string | null; category?: { name: string } | null
  account?: { name: string; owner: string } | null
}
interface Category { id: string; name: string }

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [uncatOnly, setUncatOnly] = useState(false)
  const [editingCat, setEditingCat] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { loadAll() }, [])
  useEffect(() => { loadTransactions() }, [debouncedSearch, dateFrom, dateTo, uncatOnly])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadTransactions(), loadCategories()])
    setLoading(false)
  }

  async function loadCategories() {
    const { data } = await supabase.from('fin_categories').select('id, name').eq('scope', 'household').order('name')
    setCategories(data || [])
  }

  async function loadTransactions() {
    let q = supabase
      .from('fin_transactions')
      .select('id, date, description, amount, category_id, category:fin_categories(name), account:fin_accounts(name,owner)')
      .order('date', { ascending: false })
      .limit(200)
    if (debouncedSearch) q = q.ilike('description', `%${debouncedSearch}%`)
    if (dateFrom) q = q.gte('date', dateFrom)
    if (dateTo) q = q.lte('date', dateTo)
    if (uncatOnly) q = q.is('category_id', null)
    const { data, error } = await q
    if (error) toast.error(error.message)
    else setTransactions((data as any) || [])
    setLoading(false)
  }

  async function setCategory(txId: string, categoryId: string) {
    const { error } = await supabase.from('fin_transactions').update({ category_id: categoryId }).eq('id', txId)
    if (error) { toast.error(error.message); return }
    setTransactions(prev => prev.map(t => t.id === txId
      ? { ...t, category_id: categoryId, category: categories.find(c => c.id === categoryId) ? { name: categories.find(c => c.id === categoryId)!.name } : null }
      : t))
    setEditingCat(null)
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Transactions</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Last 200 transactions across all accounts</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <IconSearch size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transactions…"
            style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
        <button onClick={() => setUncatOnly(u => !u)}
          style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 600, border: uncatOnly ? '1px solid var(--primary)' : '1px solid var(--border)', background: uncatOnly ? 'var(--primary-light)' : 'var(--surface)', color: uncatOnly ? 'var(--primary)' : 'var(--text2)', cursor: 'pointer' }}>
          Uncategorised
        </button>
        {(search || dateFrom || dateTo || uncatOnly) && (
          <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setUncatOnly(false) }}
            style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconX size={12} /> Clear
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><LoadingSpinner size={28} /></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {transactions.length === 0 ? (
            <p style={{ padding: 32, color: 'var(--text2)', textAlign: 'center', fontSize: 14 }}>No transactions found.</p>
          ) : transactions.map((t, i) => {
            const isIncome = t.amount > 0
            const catName = (t.category as any)?.name ?? null
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < transactions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                {/* Category dot */}
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: catName ? catColor(catName) : 'var(--border)' }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || '—'}</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--text2)' }}>{dateFormat.format(new Date(t.date))}</span>
                    {(t.account as any)?.name && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{(t.account as any).name}</span>}
                    {/* Category pill / picker */}
                    {editingCat === t.id ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {categories.map(c => (
                          <button key={c.id} onClick={() => setCategory(t.id, c.id)}
                            style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: catColor(c.name) + '22', color: catColor(c.name), border: `1px solid ${catColor(c.name)}44`, cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
                            {c.name}
                          </button>
                        ))}
                        <button onClick={() => setEditingCat(null)} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setEditingCat(t.id)}
                        style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: catName ? catColor(catName) + '22' : 'var(--surface2)', color: catName ? catColor(catName) : 'var(--text3)', border: catName ? `1px solid ${catColor(catName)}44` : '1px dashed var(--border)', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
                        {catName ?? 'Categorise'}
                      </button>
                    )}
                  </div>
                </div>

                <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 14, flexShrink: 0, color: isIncome ? 'var(--green)' : 'var(--text)' }}>
                  {isIncome ? '+' : ''}{currency.format(t.amount)}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
