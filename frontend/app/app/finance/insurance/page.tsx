'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { IconShieldCheck, IconUpload, IconPlus, IconEdit, IconMail } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { askFennec } from '@/lib/askFennec'
import { PolicyForm, EMPTY_POLICY } from '@/components/insurance/PolicyForm'
import { checkPolicy, policyText, money, fmtDate, daysUntil, KIND_LABEL, type Policy, type PolicyDraft, type Finding } from '@/lib/insurance'

const supabase = createClient()
const MAX_BYTES = 8 * 1024 * 1024
const H2: React.CSSProperties = { fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16 }
const SUB: React.CSSProperties = { fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }
const BTN: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }
const LEVEL: Record<Finding['level'], { icon: string; color: string }> = {
  problem: { icon: '⛔', color: 'var(--red)' }, warn: { icon: '⚠️', color: '#d9a400' }, saving: { icon: '💡', color: 'var(--primary)' },
  info: { icon: 'ℹ️', color: 'var(--text2)' }, ok: { icon: '✅', color: 'var(--green)' },
}
const FIELDS = ['kind', 'holder', 'insurer', 'label', 'rental_property_id', 'lives_there', 'premium_total', 'base_premium', 'levies', 'gst', 'pay_frequency', 'instalment', 'start_date', 'renewal_date', 'sum_insured', 'excess', 'details'] as const

export default function InsurancePage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [policies, setPolicies] = useState<Policy[]>([])
  const [rentals, setRentals] = useState<{ id: string; name: string }[]>([])
  const [paid, setPaid] = useState<Record<string, number>>({})
  const [editing, setEditing] = useState<{ id: string | null; draft: PolicyDraft } | null>(null)
  const [saving, setSaving] = useState(false)
  const [reading, setReading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const [{ data: p, error }, { data: r }] = await Promise.all([
      supabase.from('insurance_policies').select('*').order('renewal_date', { ascending: true, nullsFirst: false }),
      supabase.from('rental_properties').select('id, name').order('created_at'),
    ])
    if (error) { toast.error(/insurance_policies/.test(error.message) ? 'Insurance needs a database update first (insurance_migration.sql).' : error.message); setLoading(false); return }
    const list = ((p ?? []) as any[]).map(x => ({ ...x, details: x.details ?? {} })) as Policy[]
    setPolicies(list)
    setRentals((r ?? []) as any[])
    // What went to each insurer in the year before the policy started (your own policies only).
    const out: Record<string, number> = {}
    await Promise.all(list.filter(x => x.holder !== 'partner').map(async x => {
      const end = x.start_date ?? new Date().toISOString().slice(0, 10)
      const start = `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`
      const word = x.insurer.split(/\s+/)[0]
      if (word.length < 2) return
      const { data } = await supabase.from('fin_transactions').select('amount').lt('amount', 0)
        .gte('date', start).lt('date', end).ilike('description', `%${word}%`).limit(500)
      const sum = (data ?? []).reduce((s: number, t: any) => s - Number(t.amount), 0)
      if (sum > 0) out[x.id] = Math.round(sum)
    }))
    setPaid(out)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function readFile(f: File | undefined) {
    if (!f) return
    if (f.type !== 'application/pdf' && !f.type.startsWith('image/')) { toast.error('Upload the policy schedule as a PDF or a screenshot.'); return }
    if (f.size > MAX_BYTES) { toast.error('That file is over 8 MB.'); return }
    setReading(true)
    try {
      const buf = new Uint8Array(await f.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/finance/policy-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ file: { type: f.type, data: btoa(bin) } }),
      })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error || "Couldn't read that")
      setEditing({ id: null, draft: { ...EMPTY_POLICY, ...r, label: r.details?.suburb ?? null, details: r.details ?? {} } })
      toast.success('Read it. Check the details, answer "Do you live there?", then save.')
    } catch (e: any) { toast.error(e.message) }
    setReading(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function save(d: PolicyDraft) {
    if (!userId || !editing) return
    setSaving(true)
    const row: Record<string, any> = Object.fromEntries(FIELDS.map(k => [k, d[k]]))
    const { error } = editing.id
      ? await supabase.from('insurance_policies').update({ ...row, updated_at: new Date().toISOString() }).eq('id', editing.id)
      : await supabase.from('insurance_policies').insert({ ...row, user_id: userId })
    if (error) toast.error(error.message)
    else { toast.success('Saved'); setEditing(null); await load() }
    setSaving(false)
  }

  async function remove(id: string) {
    const { error } = await supabase.from('insurance_policies').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setEditing(null); await load()
  }

  const rentalName = useMemo(() => new Map(rentals.map(r => [r.id, r.name])), [rentals])

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><LoadingSpinner /></div>

  const totalYear = policies.filter(p => p.holder !== 'partner').reduce((s, p) => s + (p.premium_total ?? 0), 0)

  return (
    <div style={{ padding: 'clamp(16px, 4vw, 28px)', maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <IconShieldCheck size={24} style={{ color: 'var(--primary)' }} />
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Insurance</h1>
      </div>
      <p style={{ ...SUB, marginBottom: 16, maxWidth: 680 }}>
        Upload a policy schedule and Fennec checks it: that it matches your situation, whether the sum insured looks right, what you can save, and where to get other quotes. The document isn&apos;t kept, and names, policy and bank account numbers aren&apos;t stored. General information, not advice.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <input ref={fileInput} type="file" accept="application/pdf,image/*" hidden onChange={e => readFile(e.target.files?.[0])} />
        <button type="button" disabled={reading} onClick={() => fileInput.current?.click()}
          style={{ ...BTN, background: 'var(--primary)', color: 'white', border: 'none', padding: '9px 14px', fontSize: 13 }}>
          {reading ? <>Reading…</> : <><IconUpload size={15} /> Upload a policy schedule</>}
        </button>
        <button type="button" style={{ ...BTN, padding: '9px 14px', fontSize: 13 }} onClick={() => setEditing({ id: null, draft: EMPTY_POLICY })}>
          <IconPlus size={15} /> Add one by hand
        </button>
      </div>
      <p style={{ ...SUB, marginTop: -12, marginBottom: 20 }}>Add your partner&apos;s policies by hand (insurer and type is enough) so Fennec can spot bundling discounts.</p>

      {editing && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <h2 style={{ ...H2, marginBottom: 12 }}>{editing.id ? 'Edit policy' : 'Check and save'}</h2>
          <PolicyForm initial={editing.draft} rentals={rentals} saving={saving} onSave={save} onCancel={() => setEditing(null)}
            onDelete={editing.id ? () => remove(editing.id!) : undefined} />
        </div>
      )}

      {policies.length === 0 && !editing && (
        <div className="card" style={{ padding: 20 }}><p style={SUB}>No policies yet. Upload your home, landlord, contents or car policy schedule to start.</p></div>
      )}

      {policies.length > 0 && (
        <p style={{ ...SUB, marginBottom: 12 }}>{policies.length} polic{policies.length === 1 ? 'y' : 'ies'}{totalYear ? ` · yours cost ${money(totalYear)} a year` : ''}</p>
      )}

      {policies.map(p => {
        const others = policies.filter(o => o.id !== p.id)
        const findings = checkPolicy(p, { paidLast12: paid[p.id] ?? null, rentalName: p.rental_property_id ? rentalName.get(p.rental_property_id) : null, others })
        const d = p.details ?? {}
        const days = p.renewal_date ? daysUntil(p.renewal_date) : null
        const text = policyText(p, findings, p.rental_property_id ? rentalName.get(p.rental_property_id) : null)
        return (
          <div key={p.id} className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <h2 style={H2}>{p.insurer} · {KIND_LABEL[p.kind]}{p.label ? ` · ${p.label}` : ''}</h2>
                <p style={SUB}>
                  {p.holder === 'partner' ? "Partner's · " : p.holder === 'joint' ? 'Joint · ' : ''}
                  {d.cover_level ? `${d.cover_level} · ` : ''}{p.premium_total ? `${money(p.premium_total)} a year` : 'Premium not entered'}
                  {p.instalment && p.pay_frequency ? ` (${money(p.instalment)} ${p.pay_frequency})` : ''}
                  {p.renewal_date ? ` · renews ${fmtDate(p.renewal_date)}${days !== null && days >= 0 && days <= 60 ? ` (${days} days)` : ''}` : ''}
                </p>
              </div>
              <button type="button" style={BTN} onClick={() => setEditing({ id: p.id, draft: p })}><IconEdit size={14} /> Edit</button>
            </div>

            {p.holder !== 'partner' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, margin: '14px 0' }}>
                {[
                  ['Sum insured', money(p.sum_insured)],
                  ['Excess', money(p.excess)],
                  ['Insurer\'s premium', money(p.base_premium)],
                  ['Levies', money(p.levies)],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{k}</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {p.holder !== 'partner' && (
              <div style={{ display: 'grid', gap: 8 }}>
                {findings.map((f, i) => (
                  <div key={i} style={{ fontSize: 13, lineHeight: 1.55 }}>
                    <span style={{ color: LEVEL[f.level].color, fontWeight: 600 }}>{LEVEL[f.level].icon} {f.title}.</span>{' '}
                    <span style={{ color: 'var(--text2)' }}>{f.detail}</span>
                  </div>
                ))}
              </div>
            )}

            {p.holder !== 'partner' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                <button type="button" style={BTN} onClick={() => askFennec(`Look over my ${p.insurer} ${KIND_LABEL[p.kind].toLowerCase()} policy. What should I change or ask about, and is it worth shopping around?\n\n${text}`)}>Ask Fennec about it</button>
                <button type="button" style={BTN} onClick={() => askFennec(`Draft a short, polite email from me to ${p.insurer} about this policy. Update anything that's wrong (especially who lives at the property), and ask for the quotes and options in Fennec's check. Leave [brackets] for details I need to fill in, like my postal address, the date things changed and the policy number. Don't include bank account numbers.\n\n${text}`)}>
                  <IconMail size={14} /> Draft an email to {p.insurer}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
