'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconMail, IconRefresh, IconCheck, IconX, IconBuildingBank, IconBriefcase, IconUser, IconExternalLink } from '@tabler/icons-react'
import { toast } from 'sonner'

const supabase = createClient()
const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })

const TYPE_ICONS: Record<string, string> = {
  invoice: '🧾', bill: '📄', rates: '🏛️', receipt: '✅',
  statement: '📊', mortgage: '🏠', insurance: '🛡️', subscription: '🔄', other: '📧',
}

const CAT_COLORS: Record<string, { bg: string; color: string; icon: typeof IconUser }> = {
  business:  { bg: '#F97316/10', color: '#F97316', icon: IconBriefcase },
  household: { bg: '#14B8A6/10', color: '#14B8A6', icon: IconBuildingBank },
  personal:  { bg: '#8B5CF6/10', color: '#8B5CF6', icon: IconUser },
}

interface ScannedItem {
  id: string
  email_id: string
  type: string
  category: 'business' | 'household' | 'personal'
  amount: number | null
  gst: number | null
  due_date: string | null
  description: string
  vendor: string
  reference: string | null
  paid: boolean
  scanned_at: string
  dismissed?: boolean
  direction?: 'payable' | 'receivable'
  counterparty?: string | null
  email_date?: string | null
  paid_date?: string | null
  matched_transaction_id?: string | null
}

function InboxPageInner() {
  const searchParams = useSearchParams()
  const [items, setItems] = useState<ScannedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [connected, setConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState<string | null>(null)
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'business' | 'household' | 'personal'>('all')

  useEffect(() => {
    const gmailConnected = searchParams.get('gmail_connected')
    const gmailError = searchParams.get('gmail_error')
    if (gmailConnected) toast.success('Gmail connected successfully!')
    if (gmailError) toast.error(`Gmail error: ${gmailError}`)
    load()
  }, [])

  async function load() {
    setLoading(true)
    const API = process.env.NEXT_PUBLIC_API_URL || ''
    const { data: { session } } = await supabase.auth.getSession()
    const headers = { Authorization: `Bearer ${session?.access_token}` }

    const [statusRes, itemsRes] = await Promise.all([
      fetch(`${API}/api/gmail/status`, { headers }),
      fetch(`${API}/api/gmail/items`, { headers }),
    ])

    if (statusRes.ok) {
      const s = await statusRes.json()
      setConnected(s.connected)
      setGmailEmail(s.email)
      setLastScanned(s.lastScanned)
    }
    if (itemsRes.ok) {
      const { items: i } = await itemsRes.json()
      setItems(i || [])
    }
    setLoading(false)
  }

  async function connectGmail() {
    const API = process.env.NEXT_PUBLIC_API_URL || ''
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(`${API}/api/gmail/auth-url`, { headers: { Authorization: `Bearer ${session?.access_token}` } })
    const { url, error } = await r.json()
    if (error) { toast.error(error); return }
    window.location.href = url
  }

  async function disconnect() {
    const API = process.env.NEXT_PUBLIC_API_URL || ''
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`${API}/api/gmail/disconnect`, { method: 'DELETE', headers: { Authorization: `Bearer ${session?.access_token}` } })
    setConnected(false)
    setGmailEmail(null)
    setItems([])
    toast.success('Gmail disconnected')
  }

  async function scan() {
    setScanning(true)
    const API = process.env.NEXT_PUBLIC_API_URL || ''
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const r = await fetch(`${API}/api/gmail/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({}),
      })
      const result = await r.json()
      if (!r.ok) throw new Error(result.error)
      toast.success(`Scanned ${result.scanned} emails, found ${result.items.length} financial items${result.settled ? `, ${result.settled} matched to bank payments` : ''}`)
      await load()
    } catch (e: any) {
      toast.error(e.message)
    }
    setScanning(false)
  }

  async function updateItem(id: string, patch: { dismissed?: boolean; paid?: boolean }) {
    // Optimistic: reflect it straight away, put it back if the server refuses.
    const before = items
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch, ...(patch.paid === false ? { matched_transaction_id: null, paid_date: null } : {}) } : i))
    const API = process.env.NEXT_PUBLIC_API_URL || ''
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(`${API}/api/gmail/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(patch),
    })
    if (!r.ok) {
      setItems(before)
      const { error } = await r.json().catch(() => ({ error: r.statusText }))
      toast.error(`Couldn't update: ${error}`)
    }
  }

  const visible = items.filter(i => !i.dismissed && (filter === 'all' || i.category === filter))
  const toPay = visible.filter(i => !i.paid && i.direction !== 'receivable')
  const owed = visible.filter(i => !i.paid && i.direction === 'receivable')
  const settled = visible.filter(i => i.paid)
  const sum = (list: ScannedItem[]) => list.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const dismissedCount = items.filter(i => i.dismissed).length

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><LoadingSpinner size={32} /></div>

  return (
    <div className="inbox-page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Financial Inbox</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>
            {connected
              ? <>Connected: {gmailEmail || 'Gmail'}{lastScanned ? ` · last scanned ${new Date(lastScanned).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}</>
              : 'Connect Gmail to scan for invoices, bills and rates'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {connected ? (
            <>
              <button onClick={scan} disabled={scanning}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: scanning ? 0.7 : 1 }}>
                {scanning ? <LoadingSpinner size={14} /> : <IconRefresh size={14} />}
                {scanning ? 'Scanning…' : 'Scan Now'}
              </button>
              <button onClick={disconnect}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <IconX size={14} /> Disconnect
              </button>
            </>
          ) : (
            <button onClick={connectGmail}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: '#4285F4', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <IconMail size={14} /> Connect Gmail
            </button>
          )}
        </div>
      </div>

      {!connected ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <IconMail size={40} style={{ color: 'var(--text3)', marginBottom: 16 }} />
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Connect your Gmail</h2>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, maxWidth: 420, margin: '0 auto 20px' }}>
            Fennec will scan your inbox for invoices, council rates, mortgage statements, receipts and bills — and categorise them automatically using AI.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320, margin: '0 auto 24px', textAlign: 'left' }}>
            {['Council rates notices (TCC, BOPRC)', 'Business invoices & receipts', 'Insurance statements', 'Utility bills', 'Mortgage & loan statements'].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                <IconCheck size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} /> {f}
              </div>
            ))}
          </div>
          <button onClick={connectGmail}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 10, background: '#4285F4', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            <IconMail size={16} /> Connect Gmail
          </button>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12 }}>Read-only access. Fennec never sends emails or modifies your inbox.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <IconRefresh size={32} style={{ color: 'var(--text3)', marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: 'var(--text2)' }}>No items scanned yet. Click &quot;Scan Now&quot; to search your inbox.</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="inbox-tiles">
            {[
              { label: 'To pay', value: currency.format(sum(toPay)), sub: `${toPay.length} bill${toPay.length === 1 ? '' : 's'}` },
              { label: 'Owed to you', value: currency.format(sum(owed)), sub: `${owed.length} invoice${owed.length === 1 ? '' : 's'}` },
              { label: 'Settled', value: `${settled.length}`, sub: 'matched or marked paid' },
            ].map(k => (
              <div key={k.label} className="card" style={{ padding: '12px 14px' }}>
                <p style={{ fontSize: 10.5, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</p>
                <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 20, marginTop: 2 }}>{k.value}</p>
                <p style={{ fontSize: 11, color: 'var(--text3)' }}>{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {(['all', 'business', 'household', 'personal'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', border: filter === f ? '1px solid var(--primary)' : '1px solid var(--border)', background: filter === f ? 'var(--primary-light)' : 'var(--surface2)', color: filter === f ? 'var(--primary)' : 'var(--text2)', textTransform: 'capitalize' }}>
                {f}
              </button>
            ))}
            {dismissedCount > 0 && (
              <button onClick={() => items.filter(i => i.dismissed).forEach(i => updateItem(i.id, { dismissed: false }))}
                style={{ marginLeft: 'auto', border: 'none', background: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                Show {dismissedCount} dismissed
              </button>
            )}
          </div>

          <ItemSection title="To pay" items={toPay} onUpdate={updateItem} />
          <ItemSection title="Owed to you" items={owed} onUpdate={updateItem} />
          <ItemSection title="Settled" items={settled} onUpdate={updateItem} muted />
          {visible.length === 0 && <p style={{ fontSize: 13, color: 'var(--text2)', padding: '12px 2px' }}>Nothing in this category.</p>}

          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, lineHeight: 1.5 }}>
            Items are marked settled automatically when a matching payment shows up in your bank transactions (same amount, or the reference in the description), or when the invoice is marked paid on your Invoices page.
          </p>
        </>
      )}
    </div>
  )
}

function ItemSection({ title, items, onUpdate, muted }: {
  title: string
  items: ScannedItem[]
  onUpdate: (id: string, patch: { dismissed?: boolean; paid?: boolean }) => void
  muted?: boolean
}) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8, fontFamily: 'Syne, sans-serif' }}>
        {title} · {items.length}
      </p>
      <div className="card" style={{ padding: 0, overflow: 'hidden', opacity: muted ? 0.85 : 1 }}>
        {items.map((item, i) => <ItemRow key={item.id} item={item} last={i === items.length - 1} onUpdate={patch => onUpdate(item.id, patch)} />)}
      </div>
    </div>
  )
}

const fmtDay = (d: string) => new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })

function ItemRow({ item, last, onUpdate }: { item: ScannedItem; last: boolean; onUpdate: (patch: { dismissed?: boolean; paid?: boolean }) => void }) {
  const cat = CAT_COLORS[item.category] || CAT_COLORS.personal
  const CatIcon = cat.icon
  const receivable = item.direction === 'receivable'
  const name = item.counterparty || item.vendor
  const overdue = !item.paid && item.due_date && item.due_date < new Date().toISOString().slice(0, 10)

  const meta: React.ReactNode[] = []
  if (item.description) meta.push(item.description)
  if (receivable && item.counterparty && item.vendor && item.vendor !== item.counterparty) meta.push(`invoiced by ${item.vendor}`)
  if (item.paid) {
    meta.push(item.paid_date
      ? `${receivable ? 'Received' : 'Paid'} ${fmtDay(item.paid_date)}${item.matched_transaction_id ? ' · matched to bank' : ''}`
      : `${receivable ? 'Received' : 'Paid'}`)
  } else if (item.due_date) {
    meta.push(<span key="due" style={{ color: overdue ? 'var(--red)' : 'var(--text2)' }}>{overdue ? 'Overdue · was due' : 'Due'} {fmtDay(item.due_date)}</span>)
  }
  if (item.reference) meta.push(`Ref ${item.reference}`)

  const badge = (text: string, color: string, Icon?: typeof IconUser) => (
    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: `color-mix(in srgb, ${color} 12%, transparent)`, color, display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
      {Icon && <Icon size={10} />} {text}
    </span>
  )

  return (
    <div className="inbox-row" style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div style={{ fontSize: 18, flexShrink: 0, width: 24, textAlign: 'center' }} aria-hidden>{TYPE_ICONS[item.type] || '📧'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{name}</span>
          {receivable ? badge('Owed to you', 'var(--green)') : null}
          {badge(item.category, cat.color, CatIcon)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.45 }}>
          {meta.map((m, i) => <span key={i}>{i > 0 && <span style={{ color: 'var(--text3)' }}> · </span>}{m}</span>)}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {item.amount !== null && (
          <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color: receivable ? 'var(--green)' : 'var(--text)' }}>
            {receivable ? '+' : ''}{currency.format(Number(item.amount))}
          </p>
        )}
        {item.gst ? <p style={{ fontSize: 10, color: 'var(--text3)' }}>incl. {currency.format(Number(item.gst))} GST</p> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
        <button onClick={() => onUpdate({ paid: !item.paid })} title={item.paid ? 'Mark as not paid' : receivable ? 'Mark as received' : 'Mark as paid'}
          className="inbox-action">
          {item.paid ? <IconRefresh size={14} /> : <IconCheck size={14} />}
        </button>
        <button onClick={() => onUpdate({ dismissed: true })} title="Dismiss" className="inbox-action">
          <IconX size={14} />
        </button>
      </div>
    </div>
  )
}

export default function InboxPage() {
  return <Suspense><InboxPageInner /></Suspense>
}
