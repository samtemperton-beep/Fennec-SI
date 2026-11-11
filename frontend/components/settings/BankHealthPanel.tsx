'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, type BankHealthResponse, type BankFinding } from '@/lib/api'
import { askFennec } from '@/lib/askFennec'

// Settings → Akahu Sync → Connection health. Explains why transactions might
// not be updating, from what Fennec's own syncs recorded (bank_sync_health),
// so people can fix it themselves and the team doesn't need account access.

const COLOURS: Record<BankFinding['level'], string> = {
  problem: 'var(--red)', warn: '#d9a400', ok: 'var(--green)', info: 'var(--text2)',
}
const ICONS: Record<BankFinding['level'], string> = { problem: '⛔', warn: '⚠️', ok: '✅', info: 'ℹ️' }

function when(iso: string | null | undefined) {
  if (!iso) return 'never'
  const h = (Date.now() - Date.parse(iso)) / 3_600_000
  if (h < 1) return 'in the last hour'
  if (h < 24) return `${Math.round(h)}h ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}
const day = (d: string | null) => d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'none'

const BTN: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2, transparent)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }

export function BankHealthPanel() {
  const [data, setData] = useState<BankHealthResponse | null>(null)
  const [busy, setBusy] = useState<'' | 'sync' | 'fetch' | 'report'>('')
  const [reporting, setReporting] = useState(false)
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)

  const load = () => api.bankHealth().then(setData).catch(() => setData(null))
  useEffect(() => { load() }, [])

  if (!data) return null
  const top = data.findings.find(f => f.level !== 'info') ?? data.findings[0]
  const accounts = data.health?.accounts ?? []

  async function run(kind: 'sync' | 'fetch') {
    setBusy(kind)
    try {
      if (kind === 'sync') {
        const r = await api.syncBank()
        toast.success(r.transactions ? `${r.transactions} new transaction${r.transactions === 1 ? '' : 's'}` : 'Synced. Nothing new from Akahu yet.')
      } else {
        const r = await api.akahuRefresh()
        toast.success(r.message)
      }
    } catch (e: any) { toast.error(e.message) }
    await load()
    setBusy('')
  }

  async function sendReport() {
    setBusy('report')
    try {
      await api.sendConnectionReport(note.trim())
      toast.success('Sent. The Fennec team will reply by email.')
      setReporting(false); setNote('')
    } catch (e: any) { toast.error(e.message) }
    setBusy('')
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>Connection health</h3>
        {data.health && <span style={{ fontSize: 12, color: 'var(--text2)' }}>Last checked {when(data.health.checked_at)}</span>}
      </div>

      {top && (
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55 }}>
          <span style={{ color: COLOURS[top.level], fontWeight: 600 }}>{ICONS[top.level]} {top.title}.</span>{' '}
          <span style={{ color: 'var(--text2)' }}>{top.fix}</span>
        </div>
      )}

      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ background: 'none', border: 'none', padding: 0, marginTop: 8, color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        {open ? 'Hide details' : `Details${accounts.length ? ` for ${accounts.length} account${accounts.length === 1 ? '' : 's'}` : ''}`}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {data.findings.filter(f => f !== top).map(f => (
            <p key={f.title} style={{ fontSize: 12, lineHeight: 1.55, marginBottom: 6 }}>
              <span style={{ color: COLOURS[f.level], fontWeight: 600 }}>{ICONS[f.level]} {f.title}.</span>{' '}
              <span style={{ color: 'var(--text2)' }}>{f.fix}</span>
            </p>
          ))}
          {accounts.length > 0 && (
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {accounts.map((a, i) => (
                <div key={i} style={{ fontSize: 12, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                  <div style={{ fontWeight: 600 }}>
                    {a.bank} · {a.name}{' '}
                    <span style={{ color: a.status === 'INACTIVE' ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{a.status === 'INACTIVE' ? 'needs reconnecting' : 'connected'}</span>
                  </div>
                  <div style={{ color: 'var(--text2)' }}>
                    Akahu got data from the bank {when(a.refreshedTx ?? a.refreshedBalance)} · newest transaction {day(a.newestTx)}
                    {a.error && <span style={{ color: 'var(--red)' }}> · {a.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <button type="button" style={BTN} disabled={!!busy} onClick={() => run('sync')}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
        <button type="button" style={BTN} disabled={!!busy} onClick={() => run('fetch')}
          title="Asks Akahu to get fresh data from your bank. Press Sync a few minutes later.">
          {busy === 'fetch' ? 'Asking…' : 'Ask Akahu to fetch now'}
        </button>
        <button type="button" style={BTN} onClick={() => askFennec("My transactions don't seem to be updating. Can you check my bank connection and tell me what to do?")}>Ask Fennec</button>
        <button type="button" style={{ ...BTN, border: 'none', background: 'none', color: 'var(--primary)' }} onClick={() => setReporting(r => !r)}>
          Send a report to the Fennec team
        </button>
      </div>

      {reporting && (
        <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
          <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 8 }}>
            Sends the team your username, email, the bank and account names above, their status, dates and any errors, so we can help without seeing inside your accounts. No balances, transactions or tokens. We&apos;ll reply by email.
          </p>
          <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={3}
            placeholder="What's happening? E.g. nothing new from ANZ since Monday"
            style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface, transparent)', color: 'var(--text)', fontSize: 13, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" disabled={busy === 'report'} onClick={sendReport}
              style={{ ...BTN, background: 'var(--primary)', color: 'white', border: 'none' }}>
              {busy === 'report' ? 'Sending…' : 'Send report'}
            </button>
            <button type="button" style={BTN} onClick={() => setReporting(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
