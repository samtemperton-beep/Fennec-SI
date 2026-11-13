'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { suggestKeyword } from '@/lib/categoryRules'
import { suggestCategory, nzd, RENTAL_CATEGORIES, type RentalCategory, type RentalProperty, type RentalTx } from '@/lib/rental'

// A property's transactions, with suggested rental categories and rules.

const supabase = createClient()
const HINT = new Map(RENTAL_CATEGORIES.map(c => [c.name, c.hint]))
const date = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })

export function RentalTransactions({ property, txs, cats, accountIds, onChanged }: {
  property: RentalProperty
  txs: RentalTx[]
  cats: RentalCategory[]
  accountIds: string[]
  onChanged: (updates: Record<string, string | null>) => void
}) {
  const byName = useMemo(() => new Map(cats.map(c => [c.name, c])), [cats])
  const catName = useMemo(() => new Map(cats.map(c => [c.id, c.name])), [cats])
  const uncategorised = txs.filter(t => !t.category_id || !catName.has(t.category_id))
  const [view, setView] = useState<'todo' | 'all'>(uncategorised.length ? 'todo' : 'all')
  const [limit, setLimit] = useState(60)
  const [busy, setBusy] = useState(false)
  const [rule, setRule] = useState<{ txId: string; keyword: string; categoryId: string; name: string } | null>(null)

  const suggestions = useMemo(() => {
    const m = new Map<string, RentalCategory>()
    for (const t of uncategorised) {
      const n = suggestCategory(t, property)
      const c = n ? byName.get(n) : undefined
      if (c) m.set(t.id, c)
    }
    return m
  }, [uncategorised, property, byName])

  const list = (view === 'todo' ? uncategorised : txs).slice(0, limit)

  async function setCategory(ids: string[], categoryId: string | null) {
    const { error } = await supabase.from('fin_transactions')
      .update({ category_id: categoryId, category_source: categoryId ? 'manual' : null, shared_match_id: null })
      .in('id', ids)
    if (error) { toast.error(error.message); return false }
    onChanged(Object.fromEntries(ids.map(id => [id, categoryId])))
    return true
  }

  async function pick(t: RentalTx, categoryId: string) {
    if (!(await setCategory([t.id], categoryId || null)) || !categoryId) return
    const kw = suggestKeyword(t.description ?? '')
    if (kw.length >= 3) setRule({ txId: t.id, keyword: kw, categoryId, name: catName.get(categoryId) ?? '' })
  }

  async function acceptAll() {
    setBusy(true)
    const groups = new Map<string, string[]>()
    for (const [txId, c] of suggestions) groups.set(c.id, [...(groups.get(c.id) ?? []), txId])
    let n = 0
    for (const [catId, ids] of groups) if (await setCategory(ids, catId)) n += ids.length
    toast.success(`${n} transaction${n === 1 ? '' : 's'} categorised. Check any that look wrong.`)
    setBusy(false)
  }

  async function saveRule() {
    if (!rule) return
    const keyword = rule.keyword.trim().toLowerCase()
    if (keyword.length < 3) { toast.error('Use a keyword of at least 3 letters.'); return }
    // One rule per keyword: don't quietly take over a household or business one.
    const { data: existing } = await supabase.from('fin_category_rules').select('category_id').eq('pattern', keyword).maybeSingle()
    if (existing && !catName.has((existing as any).category_id)) {
      toast.error(`You already have a household or business rule for "${keyword}". Use a longer keyword, like the full name on the statement.`)
      return
    }
    const { error } = await supabase.from('fin_category_rules').upsert({ pattern: keyword, category_id: rule.categoryId }, { onConflict: 'user_id,pattern' })
    if (error) { toast.error(error.message); return }
    // Apply to this property's uncategorised transactions that match.
    const { data } = await supabase.from('fin_transactions')
      .update({ category_id: rule.categoryId, category_source: 'rule', shared_match_id: null })
      .in('account_id', accountIds).is('category_id', null).ilike('description', `%${keyword}%`)
      .select('id')
    const ids = (data ?? []).map((r: any) => r.id as string)
    if (ids.length) onChanged(Object.fromEntries(ids.map(id => [id, rule.categoryId])))
    toast.success(`Saved. New "${keyword}" transactions in rental accounts go to ${rule.name}${ids.length ? `, and ${ids.length} more were sorted` : ''}.`)
    setRule(null)
  }

  const TAB = (on: boolean): React.CSSProperties => ({ padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)', background: on ? 'var(--primary)' : 'transparent', color: on ? 'white' : 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button type="button" style={TAB(view === 'todo')} onClick={() => setView('todo')}>Needs a category ({uncategorised.length})</button>
        <button type="button" style={TAB(view === 'all')} onClick={() => setView('all')}>All ({txs.length})</button>
        {view === 'todo' && suggestions.size > 0 && (
          <button type="button" disabled={busy} onClick={acceptAll}
            style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {busy ? 'Sorting…' : `Accept ${suggestions.size} suggestion${suggestions.size === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      {rule && (
        <div style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, fontSize: 13, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>Always put transactions containing</span>
          <input value={rule.keyword} onChange={e => setRule({ ...rule, keyword: e.target.value })} maxLength={40}
            style={{ width: 150, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2, var(--surface))', color: 'var(--text)', fontSize: 13 }} />
          <span>in <strong>{rule.name}</strong>?</span>
          <button type="button" onClick={saveRule} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save rule</button>
          <button type="button" onClick={() => setRule(null)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>No thanks</button>
        </div>
      )}

      {list.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text2)', padding: '12px 0' }}>
          {view === 'todo' ? 'Everything has a category. Nice.' : 'No transactions yet. Link an account above, then sync.'}
        </p>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        {list.map(t => {
          const s = suggestions.get(t.id)
          const current = t.category_id && catName.has(t.category_id) ? t.category_id : ''
          return (
            <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text)', overflowWrap: 'anywhere' }}>{t.description || '(no description)'}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{date(t.date)}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.amount > 0 ? 'var(--green)' : 'var(--text)', minWidth: 80, textAlign: 'right' }}>
                {t.amount > 0 ? '+' : '−'}{nzd.format(Math.abs(t.amount))}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {s && !current && (
                  <button type="button" onClick={() => pick(t, s.id)} title={HINT.get(s.name)}
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px dashed var(--primary)', background: 'transparent', color: 'var(--primary)', fontSize: 12, cursor: 'pointer' }}>
                    {s.name}?
                  </button>
                )}
                <select value={current} onChange={e => pick(t, e.target.value)} aria-label="Category"
                  style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2, var(--surface))', color: 'var(--text)', fontSize: 12, maxWidth: 180 }}>
                  <option value="">Choose category</option>
                  {cats.map(c => <option key={c.id} value={c.id} title={HINT.get(c.name)}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )
        })}
      </div>
      {(view === 'todo' ? uncategorised : txs).length > limit && (
        <button type="button" onClick={() => setLimit(l => l + 100)} style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Show more</button>
      )}
    </div>
  )
}
