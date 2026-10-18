'use client'
export const dynamic = 'force-dynamic'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { GmailPanel } from '@/components/bills/GmailPanel'
import {
  FREQS, advanceDate, daysUntil, matchEmailsToBills, isPayable, emailName,
  type Bill, type EmailItem, type Freq,
} from '@/lib/bills'
import { IconPlus, IconCheck, IconTrash, IconX, IconRepeat, IconMail, IconChevronDown } from '@tabler/icons-react'
import { toast } from 'sonner'

const supabase = createClient()
const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })
const fmtDay = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Annual multiplier for the monthly total
const perYear: Record<Freq, number> = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, annually: 1 }

type Row =
  | { kind: 'bill'; due: string; bill: Bill; email?: EmailItem }
  | { kind: 'email'; due: string | null; email: EmailItem }

const EMPTY_FORM = { name: '', amount: '', frequency: 'monthly' as Freq, next_due_date: '', owner: 'joint' }

function BillsPageInner() {
  const searchParams = useSearchParams()
  const [bills, setBills] = useState<Bill[]>([])
  const [emails, setEmails] = useState<EmailItem[]>([])
  const [gmail, setGmail] = useState<{ connected: boolean; email: string | null; lastScanned: string | null }>({ connected: false, email: null, lastScanned: null })
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [fromEmail, setFromEmail] = useState<EmailItem | null>(null) // set when "Make recurring" prefilled the form
  const [saving, setSaving] = useState(false)
  const [showSettled, setShowSettled] = useState(false)

  useEffect(() => {
    if (searchParams.get('gmail_connected')) toast.success('Gmail connected. Press "Scan email" to find your bills.')
    const err = searchParams.get('gmail_error')
    if (err) toast.error(`Gmail: ${err}`)
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('fin_bills').select('*').eq('is_active', true).order('next_due_date')
    if (error) toast.error(error.message)
    else setBills(data || [])
    setLoading(false)
    // Email is an add-on: if it isn't set up or the backend is unreachable, bills still work.
    try {
      const s = await api.gmailStatus()
      setGmail({ connected: s.connected, email: s.email, lastScanned: s.lastScanned })
      if (s.connected) setEmails((await api.gmailItems()).items)
    } catch { /* leave email off */ }
  }

  // ── Gmail ──
  async function connectGmail() {
    try { window.location.href = (await api.gmailAuthUrl()).url }
    catch (e: any) { toast.error(e.message) }
  }
  async function scan() {
    setScanning(true)
    try {
      const r = await api.gmailScan()
      toast.success(`Scanned ${r.scanned} emails, found ${r.items.length} items${r.settled ? `, ${r.settled} already paid` : ''}`)
      await load()
    } catch (e: any) { toast.error(e.message) }
    setScanning(false)
  }
  async function disconnectGmail() {
    if (!confirm('Disconnect Gmail? Bills you added stay; email-found items stop updating.')) return
    try { await api.gmailDisconnect(); setGmail({ connected: false, email: null, lastScanned: null }); setEmails([]); toast.success('Gmail disconnected') }
    catch (e: any) { toast.error(e.message) }
  }
  async function updateEmail(item: EmailItem, patch: { dismissed?: boolean; paid?: boolean }) {
    const before = emails
    setEmails(prev => prev.map(e => e.id === item.id ? { ...e, ...patch } : e))
    try { await api.gmailUpdateItem(item.id, patch) }
    catch (e: any) { setEmails(before); toast.error(`Couldn't update: ${e.message}`) }
  }

  // ── Recurring bills ──
  async function markBillPaid(bill: Bill, email?: EmailItem) {
    const next = advanceDate(bill.next_due_date, bill.frequency)
    const { error } = await supabase.from('fin_bills').update({ next_due_date: next }).eq('id', bill.id)
    if (error) { toast.error(error.message); return }
    setBills(prev => prev.map(b => b.id === bill.id ? { ...b, next_due_date: next } : b))
    // The email statement for this cycle is paid too, so it doesn't reappear on its own.
    if (email) await updateEmail(email, { paid: true })
    toast.success(`${bill.name} paid · next due ${fmtDay(next)}`)
  }

  async function deleteBill(id: string) {
    const { error } = await supabase.from('fin_bills').update({ is_active: false }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setBills(prev => prev.filter(b => b.id !== id))
  }

  function makeRecurring(item: EmailItem) {
    setForm({
      name: item.vendor,
      amount: item.amount != null ? String(item.amount) : '',
      frequency: 'monthly',
      next_due_date: item.due_date ?? '',
      owner: 'joint',
    })
    setFromEmail(item)
    setShowAdd(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
    else {
      toast.success(fromEmail ? `${form.name.trim()} is now a recurring bill. Future emails will attach to it.` : 'Bill added')
      setForm(EMPTY_FORM); setFromEmail(null); setShowAdd(false)
      await load()
    }
    setSaving(false)
  }

  // ── Merge ──
  const { rows, owed, settled } = useMemo(() => {
    const open = emails.filter(e => !e.paid && !e.dismissed)
    const { attached, standalone } = matchEmailsToBills(bills, open.filter(isPayable))
    const rows: Row[] = [
      ...bills.map(b => ({ kind: 'bill' as const, due: b.next_due_date, bill: b, email: attached.get(b.id) })),
      ...standalone.map(e => ({ kind: 'email' as const, due: e.due_date, email: e })),
    ].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
    const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    return {
      rows,
      owed: open.filter(e => !isPayable(e)),
      settled: emails.filter(e => e.paid && !e.dismissed && (e.paid_date ?? '9999') >= monthAgo),
    }
  }, [bills, emails])

  const totalMonthly = bills.reduce((s, b) => s + Number(b.amount) * perYear[b.frequency] / 12, 0)
  const due30 = rows.filter(r => r.due && daysUntil(r.due) <= 30)
  const due30Total = due30.reduce((s, r) => s + Number(r.kind === 'bill' ? (r.email?.amount ?? r.bill.amount) : r.email.amount ?? 0), 0)

  const groups: { title: string; rows: Row[] }[] = [
    { title: 'Overdue', rows: rows.filter(r => r.due && daysUntil(r.due) < 0) },
    { title: 'Next 7 days', rows: rows.filter(r => r.due && daysUntil(r.due) >= 0 && daysUntil(r.due) <= 7) },
    { title: 'Later', rows: rows.filter(r => r.due && daysUntil(r.due) > 7) },
    { title: 'No due date', rows: rows.filter(r => !r.due) },
  ].filter(g => g.rows.length)

  return (
    <div className="inbox-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Upcoming bills</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>
            {currency.format(due30Total)} due in the next 30 days · recurring bills {currency.format(totalMonthly)}/month
          </p>
        </div>
        <button onClick={() => { setShowAdd(s => !s); setFromEmail(null); setForm(EMPTY_FORM) }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <IconPlus size={14} /> Add bill
        </button>
      </div>

      <GmailPanel connected={gmail.connected} email={gmail.email} lastScanned={gmail.lastScanned}
        scanning={scanning} onConnect={connectGmail} onScan={scan} onDisconnect={disconnectGmail} />

      {showAdd && (
        <form onSubmit={addBill} className="card" style={{ marginBottom: 16, padding: 18 }}>
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{fromEmail ? 'Make this a recurring bill' : 'New bill'}</p>
          {fromEmail && <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>Filled in from the email. Check how often it repeats, then save.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12, marginTop: fromEmail ? 0 : 12 }}>
            {[
              { label: 'Name', el: <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Netflix" style={inp} /> },
              { label: 'Amount (NZD)', el: <input required type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" style={inp} /> },
              { label: 'How often', el: <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value as Freq }))} style={inp}>{FREQS.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}</select> },
              { label: 'Next due date', el: <input required type="date" value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} style={inp} /> },
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
              {saving ? 'Saving…' : fromEmail ? 'Save recurring bill' : 'Add bill'}
            </button>
            <button type="button" onClick={() => { setShowAdd(false); setFromEmail(null) }} style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><LoadingSpinner size={28} /></div> : (
        <>
          {rows.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: 'var(--text2)', fontSize: 14 }}>
                No upcoming bills. {gmail.connected ? 'Scan your email or add one above.' : 'Add one above, or connect Gmail to find them automatically.'}
              </p>
            </div>
          ) : groups.map(g => (
            <div key={g.title} style={{ marginBottom: 16 }}>
              <p className="bills-group">{g.title} · {g.rows.length}</p>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {g.rows.map((r, i) => r.kind === 'bill'
                  ? <BillRow key={r.bill.id} bill={r.bill} email={r.email} last={i === g.rows.length - 1}
                      onPaid={() => markBillPaid(r.bill, r.email)} onDelete={() => deleteBill(r.bill.id)} />
                  : <EmailRow key={r.email.id} item={r.email} last={i === g.rows.length - 1}
                      onPaid={() => updateEmail(r.email, { paid: true })}
                      onDismiss={() => updateEmail(r.email, { dismissed: true })}
                      onRecurring={() => makeRecurring(r.email)} />)}
              </div>
            </div>
          ))}

          {owed.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p className="bills-group">Owed to you (from email) · {owed.length}</p>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {owed.map((e, i) => (
                  <EmailRow key={e.id} item={e} last={i === owed.length - 1}
                    onPaid={() => updateEmail(e, { paid: true })}
                    onDismiss={() => updateEmail(e, { dismissed: true })} />
                ))}
              </div>
            </div>
          )}

          {settled.length > 0 && (
            <div>
              <button onClick={() => setShowSettled(s => !s)} className="bills-group" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Paid from email, last 30 days · {settled.length}
                <IconChevronDown size={13} style={{ transform: showSettled ? 'rotate(180deg)' : 'none' }} />
              </button>
              {showSettled && (
                <div className="card" style={{ padding: 0, overflow: 'hidden', opacity: 0.85 }}>
                  {settled.map((e, i) => (
                    <EmailRow key={e.id} item={e} last={i === settled.length - 1}
                      onPaid={() => updateEmail(e, { paid: false })}
                      onDismiss={() => updateEmail(e, { dismissed: true })} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DueLabel({ due, paid }: { due: string | null; paid?: boolean }) {
  if (!due) return null
  const days = daysUntil(due)
  const color = paid ? 'var(--text3)' : days < 0 ? 'var(--red)' : days <= 3 ? 'var(--amber)' : 'var(--text2)'
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : fmtDay(due)
  return <span style={{ color }}>{!paid && days < 0 ? `Overdue · was due ${fmtDay(due)}` : `Due ${when}`}</span>
}

const tag = (text: string, color = 'var(--text2)', bg = 'var(--surface2)') => (
  <span style={{ fontSize: 9.5, padding: '2px 6px', borderRadius: 5, background: bg, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}>{text}</span>
)

function BillRow({ bill, email, last, onPaid, onDelete }: { bill: Bill; email?: EmailItem; last: boolean; onPaid: () => void; onDelete: () => void }) {
  const amount = email?.amount ?? bill.amount
  return (
    <div className="inbox-row" style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div style={{ width: 24, textAlign: 'center', flexShrink: 0, color: 'var(--text3)' }} aria-hidden><IconRepeat size={16} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>{bill.name}</span>
          {tag(bill.frequency)}
          {bill.owner !== 'joint' && tag(bill.owner)}
          {email && tag('Email received', '#4285F4', 'rgba(66,133,244,0.12)')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
          <DueLabel due={bill.next_due_date} />
          {email && email.amount != null && Number(email.amount) !== Number(bill.amount) && (
            <span> · this one is {currency.format(Number(email.amount))} (usually {currency.format(Number(bill.amount))})</span>
          )}
          {email?.reference && <span style={{ color: 'var(--text3)' }}> · Ref {email.reference}</span>}
        </div>
      </div>
      <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{currency.format(Number(amount))}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
        <button onClick={onPaid} title="Mark as paid (moves to the next due date)" className="inbox-action"><IconCheck size={14} /></button>
        <button onClick={onDelete} title="Remove recurring bill" className="inbox-action"><IconTrash size={14} /></button>
      </div>
    </div>
  )
}

function EmailRow({ item, last, onPaid, onDismiss, onRecurring }: { item: EmailItem; last: boolean; onPaid: () => void; onDismiss: () => void; onRecurring?: () => void }) {
  const payable = isPayable(item)
  const meta: React.ReactNode[] = []
  if (item.description) meta.push(item.description)
  if (!payable && item.counterparty && item.vendor !== item.counterparty) meta.push(`invoiced by ${item.vendor}`)
  if (item.paid) meta.push(`${payable ? 'Paid' : 'Received'}${item.paid_date ? ` ${fmtDay(item.paid_date)}` : ''}${item.matched_transaction_id ? ' · matched to bank' : ''}`)
  else if (item.due_date) meta.push(<DueLabel key="due" due={item.due_date} />)
  if (item.reference) meta.push(<span key="ref" style={{ color: 'var(--text3)' }}>Ref {item.reference}</span>)

  return (
    <div className="inbox-row" style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div style={{ width: 24, textAlign: 'center', flexShrink: 0, color: '#4285F4' }} aria-hidden><IconMail size={16} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>{emailName(item)}</span>
          {tag('From email', '#4285F4', 'rgba(66,133,244,0.12)')}
          {!payable && tag('Owed to you', 'var(--green)', 'var(--green-light)')}
          {item.category === 'business' && tag('Business', '#F97316', 'rgba(249,115,22,0.12)')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.45 }}>
          {meta.map((m, i) => <span key={i}>{i > 0 && <span style={{ color: 'var(--text3)' }}> · </span>}{m}</span>)}
        </div>
      </div>
      {item.amount != null && (
        <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, flexShrink: 0, color: payable ? 'var(--text)' : 'var(--green)' }}>
          {payable ? '' : '+'}{currency.format(Number(item.amount))}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
        <button onClick={onPaid} title={item.paid ? 'Mark as not paid' : payable ? 'Mark as paid' : 'Mark as received'} className="inbox-action">
          {item.paid ? <IconX size={14} /> : <IconCheck size={14} />}
        </button>
        {onRecurring && <button onClick={onRecurring} title="Make this a recurring bill" className="inbox-action"><IconRepeat size={14} /></button>}
        {!item.paid && <button onClick={onDismiss} title="Dismiss (not a bill)" className="inbox-action"><IconX size={14} /></button>}
      </div>
    </div>
  )
}

const inp: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%',
}

export default function BillsPage() {
  return <Suspense><BillsPageInner /></Suspense>
}
