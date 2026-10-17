'use client'
export const dynamic = 'force-dynamic'
import { localDate } from '@/lib/utils'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconPlus, IconX, IconPrinter, IconEdit, IconTrash, IconCheck, IconFileInvoice, IconChevronDown } from '@tabler/icons-react'
import { toast } from 'sonner'

const supabase = createClient()
const currency = (n: number) => new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(n)
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' })
const isoDate = (d: Date) => localDate(d)

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft:   { label: 'Draft',   color: '#6B7280', bg: '#6B728022' },
  sent:    { label: 'Sent',    color: '#0EA5E9', bg: '#0EA5E922' },
  paid:    { label: 'Paid',    color: '#22C55E', bg: '#22C55E22' },
  overdue: { label: 'Overdue', color: '#EF4444', bg: '#EF444422' },
}

interface BizSettings {
  business_name: string; business_address: string; business_email: string
  business_phone: string; ird_number: string; gst_number: string; bank_account: string
  payment_terms: number; gst_registered: boolean
}
interface InvoiceItem { id?: string; description: string; quantity: number; unit_price: number; sort_order?: number }
interface Invoice {
  id: string; invoice_number: string; client_name: string; client_email: string | null
  client_address: string | null; issue_date: string; due_date: string | null
  status: 'draft' | 'sent' | 'paid' | 'overdue'; notes: string | null
  gst_excluded: boolean
  items?: InvoiceItem[]
}

const EMPTY_ITEM: InvoiceItem = { description: '', quantity: 1, unit_price: 0 }
const DEFAULT_SETTINGS: BizSettings = {
  business_name: '', business_address: '', business_email: '', business_phone: '',
  ird_number: '', gst_number: '', bank_account: '', payment_terms: 30, gst_registered: true,
}

function calcTotals(items: InvoiceItem[], gstRegistered: boolean) {
  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) * Number(i.unit_price)), 0)
  const gst = gstRegistered ? subtotal * 0.15 : 0
  return { subtotal, gst, total: subtotal + gst }
}

function nextInvoiceNumber(existing: Invoice[]): string {
  const nums = existing.map(i => parseInt(i.invoice_number.replace(/\D/g, '')) || 0)
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `INV-${String(next).padStart(3, '0')}`
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, onChange }: { status: string; onChange?: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const s = STATUS[status] || STATUS.draft
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => onChange && setOpen(v => !v)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, border: `1px solid ${s.color}44`, background: s.bg, color: s.color, fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, cursor: onChange ? 'pointer' : 'default' }}>
        {s.label} {onChange && <IconChevronDown size={10} />}
      </button>
      {open && onChange && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 100, minWidth: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
          {Object.entries(STATUS).map(([key, val]) => (
            <button key={key} onClick={() => { onChange(key); setOpen(false) }}
              style={{ display: 'block', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: val.color, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, textAlign: 'left' }}>
              {val.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Print view ────────────────────────────────────────────────────────────────
function PrintView({ invoice, settings, onClose }: { invoice: Invoice; settings: BizSettings; onClose: () => void }) {
  const { subtotal, gst, total } = calcTotals(invoice.items || [], settings.gst_registered && !invoice.gst_excluded)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', color: '#111', borderRadius: 12, width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
          <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, background: '#5B7CF0', color: 'white', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>
            <IconPrinter size={14} /> Print / Save PDF
          </button>
          <button onClick={onClose} style={{ padding: '7px 12px', borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <IconX size={14} />
          </button>
        </div>

        {/* Invoice document */}
        <div id="invoice-print" style={{ padding: 48, fontFamily: 'sans-serif', color: '#111' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 40 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px', color: '#111' }}>
                {settings.business_name || 'Your Business'}
              </h1>
              {settings.business_address && <p style={{ fontSize: 12, color: '#555', margin: '2px 0', whiteSpace: 'pre-line' }}>{settings.business_address}</p>}
              {settings.business_email && <p style={{ fontSize: 12, color: '#555', margin: '2px 0' }}>{settings.business_email}</p>}
              {settings.business_phone && <p style={{ fontSize: 12, color: '#555', margin: '2px 0' }}>{settings.business_phone}</p>}
              {settings.gst_registered && !invoice.gst_excluded && settings.gst_number && <p style={{ fontSize: 11, color: '#777', margin: '6px 0 0' }}>GST No. {settings.gst_number}</p>}
              {settings.ird_number && <p style={{ fontSize: 11, color: '#777', margin: '2px 0' }}>IRD No. {settings.ird_number}</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 11, color: '#777', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Tax Invoice</p>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px', color: '#5B7CF0' }}>{invoice.invoice_number}</h2>
              <p style={{ fontSize: 12, color: '#555', margin: '2px 0' }}>Issued: {fmtDate(invoice.issue_date)}</p>
              {invoice.due_date && <p style={{ fontSize: 12, color: '#555', margin: '2px 0' }}>Due: {fmtDate(invoice.due_date)}</p>}
              <div style={{ marginTop: 8 }}>
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: STATUS[invoice.status]?.bg || '#f3f4f6', color: STATUS[invoice.status]?.color || '#555', fontSize: 11, fontWeight: 700 }}>
                  {STATUS[invoice.status]?.label || invoice.status}
                </span>
              </div>
            </div>
          </div>

          {/* Bill to */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Bill To</p>
            <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px' }}>{invoice.client_name}</p>
            {invoice.client_email && <p style={{ fontSize: 12, color: '#555', margin: '2px 0' }}>{invoice.client_email}</p>}
            {invoice.client_address && <p style={{ fontSize: 12, color: '#555', margin: '2px 0', whiteSpace: 'pre-line' }}>{invoice.client_address}</p>}
          </div>

          {/* Line items */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #111' }}>
                {['Description', 'Qty', 'Unit Price', 'Total'].map((h, i) => (
                  <th key={h} style={{ padding: '8px 0', fontSize: 11, textAlign: i === 0 ? 'left' : 'right', color: '#555', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 0', fontSize: 13 }}>{item.description}</td>
                  <td style={{ padding: '10px 0', fontSize: 13, textAlign: 'right' }}>{item.quantity}</td>
                  <td style={{ padding: '10px 0', fontSize: 13, textAlign: 'right' }}>{currency(item.unit_price)}</td>
                  <td style={{ padding: '10px 0', fontSize: 13, textAlign: 'right', fontWeight: 600 }}>{currency(item.quantity * item.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
            <div style={{ minWidth: 260 }}>
              {[
                { label: 'Subtotal', value: currency(subtotal) },
                ...(settings.gst_registered ? [{ label: 'GST (15%)', value: currency(gst) }] : []),
                { label: 'Total', value: currency(total), bold: true },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: (row as any).bold ? '2px solid #111' : undefined, marginTop: (row as any).bold ? 4 : 0 }}>
                  <span style={{ fontSize: 13, color: (row as any).bold ? '#111' : '#555' }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: (row as any).bold ? 800 : 400 }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Payment details */}
          {settings.bank_account && (
            <div style={{ padding: 16, borderRadius: 8, background: '#f9fafb', marginBottom: 24 }}>
              <p style={{ fontSize: 11, color: '#777', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Payment Details</p>
              <p style={{ fontSize: 12, margin: '2px 0' }}><strong>Bank account:</strong> {settings.bank_account}</p>
              <p style={{ fontSize: 12, margin: '2px 0' }}><strong>Reference:</strong> {invoice.invoice_number}</p>
              {settings.payment_terms && <p style={{ fontSize: 12, margin: '6px 0 0', color: '#555' }}>Payment due within {settings.payment_terms} days of invoice date.</p>}
            </div>
          )}

          {/* Notes */}
          {invoice.notes && (
            <div>
              <p style={{ fontSize: 11, color: '#777', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>Notes</p>
              <p style={{ fontSize: 12, color: '#555', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{invoice.notes}</p>
            </div>
          )}
        </div>
      </div>

      <style>{`@media print { body > *:not(#invoice-print) { display: none !important; } #invoice-print { padding: 0 !important; } }`}</style>
    </div>
  )
}

// ── Create / Edit modal ───────────────────────────────────────────────────────
function InvoiceModal({ invoice, settings, allInvoices, onClose, onSaved }: {
  invoice: Invoice | null; settings: BizSettings; allInvoices: Invoice[]
  onClose: () => void; onSaved: () => void
}) {
  const isNew = !invoice
  const [form, setForm] = useState({
    invoice_number: invoice?.invoice_number ?? nextInvoiceNumber(allInvoices),
    client_name: invoice?.client_name ?? '',
    client_email: invoice?.client_email ?? '',
    client_address: invoice?.client_address ?? '',
    issue_date: invoice?.issue_date ?? isoDate(new Date()),
    due_date: invoice?.due_date ?? isoDate(new Date(Date.now() + settings.payment_terms * 86400000)),
    status: invoice?.status ?? 'draft',
    notes: invoice?.notes ?? '',
    gst_excluded: invoice?.gst_excluded ?? false,
  })
  const [items, setItems] = useState<InvoiceItem[]>(
    invoice?.items?.length ? invoice.items : [{ ...EMPTY_ITEM }]
  )
  const [saving, setSaving] = useState(false)

  const gstActive = settings.gst_registered && !form.gst_excluded
  const { subtotal, gst, total } = calcTotals(items, gstActive)

  function setItem(i: number, field: keyof InvoiceItem, val: string | number) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))
  }
  function addItem() { setItems(prev => [...prev, { ...EMPTY_ITEM }]) }
  function removeItem(i: number) { setItems(prev => prev.filter((_, idx) => idx !== i)) }

  async function save(status?: string) {
    if (!form.client_name.trim()) { toast.error('Client name is required'); return }
    if (items.every(i => !i.description.trim())) { toast.error('Add at least one line item'); return }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const payload = { ...form, status: status || form.status, user_id: user.id }
      let invoiceId: string

      if (isNew) {
        const { data, error } = await supabase.from('business_invoices').insert(payload).select('id').single()
        if (error) throw error
        invoiceId = data.id
      } else {
        const { error } = await supabase.from('business_invoices').update(payload).eq('id', invoice!.id)
        if (error) throw error
        invoiceId = invoice!.id
        await supabase.from('business_invoice_items').delete().eq('invoice_id', invoiceId)
      }

      const validItems = items.filter(i => i.description.trim())
      if (validItems.length) {
        const { error } = await supabase.from('business_invoice_items').insert(
          validItems.map((it, idx) => ({ invoice_id: invoiceId, description: it.description, quantity: Number(it.quantity), unit_price: Number(it.unit_price), sort_order: idx }))
        )
        if (error) throw error
      }

      toast.success(isNew ? 'Invoice created' : 'Invoice updated')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    }
    setSaving(false)
  }

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { fontSize: 11, color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.07em', display: 'block', marginBottom: 4 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 720, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', marginBottom: 20 }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16, margin: 0 }}>{isNew ? 'New Invoice' : `Edit ${form.invoice_number}`}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', lineHeight: 0 }}><IconX size={18} /></button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Invoice meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Invoice #</label>
              <input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Issue Date</label>
              <input type="date" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          {/* Client */}
          <div style={{ padding: 16, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', marginBottom: 20 }}>
            <p style={{ ...labelStyle, marginBottom: 10 }}>Client Details</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ ...labelStyle, fontSize: 10 }}>Name *</label>
                <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Client or company name" style={inputStyle} />
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: 10 }}>Email</label>
                <input value={form.client_email} onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))} placeholder="client@example.com" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={{ ...labelStyle, fontSize: 10 }}>Address</label>
              <textarea value={form.client_address} onChange={e => setForm(f => ({ ...f, client_address: e.target.value }))} placeholder="123 Main St, Auckland" rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
            </div>
          </div>

          {/* Line items */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ ...labelStyle, marginBottom: 10 }}>Line Items</p>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 110px 90px 32px', gap: 0, background: 'var(--surface2)', padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
                {['Description', 'Qty', 'Unit Price', 'Total', ''].map(h => (
                  <span key={h} style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, fontFamily: 'Syne, sans-serif', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</span>
                ))}
              </div>
              {items.map((item, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 110px 90px 32px', gap: 0, padding: '8px 12px', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                  <input value={item.description} onChange={e => setItem(i, 'description', e.target.value)} placeholder="Service description…"
                    style={{ ...inputStyle, width: 'auto', marginRight: 8 }} />
                  <input type="number" value={item.quantity} min={0} onChange={e => setItem(i, 'quantity', e.target.value)}
                    style={{ ...inputStyle, width: 'auto', marginRight: 8, textAlign: 'right' }} />
                  <input type="number" value={item.unit_price} min={0} step="0.01" onChange={e => setItem(i, 'unit_price', e.target.value)}
                    style={{ ...inputStyle, width: 'auto', marginRight: 8, textAlign: 'right' }} />
                  <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', fontWeight: 600, textAlign: 'right', paddingRight: 8 }}>
                    {currency(Number(item.quantity) * Number(item.unit_price))}
                  </span>
                  <button onClick={() => removeItem(i)} disabled={items.length === 1}
                    style={{ background: 'none', border: 'none', cursor: items.length === 1 ? 'default' : 'pointer', color: 'var(--text3)', opacity: items.length === 1 ? 0.3 : 1, lineHeight: 0 }}>
                    <IconX size={13} />
                  </button>
                </div>
              ))}
              <div style={{ padding: '8px 12px' }}>
                <button onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  <IconPlus size={13} /> Add line item
                </button>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
            <div style={{ minWidth: 220 }}>
              {[
                { label: 'Subtotal', val: currency(subtotal) },
                ...(settings.gst_registered ? [{ label: 'GST (15%)', val: currency(gst) }] : []),
                { label: 'Total', val: currency(total), bold: true },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: (row as any).bold ? '1px solid var(--border)' : undefined, marginTop: (row as any).bold ? 4 : 0 }}>
                  <span style={{ fontSize: 13, color: (row as any).bold ? 'var(--text)' : 'var(--text2)' }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', fontWeight: (row as any).bold ? 700 : 400 }}>{row.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* GST toggle */}
          {settings.gst_registered && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: form.gst_excluded ? '#F59E0B11' : 'var(--surface2)', border: `1px solid ${form.gst_excluded ? '#F59E0B44' : 'var(--border)'}` }}>
              <input type="checkbox" checked={form.gst_excluded} onChange={e => setForm(f => ({ ...f, gst_excluded: e.target.checked }))} />
              <div>
                <span style={{ fontWeight: 600 }}>Exclude GST from this invoice</span>
                <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 6 }}>
                  {form.gst_excluded ? '— prices shown ex-GST, no GST line on invoice' : '— GST (15%) will be added to subtotal'}
                </span>
              </div>
            </label>
          )}

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Notes / Terms</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Payment terms, bank details note, thank you message…" rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>
              Cancel
            </button>
            <button onClick={() => save('draft')} disabled={saving}
              style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
              {saving ? <LoadingSpinner size={14} /> : 'Save Draft'}
            </button>
            <button onClick={() => save('sent')} disabled={saving}
              style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              {saving ? <LoadingSpinner size={14} /> : <><IconCheck size={14} /> Mark as Sent</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Settings modal ────────────────────────────────────────────────────────────
function SettingsModal({ settings, onClose, onSaved }: { settings: BizSettings; onClose: () => void; onSaved: (s: BizSettings) => void }) {
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const { error } = await supabase.from('business_settings').upsert({ ...form, user_id: user.id }, { onConflict: 'user_id' })
      if (error) throw error
      toast.success('Business details saved')
      onSaved(form)
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { fontSize: 10, color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.07em', display: 'block', marginBottom: 4 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15, margin: 0 }}>Business Details</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', lineHeight: 0 }}><IconX size={16} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={labelStyle}>Business Name</label><input value={form.business_name} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} style={inputStyle} /></div>
            <div><label style={labelStyle}>Email</label><input value={form.business_email} onChange={e => setForm(f => ({ ...f, business_email: e.target.value }))} style={inputStyle} /></div>
          </div>
          <div><label style={labelStyle}>Address</label><textarea value={form.business_address} onChange={e => setForm(f => ({ ...f, business_address: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={labelStyle}>Phone</label><input value={form.business_phone} onChange={e => setForm(f => ({ ...f, business_phone: e.target.value }))} style={inputStyle} /></div>
            <div><label style={labelStyle}>Bank Account</label><input value={form.bank_account} onChange={e => setForm(f => ({ ...f, bank_account: e.target.value }))} placeholder="12-3456-7890123-00" style={inputStyle} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
            <div><label style={labelStyle}>IRD Number</label><input value={form.ird_number} onChange={e => setForm(f => ({ ...f, ird_number: e.target.value }))} placeholder="123-456-789" style={inputStyle} /></div>
            <div><label style={labelStyle}>GST Number</label><input value={form.gst_number} onChange={e => setForm(f => ({ ...f, gst_number: e.target.value }))} placeholder="123-456-789" style={inputStyle} /></div>
            <div><label style={labelStyle}>Pay Terms</label>
              <select value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: Number(e.target.value) }))}
                style={{ ...inputStyle }}>
                {[7, 14, 20, 30, 60].map(d => <option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={form.gst_registered} onChange={e => setForm(f => ({ ...f, gst_registered: e.target.checked }))} />
            GST registered (adds 15% GST to invoices)
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>
              {saving ? <LoadingSpinner size={13} /> : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [settings, setSettings] = useState<BizSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Invoice | null | string>()
  const [viewing, setViewing] = useState<Invoice | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: inv }, { data: cfg }] = await Promise.all([
      supabase.from('business_invoices').select('*, items:business_invoice_items(*)').order('created_at', { ascending: false }),
      supabase.from('business_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ])
    setInvoices((inv as any) || [])
    if (cfg) setSettings({ ...DEFAULT_SETTINGS, ...cfg })
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from('business_invoices').update({ status }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: status as any } : i))
  }

  async function deleteInvoice(id: string) {
    if (!confirm('Delete this invoice? This cannot be undone.')) return
    const { error } = await supabase.from('business_invoices').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setInvoices(prev => prev.filter(i => i.id !== id))
    toast.success('Invoice deleted')
  }

  const totals = invoices.reduce((acc, inv) => {
    const { total } = calcTotals(inv.items || [], settings.gst_registered && !inv.gst_excluded)
    acc.all += total
    if (inv.status === 'paid') acc.paid += total
    if (inv.status === 'sent' || inv.status === 'overdue') acc.outstanding += total
    return acc
  }, { all: 0, paid: 0, outstanding: 0 })

  return (
    <div style={{ padding: 28, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Invoices</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Create, send, and track client invoices</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSettings(true)}
            style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            Business Details
          </button>
          <button onClick={() => setEditing('new')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>
            <IconPlus size={15} /> New Invoice
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {!loading && invoices.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Invoiced', v: totals.all, c: 'var(--text)' },
            { label: 'Outstanding', v: totals.outstanding, c: '#F59E0B' },
            { label: 'Paid', v: totals.paid, c: 'var(--green)' },
          ].map(k => (
            <div key={k.label} className="card" style={{ padding: '14px 18px' }}>
              <p style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>{k.label}</p>
              <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 20, color: k.c }}>{currency(k.v)}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><LoadingSpinner size={32} /></div>
      ) : invoices.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <IconFileInvoice size={36} style={{ color: 'var(--text3)', marginBottom: 14 }} />
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>No invoices yet</p>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>Create your first invoice to start tracking client payments.</p>
          <button onClick={() => setEditing('new')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>
            <IconPlus size={15} /> Create Invoice
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 90px 110px 90px 100px', gap: 0, padding: '10px 18px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
            {['Invoice', 'Client', 'Issued', 'Due', 'Total', 'Status'].map(h => (
              <span key={h} style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>{h}</span>
            ))}
          </div>
          {invoices.map((inv, i) => {
            const { total } = calcTotals(inv.items || [], settings.gst_registered && !inv.gst_excluded)
            return (
              <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 90px 110px 90px 100px', gap: 0, padding: '13px 18px', borderBottom: i < invoices.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>{inv.invoice_number}</span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{inv.client_name}</p>
                  {inv.client_email && <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0 }}>{inv.client_email}</p>}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>{fmtDate(inv.issue_date)}</span>
                <span style={{ fontSize: 12, color: inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'paid' ? 'var(--red)' : 'var(--text2)' }}>
                  {inv.due_date ? fmtDate(inv.due_date) : '—'}
                </span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 700 }}>{currency(total)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StatusBadge status={inv.status} onChange={s => updateStatus(inv.id, s)} />
                  <button onClick={() => setViewing({ ...inv })} title="View" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', lineHeight: 0, padding: 2 }}><IconPrinter size={13} /></button>
                  <button onClick={() => setEditing(inv)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', lineHeight: 0, padding: 2 }}><IconEdit size={13} /></button>
                  <button onClick={() => deleteInvoice(inv.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', lineHeight: 0, padding: 2 }}><IconTrash size={13} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {(editing != null) && (
        <InvoiceModal
          invoice={editing === 'new' ? null : editing as Invoice}
          settings={settings}
          allInvoices={invoices}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); load() }}
        />
      )}
      {viewing && (
        <PrintView invoice={viewing} settings={settings} onClose={() => setViewing(null)} />
      )}
      {showSettings && (
        <SettingsModal settings={settings} onClose={() => setShowSettings(false)} onSaved={s => { setSettings(s); setShowSettings(false) }} />
      )}
    </div>
  )
}
