'use client'
import { useEffect, useMemo, useState } from 'react'
import { IconWand, IconX } from '@tabler/icons-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { localDate } from '@/lib/utils'
import { fromHistory, fromAnswers, type Suggestion } from '@/lib/budgetSuggest'
import { loadAboutYou, saveAboutYou, type HouseholdAnswers } from '@/lib/aboutYou'

const supabase = createClient()
const money = (n: number) => n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })

interface Cat { id: string; name: string; monthly_budget: number | null }
type Mode = 'history' | 'answers'

const input: React.CSSProperties = { width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }

// "Suggest budgets": limits for each spending category, from your last few
// months of spending or from a few questions. You review them before anything is saved.
export function BudgetHelper({ categories, expectedIncome, onApplied, onClose }: {
  categories: Cat[]; expectedIncome: number
  onApplied: (updates: { id: string; monthly_budget: number }[]) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [txs, setTxs] = useState<{ date: string; amount: number; category: string | null }[] | null>(null)
  const [answers, setAnswers] = useState<HouseholdAnswers>({ adults: 1, children: 0, car: true })
  const [chosen, setChosen] = useState<Record<string, { on: boolean; amount: number }>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const from = localDate(new Date(new Date().getFullYear(), new Date().getMonth() - 4, 1))
    Promise.all([
      supabase.from('fin_transactions')
        .select('date, amount, category:fin_categories(name), account:fin_accounts!inner(is_business, is_rental)')
        .eq('account.is_business', false).eq('account.is_rental', false).gte('date', from).limit(5000),
      loadAboutYou(supabase),
    ]).then(([{ data }, about]) => {
      const rows = (data ?? []).map((t: any) => ({ date: t.date, amount: Number(t.amount), category: t.category?.name ?? null }))
      setTxs(rows)
      setAnswers(a => ({ ...a, ...about.household, takeHome: about.household?.takeHome ?? (expectedIncome || undefined) }))
      // Start from spending if there's at least a month of it.
      setMode(fromHistory(rows, categories.map(c => c.name)).monthsUsed > 0 ? 'history' : 'answers')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const names = useMemo(() => new Set(categories.map(c => c.name)), [categories])
  const result = useMemo((): { suggestions: Suggestion[]; notes: string[] } => {
    if (!mode || !txs) return { suggestions: [], notes: [] }
    if (mode === 'history') {
      const h = fromHistory(txs, categories.map(c => c.name))
      return { suggestions: h.suggestions, notes: h.monthsUsed ? [] : ['There isn’t a full month of categorised spending yet. Try “A few questions” instead.'] }
    }
    const q = fromAnswers(answers)
    const missing = q.suggestions.filter(s => !names.has(s.name)).map(s => s.name)
    return { suggestions: q.suggestions.filter(s => names.has(s.name)), notes: [...q.notes, ...(missing.length ? [`Not shown because you don’t have these categories: ${missing.join(', ')}.`] : [])] }
  }, [mode, txs, answers, categories, names])

  // Ticked by default where there's no budget yet; ones you've set are left unticked.
  useEffect(() => {
    const next: Record<string, { on: boolean; amount: number }> = {}
    for (const s of result.suggestions) {
      const cat = categories.find(c => c.name === s.name)
      next[s.name] = { on: !Number(cat?.monthly_budget), amount: s.amount }
    }
    setChosen(next)
  }, [result, categories])

  const picked = result.suggestions.filter(s => chosen[s.name]?.on)
  const total = picked.reduce((sum, s) => sum + (chosen[s.name]?.amount || 0), 0)

  async function apply() {
    setSaving(true)
    const updates = picked.map(s => ({ id: categories.find(c => c.name === s.name)!.id, monthly_budget: Math.max(0, Math.round(chosen[s.name].amount)) }))
    const results = await Promise.all(updates.map(u => supabase.from('fin_categories').update({ monthly_budget: u.monthly_budget }).eq('id', u.id)))
    const failed = results.filter(r => r.error).length
    if (mode === 'answers') saveAboutYou(supabase, { household: answers })
    setSaving(false)
    if (failed) toast.error(`${failed} budget${failed === 1 ? '' : 's'} couldn’t be saved. Please try again.`)
    else toast.success(`Set ${updates.length} budget${updates.length === 1 ? '' : 's'}. Change any of them by tapping its limit.`)
    onApplied(updates.filter((_, i) => !results[i].error))
  }

  const num = (v: string) => (v === '' ? undefined : Math.max(0, Number(v) || 0))

  return (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <IconWand size={16} style={{ color: 'var(--primary)' }} />
        <strong style={{ fontFamily: 'Syne, sans-serif', fontSize: 14, flex: 1 }}>Suggest budgets</strong>
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', lineHeight: 0 }}><IconX size={16} /></button>
      </div>

      <div role="tablist" style={{ display: 'inline-flex', gap: 4, background: 'var(--surface)', borderRadius: 8, padding: 3, marginBottom: 12 }}>
        {([['history', 'From my spending'], ['answers', 'A few questions']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: mode === k ? 'var(--primary)' : 'transparent', color: mode === k ? 'white' : 'var(--text2)' }}>{l}</button>
        ))}
      </div>

      {!mode ? <p style={{ fontSize: 12, color: 'var(--text2)' }}>Looking at your spending…</p> : (
        <>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
            {mode === 'history'
              ? 'What you’ve spent in each category, averaged over your last full months (this month isn’t finished, so it’s left out).'
              : 'Rough starting points from typical New Zealand costs for a household like yours. Adjust them to suit how you live.'}
          </p>

          {mode === 'answers' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
              <div><label style={lbl} htmlFor="bh-adults">Adults</label>
                <input id="bh-adults" type="number" min={1} max={8} value={answers.adults ?? 1} onChange={e => setAnswers(a => ({ ...a, adults: Math.max(1, Number(e.target.value) || 1) }))} style={input} /></div>
              <div><label style={lbl} htmlFor="bh-kids">Children</label>
                <input id="bh-kids" type="number" min={0} max={10} value={answers.children ?? 0} onChange={e => setAnswers(a => ({ ...a, children: Math.max(0, Number(e.target.value) || 0) }))} style={input} /></div>
              <div><label style={lbl} htmlFor="bh-pay">Take-home pay a month</label>
                <input id="bh-pay" type="number" min={0} step={100} placeholder="optional" value={answers.takeHome ?? ''} onChange={e => setAnswers(a => ({ ...a, takeHome: num(e.target.value) }))} style={input} /></div>
              <div><label style={lbl} htmlFor="bh-housing">Rent or mortgage a month</label>
                <input id="bh-housing" type="number" min={0} step={50} placeholder="optional" value={answers.housing ?? ''} onChange={e => setAnswers(a => ({ ...a, housing: num(e.target.value) }))} style={input} /></div>
              <div><label style={lbl} htmlFor="bh-car">Run a car?</label>
                <select id="bh-car" value={answers.car === false ? 'no' : 'yes'} onChange={e => setAnswers(a => ({ ...a, car: e.target.value === 'yes' }))} style={input}>
                  <option value="yes">Yes</option><option value="no">No</option>
                </select></div>
            </div>
          )}

          {result.suggestions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {result.suggestions.map(s => {
                const cat = categories.find(c => c.name === s.name)
                const c = chosen[s.name]
                return (
                  <label key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!c?.on} onChange={e => setChosen(p => ({ ...p, [s.name]: { ...p[s.name], on: e.target.checked } }))} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)' }}>
                        {s.basis}{Number(cat?.monthly_budget) ? ` · now ${money(Number(cat!.monthly_budget))}` : ''}
                      </span>
                    </span>
                    <input type="number" min={0} step={10} aria-label={`Suggested budget for ${s.name}`} value={c?.amount ?? s.amount}
                      onChange={e => setChosen(p => ({ ...p, [s.name]: { on: true, amount: Math.max(0, Number(e.target.value) || 0) } }))}
                      style={{ ...input, width: 96, textAlign: 'right', fontFamily: 'DM Mono, monospace' }} />
                  </label>
                )
              })}
            </div>
          )}
          {result.notes.map(n => <p key={n} style={{ fontSize: 11, color: 'var(--amber)', marginBottom: 6, lineHeight: 1.5 }}>{n}</p>)}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            <button onClick={apply} disabled={saving || picked.length === 0}
              style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving || picked.length === 0 ? 0.5 : 1 }}>
              {saving ? 'Saving…' : `Use ${picked.length} budget${picked.length === 1 ? '' : 's'}`}
            </button>
            {picked.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                {money(total)} a month{answers.takeHome && mode === 'answers' ? ` of ${money(answers.takeHome)} take-home` : ''}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
