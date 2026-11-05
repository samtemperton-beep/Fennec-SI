'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconCheck, IconX, IconPlus, IconRefresh, IconWand, IconArrowBackUp } from '@tabler/icons-react'
import { toast } from 'sonner'
import { api, type CategoryMatch, type CategoryScope } from '@/lib/api'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

const SOURCE: Record<CategoryMatch['source'], string> = { starter: 'Starter list', admin: 'From your data', users: 'From people’s rules' }
const btn = (bg: string, color: string, border = 'none'): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border, background: bg, color,
  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
})

// The admin page's Categories tab: the shared keyword -> category list that
// categorises everyone's transactions once approved (shared_categories_migration.sql).
export function CategoryMatchesPanel() {
  const [matches, setMatches] = useState<CategoryMatch[] | null>(null)
  const [categories, setCategories] = useState<Record<CategoryScope, string[]>>({ household: [], business: [] })
  const [view, setView] = useState<CategoryMatch['status']>('pending')
  const [scope, setScope] = useState<CategoryScope>('household')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [draft, setDraft] = useState({ keyword: '', category_name: '' })

  const load = useCallback(async () => {
    try {
      const r = await api.adminGetCategoryMatches()
      setMatches(r.matches)
      setCategories(r.categories)
    } catch (e: any) { toast.error(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => (matches ?? [])
    .filter(m => m.status === view && m.scope === scope && (!search || m.keyword.includes(search.toLowerCase()) || m.category_name.toLowerCase().includes(search.toLowerCase()))),
  [matches, view, scope, search])
  const count = (s: CategoryMatch['status']) => (matches ?? []).filter(m => m.status === s && m.scope === scope).length

  async function update(m: CategoryMatch, body: { status?: CategoryMatch['status']; category_name?: string }, quiet = false) {
    setBusy(m.id)
    try {
      const r = await api.adminUpdateCategoryMatch(m.id, body)
      if (!quiet) {
        if (body.status === 'approved') toast.success(`Approved. ${r.applied ?? 0} transaction${r.applied === 1 ? '' : 's'} categorised.`)
        else if (r.removed) toast.success(`Removed from ${r.removed} transaction${r.removed === 1 ? '' : 's'}.`)
      }
      setMatches(prev => (prev ?? []).map(x => x.id === m.id ? { ...x, ...body } : x))
      if (body.status === 'approved') await load() // another category for the keyword may have been replaced
    } catch (e: any) { toast.error(e.message) }
    setBusy(null)
  }

  async function approveAllShown() {
    if (!window.confirm(`Approve all ${shown.length} matches shown? Everyone's matching uncategorised transactions will be categorised.`)) return
    setBusy('all')
    let applied = 0
    for (const m of shown) {
      try { applied += (await api.adminUpdateCategoryMatch(m.id, { status: 'approved' })).applied ?? 0 } catch (e: any) { toast.error(`${m.keyword}: ${e.message}`) }
    }
    toast.success(`Approved ${shown.length}. ${applied} transactions categorised.`)
    await load()
    setBusy(null)
  }

  async function add() {
    if (!draft.keyword.trim() || !draft.category_name) return
    setBusy('add')
    try {
      const r = await api.adminAddCategoryMatch({ keyword: draft.keyword, category_name: draft.category_name, scope })
      toast.success(`Added. ${r.applied} transaction${r.applied === 1 ? '' : 's'} categorised.`)
      setDraft({ keyword: '', category_name: '' })
      await load()
    } catch (e: any) { toast.error(e.message) }
    setBusy(null)
  }

  async function suggest() {
    setBusy('suggest')
    try {
      const r = await api.adminSuggestCategoryMatches()
      toast.success(r.added ? `${r.added} new suggestion${r.added === 1 ? '' : 's'} from your transactions.` : 'No new suggestions found in your transactions.')
      setView('pending')
      await load()
    } catch (e: any) { toast.error(e.message) }
    setBusy(null)
  }

  const select = (value: string, onChange: (v: string) => void, disabled = false) => (
    <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)}
      style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}>
      {!value && <option value="">Category…</option>}
      {categories[scope].map(c => <option key={c} value={c}>{c}</option>)}
    </select>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Shared categories</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={btn('none', 'var(--text2)', '1px solid var(--border)')}><IconRefresh size={13} /> Refresh</button>
          <button onClick={suggest} disabled={busy === 'suggest'} style={btn('var(--primary)', 'white')}>
            {busy === 'suggest' ? <LoadingSpinner size={12} /> : <IconWand size={13} />} Suggest from my transactions
          </button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 16px', lineHeight: 1.6 }}>
        Approved matches categorise everyone&apos;s transactions automatically (their own rules come first, and anyone can opt out of a match).
        Suggestions come from the starter list, your own transactions, and the rules people save. Only the keyword and category are shared.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {(['pending', 'approved', 'rejected'] as const).map(s => (
          <button key={s} onClick={() => setView(s)}
            style={btn(view === s ? 'var(--surface)' : 'transparent', view === s ? 'var(--text)' : 'var(--text2)', `1px solid ${view === s ? 'var(--primary)' : 'var(--border)'}`)}>
            {s[0].toUpperCase() + s.slice(1)} ({count(s)})
          </button>
        ))}
        <select value={scope} onChange={e => { setScope(e.target.value as CategoryScope); setDraft({ keyword: '', category_name: '' }) }}
          style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}>
          <option value="household">Household</option>
          <option value="business">Business</option>
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          style={{ flex: '1 1 140px', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }} />
        {view === 'pending' && shown.length > 1 && (
          <button onClick={approveAllShown} disabled={!!busy} style={btn('none', 'var(--green)', '1px solid var(--green)')}>
            {busy === 'all' ? <LoadingSpinner size={12} /> : <IconCheck size={13} />} Approve all {shown.length}
          </button>
        )}
      </div>

      {/* Add a match directly (approved straight away) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>Add:</span>
        <input value={draft.keyword} onChange={e => setDraft(d => ({ ...d, keyword: e.target.value }))} placeholder="Keyword in the description, e.g. countdown"
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          style={{ flex: '1 1 200px', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontFamily: 'DM Mono, monospace' }} />
        {select(draft.category_name, v => setDraft(d => ({ ...d, category_name: v })))}
        <button onClick={add} disabled={busy === 'add' || !draft.keyword.trim() || !draft.category_name} style={btn('var(--primary)', 'white')}>
          {busy === 'add' ? <LoadingSpinner size={12} /> : <IconPlus size={13} />} Add and approve
        </button>
      </div>

      {!matches ? (
        <div style={{ color: 'var(--text2)', fontSize: 13 }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ color: 'var(--text2)', fontSize: 13, padding: '12px 0' }}>Nothing {view} here.</div>
      ) : (
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {shown.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, flex: '1 1 140px', overflowWrap: 'anywhere' }}>{m.keyword}</span>
              <span style={{ color: 'var(--text3)' }}>→</span>
              {view === 'pending'
                ? select(m.category_name, v => update(m, { category_name: v }, true), busy === m.id)
                : <span style={{ fontWeight: 600 }}>{m.category_name}</span>}
              <span style={{ color: 'var(--text3)', flex: '1 1 120px' }}>
                {SOURCE[m.source]}{m.suggestions > 0 ? ` · ${m.suggestions} rule${m.suggestions === 1 ? '' : 's'}` : ''}
              </span>
              {busy === m.id ? <LoadingSpinner size={14} /> : view === 'pending' ? (
                <span style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => update(m, { status: 'approved' })} style={btn('none', 'var(--green)', '1px solid var(--green)')}><IconCheck size={13} /> Approve</button>
                  <button onClick={() => update(m, { status: 'rejected' })} style={btn('none', 'var(--text2)', '1px solid var(--border)')}><IconX size={13} /> Reject</button>
                </span>
              ) : view === 'approved' ? (
                <button onClick={() => { if (window.confirm(`Remove "${m.keyword}"? Transactions it categorised go back to uncategorised.`)) update(m, { status: 'rejected' }) }}
                  style={btn('none', 'var(--red)', '1px solid var(--border)')}><IconX size={13} /> Remove</button>
              ) : (
                <button onClick={() => update(m, { status: 'pending' })} style={btn('none', 'var(--text2)', '1px solid var(--border)')}><IconArrowBackUp size={13} /> Back to pending</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
