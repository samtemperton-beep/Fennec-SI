'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconPlus, IconCheck, IconTrash } from '@tabler/icons-react'
import { toast } from 'sonner'

const supabase = createClient()
const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })
const dateFormat = new Intl.DateTimeFormat('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' })

const FREQS = ['weekly','fortnightly','monthly','quarterly','annually'] as const
type Freq = typeof FREQS[number]

function advanceDate(dateStr: string, freq: Freq) {
  const d = new Date(dateStr)
  if (freq === 'weekly') d.setDate(d.getDate() + 7)
  else if (freq === 'fortnightly') d.setDate(d.getDate() + 14)
  else if (freq === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (freq === 'quarterly') d.setMonth(d.getMonth() + 3)
  else d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.round((new Date(dateStr).getTime() - today.getTime()) / 86400000)
}

function urgencyStyle(days: number) {
  if (days < 0) return { color: 'var(--red)', label: 'Overdue' }
  if (days <= 3) return { color: 'var(--amber)', label: 'Due soon' }
  return { color: 'var(--text3)', label: null }
}

// Annual cost for sorting
const annualCost: Record<Freq, number> = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, annually: 1 }

interface Bill {
  id: string; name: string; amount: number; frequency: Freq
  next_due_date: string; owner: string; is_active: boolean
}

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', amount: '', frequency: 'monthly' as Freq, next_due_date: '', owner: 'joint' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('fin_bills').select('*').eq('is_active', true).order('next_due_date')
    if (error) toast.error(error.message)
    else setBills(data || [])
    setLoading(false)
  }

  async function markPaid(bill: Bill) {
    const next = advanceDate(bill.next_due_date, bill.frequency)
    const { error } = await supabase.from('fin_bills').update({ next_due_date: next }).eq('id', bill.id)
    if (error) { toast.error(error.message); return }
    setBills(prev => prev.map(b => b.id === bill.id ? { ...b, next_due_date: next } : b))
    toast.success(`${bill.name} marked as paid`)
  }

  async function deleteBill(id: string) {
    const { error } = await supabase.from('fin_bills').update({ is_active: false }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setBills(prev => prev.filter(b => b.id !== id))
  }

  async function addBill(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.amount || !form.next_due_date) return
    setSaving(true)
    const { error } = await supabase.from('fin_bills').insert({
      name: form.name.trim(), amount: Number(form.amount),
      frequency: form.frequency, next_due_date: form.next_due_date, owner: form.owner,
    })
    if (error) { toast.error(error.message) }
    else { toast.success('Bill added'); setForm({ name: '', amount: '', frequency: 'monthly', next_due_date: '', owner: 'joint' }); setShowAdd(false); await load() }
    setSaving(false)
  }

  const totalMonthly = bills.reduce((s, b) => s + Number(b.amount) * annualCost[b.frequency] / 12, 0)

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Bills</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Recurring payments · {currency.format(totalMonthly)}/month</p>
        </div>
        <button onClick={() => setShowAdd(s => !s)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <IconPlus size={14} /> Add Bill
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addBill} className="card" style={{ marginBottom: 20, padding: 20 }}>
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 16 }}>New Bill</p>
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12 }}>
            {[
              { label: 'Name', el: <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Netflix" style={inp} /> },
              { label: 'Amount (NZD)', el: <input required type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" style={inp} /> },
              { label: 'Frequency', el: <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value as Freq }))} style={inp}>{FREQS.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}</select> },
              { label: 'Next Due Date', el: <input required type="date" value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} style={inp} /> },
              { label: 'Owner', el: <select value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} style={inp}><option value="joint">Joint</option><option value="me">Me</option><option value="partner">Partner</option></select> },
            ].map(({ label, el }) => (
              <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
                {el}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="submit" disabled={saving} style={{ padding: '9px 20px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              {saving ? 'Saving…' : 'Add Bill'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><LoadingSpinner size={28} /></div> : (
        bills.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <p style={{ color: 'var(--text2)', fontSize: 14 }}>No active bills. Add one above.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {bills.map((b, i) => {
              const days = daysUntil(b.next_due_date)
              const urg = urgencyStyle(days)
              return (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i < bills.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>{b.name}</p>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>{b.frequency}</span>
                      {b.owner !== 'joint' && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>{b.owner}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: urg.color }}>{dateFormat.format(new Date(b.next_due_date))}</span>
                      {urg.label && <span style={{ fontSize: 10, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: urg.color }}>{urg.label}</span>}
                    </div>
                  </div>
                  <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{currency.format(b.amount)}</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => markPaid(b)} title="Mark as paid" style={{ padding: 7, borderRadius: 8, background: 'rgba(34,197,94,0.12)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.25)', cursor: 'pointer', lineHeight: 0 }}><IconCheck size={14} /></button>
                    <button onClick={() => deleteBill(b.id)} title="Remove" style={{ padding: 7, borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', lineHeight: 0 }}><IconTrash size={14} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}

const inp: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%',
}
