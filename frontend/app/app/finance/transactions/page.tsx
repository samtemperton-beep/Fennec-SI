'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconSearch, IconX, IconCheck, IconArrowLeft, IconWand } from '@tabler/icons-react'
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
  return <Suspense><TransactionsPageInner /></Suspense>
}

function TransactionsPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const accountId = searchParams.get('account')
  const [accountName, setAccountName] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [uncatOnly, setUncatOnly] = useState(false)
  const [editingCat, setEditingCat] = useState<string | null>(null)
  const [creatingRule, setCreatingRule] = useState<{ txId: string; description: string; categoryId: string; categoryName: string } | null>(null)
  const [savingRule, setSavingRule] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { loadAll() }, [accountId])
  useEffect(() => { loadTransactions() }, [debouncedSearch, dateFrom, dateTo, uncatOnly, accountId])

  async function loadAll() {
    setLoading(true)
    if (accountId) {
      const { data } = await supabase.from('fin_accounts').select('name').eq('id', accountId).maybeSingle()
      setAccountName(data?.name || null)
    }
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
    if (accountId) q = q.eq('account_id', accountId)
    const { data, error } = await q
    if (error) toast.error(error.message)
    else setTransactions((data as any) || [])
    setLoading(false)
  }

  async function setCategory(txId: string, categoryId: string, description: string) {
    const { error } = await supabase.from('fin_transactions').update({ category_id: categoryId }).eq('id', txId)
    if (error) { toast.error(error.message); return }
    const cat = categories.find(c => c.id === categoryId)
    setTransactions(prev => prev.map(t => t.id === txId
      ? { ...t, category_id: categoryId, category: cat ? { name: cat.name } : null }
      : t))
    setEditingCat(null)
    if (cat) setCreatingRule({ txId, description, categoryId, categoryName: cat.name })
  }

  async function saveRule(pattern: string) {
    if (!creatingRule || savingRule) return
    setSavingRule(true)
    const keyword = pattern.trim().toLowerCase()
    const { error } = await supabase.from('fin_category_rules').upsert(
      { keyword, category_id: creatingRule.categoryId },
      { onConflict: 'keyword' }
    )
    if (error) { toast.error(error.message); setSavingRule(false); return }

    // Bulk-apply to matching uncategorised transactions
    const { data: updated } = await supabase.from('fin_transactions')
      .update({ category_id: creatingRule.categoryId })
      .ilike('description', `%${keyword}%`)
      .is('category_id', null)
      .select('id')
    const count = updated?.length ?? 0

    // Also update local state for any visible matches
    setTransactions(prev => prev.map(t =>
      t.description?.toLowerCase().includes(keyword) && !t.category_id
        ? { ...t, category_id: creatingRule.categoryId, category: { name: creatingRule.categoryName } }
        : t
    ))
    toast.success(`Rule saved — auto-categorised ${count ?? 0} existing transactions`)
    setCreatingRule(null)
    setSavingRule(false)
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 20 }}>
        {accountId && (
          <button onClick={() => router.push('/app/finance/accounts')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 12, fontFamily: 'Syne, sans-serif', padding: '0 0 8px', marginBottom: 4 }}>
            <IconArrowLeft size={13} /> Back to Accounts
          </button>
        )}
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>
          {accountName ? accountName : 'Transactions'}
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>
          {accountId ? `Showing transactions for this account` : 'Last 200 transactions across all accounts'}
        </p>
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

      {/* Create rule banner */}
      {creatingRule && (
        <CreateRuleBanner
          description={creatingRule.description}
          categoryName={creatingRule.categoryName}
          saving={savingRule}
          onSave={saveRule}
          onDismiss={() => setCreatingRule(null)}
        />
      )}

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
                          <button key={c.id} onClick={() => setCategory(t.id, c.id, t.description)}
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
}  // end TransactionsPageInner

// ── Create Rule Banner ────────────────────────────────────────────────────────

function CreateRuleBanner({ description, categoryName, saving, onSave, onDismiss }: {
  description: string; categoryName: string; saving: boolean
  onSave: (pattern: string) => void; onDismiss: () => void
}) {
  const [pattern, setPattern] = useState(() => {
    // Auto-suggest: first 2-3 meaningful words from description
    const words = description.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(w => w.length > 2)
    return words.slice(0, 3).join(' ').toLowerCase()
  })

  return (
    <div style={{
      position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9990, background: 'var(--surface)', border: '1px solid var(--primary)',
      borderRadius: 14, padding: '16px 20px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      minWidth: 340, maxWidth: 480,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <IconWand size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>
          Create auto-categorise rule?
        </span>
        <button onClick={onDismiss} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', lineHeight: 0 }}>
          <IconX size={14} />
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.5 }}>
        Any transaction containing this keyword will automatically be tagged <strong style={{ color: catColor(categoryName) }}>{categoryName}</strong>:
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={pattern}
          onChange={e => setPattern(e.target.value)}
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontFamily: 'DM Mono, monospace', outline: 'none' }}
          onKeyDown={e => { if (e.key === 'Enter') onSave(pattern) }}
          autoFocus
        />
        <button
          onClick={() => onSave(pattern)}
          disabled={saving || !pattern.trim()}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, cursor: 'pointer', opacity: saving || !pattern.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5 }}>
          {saving ? <LoadingSpinner size={12} /> : <IconCheck size={13} />} Save rule
        </button>
      </div>
      <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>
        This will also apply to existing uncategorised transactions that match.
      </p>
    </div>
  )
}
