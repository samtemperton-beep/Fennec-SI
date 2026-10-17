'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { IconRefresh, IconPlugConnected, IconAlertTriangle } from '@tabler/icons-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

// Re-sync automatically when the last sync is older than this.
const STALE_MS = 6 * 60 * 60 * 1000
// After a failed auto-sync, don't retry again for this long (per browser session).
const RETRY_BACKOFF_MS = 10 * 60 * 1000
const ATTEMPT_KEY = 'fennec_akahu_autosync_attempt'

export interface BrokerAccount {
  connection: string
  currency: string
  totalBalance: number
  holdingsValue: number
  cashBalance: number
  reconciled: boolean | null
  refreshedAt: string | null
}

interface Status {
  synced_at: string
  broker_accounts: BrokerAccount[]
  warnings: string[]
  capped: boolean
}

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs !== 1 ? 's' : ''} ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

function money(n: number, currency: string) {
  return n.toLocaleString('en-NZ', { style: 'currency', currency, maximumFractionDigits: 2 })
}

export function AkahuSyncBar({ onSynced, onAccounts, refreshKey = 0 }: { onSynced: () => void; onAccounts?: (accounts: BrokerAccount[]) => void; refreshKey?: number }) {
  const supabase = createClient()
  const [status, setStatus] = useState<Status | null>(null)
  const [hasCreds, setHasCreds] = useState<boolean | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showWarnings, setShowWarnings] = useState(false)
  const autoRan = useRef(false)

  async function loadStatus() {
    const [statusRes, credsRes] = await Promise.all([
      supabase.from('akahu_sync_status').select('*').maybeSingle(),
      supabase.from('akahu_credentials').select('user_id').maybeSingle(),
    ])
    setStatus((statusRes.data as Status | null) ?? null)
    onAccounts?.((statusRes.data as Status | null)?.broker_accounts ?? [])
    setHasCreds(!!credsRes.data)
    return { status: (statusRes.data as Status | null) ?? null, hasCreds: !!credsRes.data }
  }

  async function sync(manual: boolean) {
    setSyncing(true)
    setError(null)
    try {
      const r = await api.syncAkahu()
      await loadStatus()
      onSynced()
      if (manual) {
        const changes = r.added.length + r.updated.length + r.removed.length
        toast.success(
          changes > 0
            ? `Synced: ${r.added.length} added, ${r.updated.length} updated, ${r.removed.length} removed`
            : 'Synced — already up to date'
        )
      }
      if (r.failed?.length) toast.error(`Some items failed: ${r.failed.slice(0, 2).join('; ')}`)
    } catch (e: any) {
      setError(e.message)
      if (manual) toast.error(e.message)
    }
    setSyncing(false)
  }

  useEffect(() => {
    loadStatus().then(s => {
      if (autoRan.current || !s.hasCreds) return
      autoRan.current = true
      const stale = !s.status || Date.now() - new Date(s.status.synced_at).getTime() > STALE_MS
      if (!stale) return
      const lastAttempt = Number(sessionStorage.getItem(ATTEMPT_KEY) || 0)
      if (Date.now() - lastAttempt < RETRY_BACKOFF_MS) return
      sessionStorage.setItem(ATTEMPT_KEY, String(Date.now()))
      sync(false)
    })
  }, [])

  // Re-read the stored status when the page changes something that affects it
  // (e.g. removing unmatched holdings, then re-syncing to clear the stale note).
  useEffect(() => {
    if (refreshKey > 0) loadStatus()
  }, [refreshKey])

  if (hasCreds === null) return null

  if (!hasCreds) {
    return (
      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text2)' }}>
        <IconPlugConnected size={15} />
        <span>
          Connect <strong>Akahu</strong> to sync your Hatch portfolio and KiwiSaver automatically.{' '}
          <Link href="/app/settings" style={{ color: 'var(--primary)', fontWeight: 600 }}>Add tokens in Settings</Link>
        </span>
      </div>
    )
  }

  const accounts = status?.broker_accounts ?? []
  const connections = [...new Set(accounts.map(a => a.connection))].join(', ')
  const warnings = status?.warnings ?? []
  const unreconciled = accounts.some(a => a.reconciled === false)

  return (
    <div style={{ marginBottom: 16, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--sh)' }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: error ? 'var(--red)' : unreconciled ? 'var(--amber)' : 'var(--green)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
            {status ? <>Synced from {connections || 'Akahu'} via Akahu</> : 'Akahu connected — not synced yet'}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
            {status && <>Last synced {ago(status.synced_at)}</>}
            {accounts[0]?.refreshedAt && <> · broker data as of {ago(accounts[0].refreshedAt)}</>}
            {accounts.map(a => (
              <span key={a.connection}> · {a.connection} cash {money(a.cashBalance, a.currency)}</span>
            ))}
          </p>
          {error && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>{error}</p>}
        </div>
        {warnings.length > 0 && (
          <button onClick={() => setShowWarnings(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 8, background: 'var(--amber-light)', border: '1px solid var(--amber)', color: 'var(--amber)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            <IconAlertTriangle size={12} /> {warnings.length} note{warnings.length !== 1 ? 's' : ''}
          </button>
        )}
        <button onClick={() => sync(true)} disabled={syncing} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, background: 'var(--primary-light)', border: '1px solid var(--primary)', color: 'var(--primary)', fontSize: 12, fontWeight: 700, cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.7 : 1 }}>
          {syncing ? <LoadingSpinner size={12} /> : <IconRefresh size={12} />} Sync now
        </button>
      </div>
      {showWarnings && warnings.length > 0 && (
        <ul style={{ margin: 0, padding: '8px 14px 12px 30px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </div>
  )
}
