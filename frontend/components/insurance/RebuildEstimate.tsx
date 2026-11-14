'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { CORDELL_URL, money, fmtDate, type Policy, type RebuildEstimate as Estimate } from '@/lib/insurance'

// Finance → Insurance: run the free Cordell Sum Sure calculator, then save its
// figures here so Fennec can check the sum insured against them. Cordell can't
// be run from Fennec itself (it's Cotality's tool and asks you to accept its
// terms), so this lists what to check and keeps the result.

const supabase = createClient()
const INPUT: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: 140 }
const num = (s: string) => { const n = Number(s.replace(/[$,\s]/g, '')); return s.trim() && Number.isFinite(n) && n > 0 ? n : null }
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date())

export function RebuildEstimate({ policy, onSaved }: { policy: Policy; onSaved: (e: Estimate | null) => void }) {
  const d = policy.details ?? {}
  const saved = d.rebuild_estimate ?? null
  const [open, setOpen] = useState(!saved)
  const [today, setToday] = useState(saved ? String(saved.today) : '')
  const [in12, setIn12] = useState(saved?.in12 ? String(saved.in12) : '')
  const [source, setSource] = useState(saved?.source ?? 'Cordell Sum Sure')
  const [busy, setBusy] = useState(false)

  const facts = [
    d.floor_area ? `${d.floor_area} m² floor area (home and attached garage)` : null,
    d.outbuildings_area ? `${d.outbuildings_area} m² detached garage or outbuildings` : null,
    d.storeys ? `${d.storeys} storey${d.storeys === 1 ? '' : 's'}` : null,
    d.walls ? `${d.walls} walls` : null,
    d.roof ? `${d.roof} roof` : null,
    d.year_built ? `built ${d.year_built}` : null,
  ].filter(Boolean) as string[]

  async function save(clear = false) {
    const value: Estimate | null = clear ? null : (() => {
      const t = num(today)
      if (!t) return null
      return { today: t, in12: num(in12), source: source.trim() || 'Cordell Sum Sure', date: todayIso() }
    })()
    if (!clear && !value) { toast.error("Enter today's rebuild estimate."); return }
    setBusy(true)
    const details = { ...d, rebuild_estimate: value }
    const { error } = await supabase.from('insurance_policies').update({ details, updated_at: new Date().toISOString() }).eq('id', policy.id)
    setBusy(false)
    if (error) { toast.error(error.message); return }
    onSaved(value)
    setOpen(false)
    toast.success(clear ? 'Estimate removed' : 'Saved. The check now compares the sum insured with it.')
  }

  return (
    <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Rebuild estimate</div>
        {saved && !open && (
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {money(saved.today)} today{saved.in12 ? ` · ${money(saved.in12)} in 12 months` : ''} · {saved.source}, {fmtDate(saved.date)}{' '}
            <button type="button" onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>Update</button>
          </div>
        )}
      </div>
      {open && (
        <>
          <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55, margin: '6px 0 8px' }}>
            The sum insured should be what it would cost to rebuild today, not the market value. Run the free{' '}
            <a href={CORDELL_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>Cordell Sum Sure calculator</a>{' '}
            (the same one most insurers use; it takes about 5 minutes). It pre-fills details from public records, so check them against your policy{facts.length ? <>: {facts.join(', ')}</> : ''}. Pre-filled details can be wrong (wall material especially), and the right ones change the figure a lot. Then enter what it says here.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12, color: 'var(--text2)' }}>Today (total incl. GST)<br />
              <input inputMode="decimal" style={INPUT} value={today} onChange={e => setToday(e.target.value)} placeholder="e.g. 450000" />
            </label>
            <label style={{ fontSize: 12, color: 'var(--text2)' }}>In 12 months<br />
              <input inputMode="decimal" style={INPUT} value={in12} onChange={e => setIn12(e.target.value)} placeholder="e.g. 470000" />
            </label>
            <label style={{ fontSize: 12, color: 'var(--text2)' }}>From<br />
              <input style={{ ...INPUT, width: 170 }} maxLength={40} value={source} onChange={e => setSource(e.target.value)} />
            </label>
            <button type="button" disabled={busy} onClick={() => save()} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {busy ? 'Saving…' : 'Save estimate'}
            </button>
            {saved && <button type="button" onClick={() => setOpen(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>}
            {saved && <button type="button" disabled={busy} onClick={() => save(true)} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Remove</button>}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>An estimate, not a valuation. For an unusual or older home, a registered valuer or quantity surveyor can do a rebuild valuation.</p>
        </>
      )}
    </div>
  )
}
