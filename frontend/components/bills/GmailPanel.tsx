'use client'
import { IconMail, IconRefresh, IconX } from '@tabler/icons-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

// The email add-on on the Bills page: connect Gmail once, then Scan pulls bills
// and invoices out of your inbox instead of typing them in.

export function GmailPanel({ connected, email, lastScanned, scanning, onConnect, onScan, onDisconnect }: {
  connected: boolean
  email: string | null
  lastScanned: string | null
  scanning: boolean
  onConnect: () => void
  onScan: () => void
  onDisconnect: () => void
}) {
  if (!connected) {
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(66,133,244,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IconMail size={17} style={{ color: '#4285F4' }} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13.5 }}>Add bills from your email</p>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            Connect Gmail and Fennec finds bills, rates notices and invoices for you, then ticks them off when the payment shows up in your bank. Read-only.
          </p>
        </div>
        <button onClick={onConnect}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, background: '#4285F4', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
          <IconMail size={14} /> Connect Gmail
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)' }}>
      <IconMail size={14} style={{ color: '#4285F4' }} />
      <span>
        Gmail{email ? ` (${email})` : ''} connected
        {lastScanned ? ` · last scanned ${new Date(lastScanned).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ' · not scanned yet'}
      </span>
      <button onClick={onScan} disabled={scanning}
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary)', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: scanning ? 0.7 : 1 }}>
        {scanning ? <LoadingSpinner size={12} /> : <IconRefresh size={13} />}
        {scanning ? 'Scanning…' : 'Scan email'}
      </button>
      <button onClick={onDisconnect} title="Disconnect Gmail"
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px', borderRadius: 8, background: 'transparent', color: 'var(--text3)', border: 'none', fontSize: 12, cursor: 'pointer' }}>
        <IconX size={12} /> Disconnect
      </button>
    </div>
  )
}
