'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { IconUpload, IconChevronDown, IconChevronRight, IconAlertTriangle } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'
import { agentFeesByYear, taxYearLabel, taxYearOf, todayNZ, type AgentStatement, type RentalProperty, type StatementItem } from '@/lib/rental'

// Finance → Rental: a property manager's monthly statements. Claude reads each
// one (the file isn't kept); the person checks the figures and saves them.
// lib/rental.ts (withAgentStatements) then uses them in place of the net
// payments the bank sees.

const supabase = createClient()
const MAX_BYTES = 8 * 1024 * 1024
const money = (n: number) => n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-NZ', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const FEE_NAMES: Record<string, string> = { management: 'Management fees on rent', letting: 'Letting fees', inspection: 'Inspections', advertising: 'Advertising', admin: 'Admin', 'on bills': 'Fees on bills they paid', other: 'Other fees' }
const SUB: React.CSSProperties = { fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }
const BTN: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
const INPUT: React.CSSProperties = { padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: 70 }

type Read = Omit<AgentStatement, 'id' | 'property_id'> & { mismatches: string[]; file: string }

export function AgentStatements({ property, statements, missing, estimated, onChanged }: {
  property: RentalProperty
  statements: AgentStatement[]
  missing: string[]
  estimated: { month: string; fee: number }[]
  onChanged: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Read[]>([])
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [pct, setPct] = useState(property.agent_fee_pct != null ? String(property.agent_fee_pct) : '')
  const [plusGst, setPlusGst] = useState(property.agent_fee_plus_gst !== false)

  const mine = statements.filter(s => s.property_id === property.id).sort((a, b) => b.period_end.localeCompare(a.period_end))
  const years = agentFeesByYear(mine)
  const current = taxYearOf(todayNZ())

  async function readFiles(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (fileRef.current) fileRef.current.value = ''
    if (!files.length) return
    const { data: { session } } = await supabase.auth.getSession()
    const out: Read[] = []
    for (const [i, f] of files.entries()) {
      if (f.type !== 'application/pdf' && !f.type.startsWith('image/')) { toast.error(`${f.name}: upload a PDF or screenshot.`); continue }
      if (f.size > MAX_BYTES) { toast.error(`${f.name} is over 8 MB.`); continue }
      setReading(files.length > 1 ? `Reading ${i + 1} of ${files.length}…` : 'Reading…')
      try {
        const buf = new Uint8Array(await f.arrayBuffer())
        let bin = ''
        for (let j = 0; j < buf.length; j += 0x8000) bin += String.fromCharCode(...buf.subarray(j, j + 0x8000))
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/finance/agent-statement-read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ file: { type: f.type, data: btoa(bin) } }),
        })
        const r = await res.json()
        if (!res.ok) throw new Error(r.error || "Couldn't read that")
        out.push({ ...r, file: f.name })
      } catch (e: any) {
        toast.error(`${f.name}: ${e.message}`)
      }
    }
    setReading(null)
    if (out.length) {
      // One per month; a later file for the same month wins.
      const byMonth = new Map([...drafts, ...out].map(d => [d.period_end.slice(0, 7), d]))
      setDrafts([...byMonth.values()].sort((a, b) => b.period_end.localeCompare(a.period_end)))
      toast.success(`Read ${out.length} statement${out.length === 1 ? '' : 's'}. Check the figures, then save.`)
    }
  }

  async function saveAll() {
    if (!drafts.length) return
    setSaving(true)
    const rows = drafts.map(({ mismatches: _m, file: _f, ...d }) => ({ ...d, property_id: property.id, source: 'upload' }))
    // One statement per month: replace any saved for the same month.
    const months = rows.map(r => r.period_end.slice(0, 7))
    const clash = mine.filter(s => months.includes(s.period_end.slice(0, 7)) && !rows.some(r => r.period_end === s.period_end)).map(s => s.id)
    if (clash.length) await supabase.from('rental_agent_statements').delete().in('id', clash)
    const { error } = await supabase.from('rental_agent_statements').upsert(rows, { onConflict: 'property_id,period_end' })
    setSaving(false)
    if (error) { toast.error(/rental_agent_statements/.test(error.message) ? 'This needs a database update first (agent_statements_migration.sql).' : error.message); return }
    toast.success(`Saved ${rows.length} statement${rows.length === 1 ? '' : 's'}. Rent, fees and the tax summary now use them.`)
    setDrafts([])
    onChanged()
  }

  async function remove(s: AgentStatement) {
    const { error } = await supabase.from('rental_agent_statements').delete().eq('id', s.id)
    if (error) { toast.error(error.message); return }
    toast.success(`${monthName(s.period_end.slice(0, 7))} removed`)
    onChanged()
  }

  async function saveFee() {
    const v = pct.trim() === '' ? null : Number(pct.replace(/[%\s]/g, ''))
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > 30)) { toast.error('Enter the fee as a %, e.g. 8'); return }
    const { error } = await supabase.from('rental_properties').update({ agent_fee_pct: v, agent_fee_plus_gst: plusGst }).eq('id', property.id)
    if (error) { toast.error(/agent_fee/.test(error.message) ? 'This needs a database update first (agent_statements_migration.sql).' : error.message); return }
    toast.success(v === null ? 'Fee cleared' : 'Saved. Months without a statement are estimated from it.')
    onChanged()
  }

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Property manager statements</h2>
      <p style={{ ...SUB, marginBottom: 12 }}>
        If a property manager collects the rent, they keep their fees and pay you the rest, often with the tenants&apos; utility repayments mixed in. Your bank only sees that net amount.
        Upload their monthly statements and Fennec reads the full rent, each fee and any bills they paid, and uses those in place of the payments for that month.
        You can choose several PDFs at once; download them from the emails first. Each file is read by Claude and not kept, and tenants&apos; names and bank account numbers aren&apos;t saved.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={e => readFiles(e.target.files)} />
        <button type="button" disabled={!!reading} onClick={() => fileRef.current?.click()}
          style={{ ...BTN, border: 'none', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', gap: 6, opacity: reading ? 0.7 : 1 }}>
          <IconUpload size={14} /> {reading ?? 'Upload statements'}
        </button>
        <span style={{ ...SUB, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          Their fee:
          <input inputMode="decimal" style={INPUT} value={pct} onChange={e => setPct(e.target.value)} placeholder="e.g. 8" aria-label="Property manager fee %" />%
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={plusGst} onChange={e => setPlusGst(e.target.checked)} /> plus GST
          </label>
          <button type="button" onClick={saveFee} style={BTN}>Save</button>
        </span>
      </div>

      {/* Read, not yet saved */}
      {drafts.length > 0 && (
        <div style={{ border: '1px solid var(--primary)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Check before saving</div>
          {drafts.map(d => (
            <div key={d.period_end} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <StatementRow s={d} open={open === `d:${d.period_end}`} onToggle={() => setOpen(o => o === `d:${d.period_end}` ? null : `d:${d.period_end}`)} />
              {d.mismatches.length > 0 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, color: 'var(--red)', marginTop: 4 }}>
                  <IconAlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Doesn&apos;t add up to the statement&apos;s own totals ({d.mismatches.join('; ')}). Open it to check the lines, or upload it again.</span>
                </div>
              )}
              <button type="button" onClick={() => setDrafts(ds => ds.filter(x => x !== d))} style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, color: 'var(--text2)', fontSize: 12, cursor: 'pointer' }}>Leave this one out</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" disabled={saving} onClick={saveAll} style={{ ...BTN, border: 'none', background: 'var(--primary)', color: 'white' }}>{saving ? 'Saving…' : `Save ${drafts.length}`}</button>
            <button type="button" onClick={() => setDrafts([])} style={BTN}>Cancel</button>
          </div>
        </div>
      )}

      {/* Fees by tax year */}
      {years.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
          {years.map(y => (
            <div key={y.year} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>Fees {taxYearLabel(y.year)}{y.year === current ? ' (so far)' : ''}, incl. GST</div>
              <div style={{ fontSize: 17, fontWeight: 700, margin: '2px 0 4px' }}>{money(y.total)}</div>
              {Object.entries(y.byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)' }}><span>{FEE_NAMES[k] ?? k}</span><span>{money(v)}</span></div>
              ))}
            </div>
          ))}
        </div>
      )}

      {(missing.length > 0 || estimated.length > 0) && (
        <p style={{ ...SUB, marginBottom: 12 }}>
          {missing.length > 0 && <>No statement for {missing.map(monthName).join(', ')}. {property.agent_fee_pct ? 'Those months are estimated from the fee above until you upload it.' : 'Upload it, or set their fee above to estimate it.'} </>}
          {estimated.length > 0 && <>Estimated fees (from {property.agent_fee_pct}%{property.agent_fee_plus_gst === false ? '' : ' + GST'}): {estimated.map(e => `${monthName(e.month)} ${money(e.fee)}`).join(', ')}. Payments that include utility repayments make these a little high.</>}
        </p>
      )}

      {/* Saved */}
      {mine.length > 0 ? (
        <div>
          {mine.map(s => (
            <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <StatementRow s={s} open={open === s.id} onToggle={() => setOpen(o => o === s.id ? null : s.id)} />
              </div>
              <button type="button" onClick={() => remove(s)} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Remove</button>
            </div>
          ))}
        </div>
      ) : drafts.length === 0 && (
        <p style={SUB}>No statements yet.{property.agent_fee_pct ? ' Rent paid out is being grossed up by the fee above as an estimate.' : ''}</p>
      )}
    </div>
  )
}

function StatementRow({ s, open, onToggle }: { s: Omit<AgentStatement, 'id' | 'property_id'>; open: boolean; onToggle: () => void }) {
  const Chev = open ? IconChevronDown : IconChevronRight
  return (
    <div>
      <button type="button" onClick={onToggle} style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'none', border: 'none', padding: 0, color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600, textAlign: 'left' }}>
        <Chev size={14} /> {monthName(s.period_end.slice(0, 7))}{s.agent ? <span style={{ fontWeight: 400, color: 'var(--text2)' }}> · {s.agent}</span> : null}
      </button>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, paddingLeft: 20 }}>
        Rent {money(s.rent)} · fees {money(s.fees)}{s.expenses ? ` · bills paid ${money(s.expenses)}` : ''}{s.utilities ? ` · utilities back ${money(s.utilities)}` : ''}{s.other_income ? ` · other ${money(s.other_income)}` : ''} · paid to you {money(s.paid_to_owner)}
      </div>
      {open && (
        <div style={{ paddingLeft: 20, marginTop: 6 }}>
          {s.items.map((it: StatementItem, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '2px 0' }}>
              <span style={{ color: 'var(--text2)' }}>{shortDate(it.date)} · {it.kind === 'expense' ? `${it.label} (${it.line})` : it.label}</span>
              <span>{it.kind === 'fee' || it.kind === 'expense' || it.kind === 'payment' ? '−' : '+'}{money(it.amount)}{it.fee ? ` (fee ${money(it.fee)})` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
