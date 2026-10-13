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
      toast.success(`Scanned ${result.scanned} emails, found ${result.items.length} financial items`)
      await load()
    } catch (e: any) {
      toast.error(e.message)
    }
    setScanning(false)
  }

  function dismiss(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, dismissed: true } : i))
  }

  const filtered = items.filter(i => !i.dismissed && (filter === 'all' || i.category === filter))
  const unpaid = filtered.filter(i => !i.paid)
  const paid = filtered.filter(i => i.paid)
  const totalOwing = unpaid.reduce((s, i) => s + (i.amount || 0), 0)

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><LoadingSpinner size={32} /></div>

  return (
    <div style={{ padding: 28, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Financial Inbox</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>
            {connected ? `Connected: ${gmailEmail || 'Gmail'}` : 'Connect Gmail to scan for invoices, bills and rates'}
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
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
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
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <IconRefresh size={32} style={{ color: 'var(--text3)', marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: 'var(--text2)' }}>No items scanned yet. Click "Scan Now" to search your inbox.</p>
          {lastScanned && <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Last scanned: {new Date(lastScanned).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
        </div>
      ) : (
        <>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Owing', value: currency.format(totalOwing), sub: `${unpaid.length} items` },
              { label: 'Business', value: `${filtered.filter(i => i.category === 'business').length}`, sub: 'items found' },
              { label: 'Household', value: `${filtered.filter(i => i.category === 'household').length}`, sub: 'items found' },
              { label: 'Personal', value: `${filtered.filter(i => i.category === 'personal').length}`, sub: 'items found' },
            ].map(k => (
              <div key={k.label} className="card" style={{ padding: 16 }}>
                <p style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k.label}</p>
                <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 22 }}>{k.value}</p>
                <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {(['all', 'business', 'household', 'personal'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', border: filter === f ? '1px solid var(--primary)' : '1px solid var(--border)', background: filter === f ? 'var(--primary-light)' : 'var(--surface2)', color: filter === f ? 'var(--primary)' : 'var(--text2)', textTransform: 'capitalize' }}>
                {f}
              </button>
            ))}
          </div>

          {/* Unpaid */}
          {unpaid.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10, fontFamily: 'Syne, sans-serif' }}>Unpaid / Action Required</p>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {unpaid.map((item, i) => <ItemRow key={item.id} item={item} last={i === unpaid.length - 1} onDismiss={() => dismiss(item.id)} />)}
              </div>
            </div>
          )}

          {/* Paid */}
          {paid.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10, fontFamily: 'Syne, sans-serif' }}>Paid / Confirmed</p>
              <div className="card" style={{ padding: 0, overflow: 'hidden', opacity: 0.8 }}>
                {paid.map((item, i) => <ItemRow key={item.id} item={item} last={i === paid.length - 1} onDismiss={() => dismiss(item.id)} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ItemRow({ item, last, onDismiss }: { item: ScannedItem; last: boolean; onDismiss: () => void }) {
  const cat = CAT_COLORS[item.category] || CAT_COLORS.personal
  const CatIcon = cat.icon

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div style={{ fontSize: 22, flexShrink: 0 }}>{TYPE_ICONS[item.type] || '📧'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>{item.vendor}</p>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `color-mix(in srgb, ${cat.color} 12%, transparent)`, color: cat.color, display: 'flex', alignItems: 'center', gap: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <CatIcon size={10} /> {item.category}
          </span>
          {item.paid && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(34,197,94,0.12)', color: '#22C55E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paid</span>}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{item.description}</p>
        {item.due_date && <p style={{ fontSize: 11, color: item.paid ? 'var(--text3)' : 'var(--red)', marginTop: 1 }}>Due {new Date(item.due_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
        {item.reference && <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>Ref: {item.reference}</p>}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        {item.amount !== null && (
          <div>
            <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 16 }}>{new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(item.amount)}</p>
            {item.gst ? <p style={{ fontSize: 10, color: 'var(--text3)' }}>incl. {new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(item.gst)} GST</p> : null}
          </div>
        )}
        <button onClick={onDismiss} title="Dismiss"
          style={{ padding: 4, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>
          <IconX size={14} />
        </button>
      </div>
    </div>
  )
}

export default function InboxPage() {
  return <Suspense><InboxPageInner /></Suspense>
}
