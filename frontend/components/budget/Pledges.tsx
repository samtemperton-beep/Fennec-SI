'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { IconPlus, IconX } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { localDate } from '@/lib/utils'
import { PLEDGE_PRESETS, matchesPledge, cleanKeyword, daysBetween, type Pledge, type Slip } from '@/lib/rewards'

const supabase = createClient()
const money = (n: number) => n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
const chip = (on: boolean): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-light)' : 'var(--surface2)', color: on ? 'var(--primary)' : 'var(--text2)',
})

interface Tx { date: string; description: string | null; amount: number }

// No-spend pledges: places you've said you won't spend. Fennec checks new
// transactions against them (backend/src/services/rewards.ts checkPledges).
export function Pledges() {
  const [pledges, setPledges] = useState<Pledge[] | null>(null)
  const [slips, setSlips] = useState<Slip[]>([])
  const [history, setHistory] = useState<Tx[]>([])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [kw, setKw] = useState('')
  const [saving, setSaving] = useState(false)
  const today = localDate(new Date())

  async function load() {
    const [{ data: p, error }, { data: s }] = await Promise.all([
      supabase.from('pledges').select('*').order('created_at', { ascending: false }),
      supabase.from('pledge_slips').select('id, pledge_id, description, amount, date').order('date', { ascending: false }).limit(200),
    ])
    if (error) { setPledges([]); return }
    setPledges((p ?? []) as Pledge[]); setSlips((s ?? []) as Slip[])
  }
  useEffect(() => {
    load()
    // The last 3 months, to show what a pledge would have caught.
    const from = new Date(); from.setMonth(from.getMonth() - 3)
    supabase.from('fin_transactions').select('date, description, amount').lt('amount', 0).gte('date', localDate(from)).limit(5000)
      .then(({ data }) => setHistory((data ?? []) as Tx[]))
  }, [])

  const preview = useMemo(() => {
    if (!keywords.length) return null
    const hits = history.filter(t => matchesPledge(t.description, keywords))
    return { count: hits.length, total: hits.reduce((s, t) => s + Math.abs(Number(t.amount)), 0) }
  }, [keywords, history])

  function pickPreset(p: typeof PLEDGE_PRESETS[number]) { setName(p.name); setKeywords(p.keywords) }
  function addKeyword() {
    const k = cleanKeyword(kw)
    if (k.replace(/[^a-z0-9]/g, '').length < 3) return toast.error('Use at least 3 letters, like part of the name on your bank statement.')
    if (!keywords.includes(k)) setKeywords([...keywords, k].slice(0, 20))
    setKw('')
  }

  async function save() {
    if (!name.trim() || !keywords.length) return
    setSaving(true)
    const { error } = await supabase.from('pledges').insert({ name: name.trim().slice(0, 60), keywords })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Pledge made. Fennec will let you know if any spending there shows up.')
    setAdding(false); setName(''); setKeywords([])
    load()
    api.refreshRewards().catch(() => {})
  }

  async function end(p: Pledge) {
    if (!confirm(`End your “${p.name}” pledge? Your past wins stay.`)) return
    const { error } = await supabase.from('pledges').update({ active: false, ended_at: new Date().toISOString() }).eq('id', p.id)
    if (error) { toast.error(error.message); return }
    load()
  }

  if (pledges === null) return null
  const active = pledges.filter(p => p.active)

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, flex: 1 }}>Your pledges</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <IconPlus size={13} /> New pledge
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
        Places you’ve decided not to spend. If spending there turns up in your bank transactions, Fennec tells you, and your buddy if you have one.
      </p>

      {adding && (
        <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Pick one, or make your own</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {PLEDGE_PRESETS.map(p => <button key={p.name} onClick={() => pickPreset(p)} style={chip(name === p.name)}>{p.icon} {p.name}</button>)}
          </div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Name
            <input value={name} onChange={e => setName(e.target.value.slice(0, 60))} placeholder="e.g. No Uber Eats"
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 400 }} />
          </label>
          <p style={{ fontSize: 12, fontWeight: 700, margin: '12px 0 6px' }}>Words to look for in your transactions</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {keywords.map(k => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 10px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12 }}>
                {k}
                <button onClick={() => setKeywords(keywords.filter(x => x !== k))} aria-label={`Remove ${k}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', lineHeight: 0, padding: 0 }}><IconX size={12} /></button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input value={kw} onChange={e => setKw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }} placeholder="Add a word, like the shop's name"
              style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
            <button onClick={addKeyword} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--primary)', background: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Add</button>
          </div>
          {preview && (
            <p style={{ fontSize: 12, color: preview.count ? 'var(--amber)' : 'var(--text2)', marginBottom: 12 }}>
              {preview.count
                ? <>In the last 3 months you spent <strong>{money(preview.total)}</strong> here ({preview.count} time{preview.count === 1 ? '' : 's'}). That’s about {money(preview.total / 3)} a month back in your pocket.</>
                : 'Nothing like this in your last 3 months of transactions. Check the words match how it shows on your bank statement.'}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={!name.trim() || !keywords.length || saving}
              style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: !name.trim() || !keywords.length || saving ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Make this pledge'}
            </button>
            <button onClick={() => { setAdding(false); setName(''); setKeywords([]) }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {active.length === 0 && !adding ? (
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>No pledges yet. Lotto, betting, Uber Eats: pick something you’d like to cut out.</p>
      ) : active.map(p => {
        const mine = slips.filter(s => s.pledge_id === p.id)
        const start = p.created_at.slice(0, 10)
        const kept = Math.max(0, daysBetween(mine[0]?.date && mine[0].date > start ? mine[0].date : start, today))
        const preset = PLEDGE_PRESETS.find(x => x.name === p.name)
        return (
          <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22 }} aria-hidden>{preset?.icon ?? '✋'}</span>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Looking for: {p.keywords.join(', ')}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: kept >= 7 ? 'var(--green)' : 'var(--text)' }}>{kept}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>day{kept === 1 ? '' : 's'} kept</div>
              </div>
              <button onClick={() => end(p)} style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>End</button>
            </div>
            {kept < 30 && (
              <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 3, marginTop: 10, overflow: 'hidden' }} aria-label={`${kept} of 30 days to the 30 Days Strong badge`}>
                <div style={{ width: `${(kept / 30) * 100}%`, height: '100%', background: 'var(--green)' }} />
              </div>
            )}
            {mine.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)' }}>
                {mine.length} slip{mine.length === 1 ? '' : 's'} so far, most recently {new Date(`${mine[0].date}T12:00:00`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                {' '}({money(mine.reduce((s, x) => s + Number(x.amount), 0))} in total)
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
