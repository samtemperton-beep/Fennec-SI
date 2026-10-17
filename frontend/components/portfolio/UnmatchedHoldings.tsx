'use client'
import { useEffect, useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { findUnmatched, loadKept, saveKept } from '@/lib/unmatchedHoldings'
import { fmtMoney } from '@/lib/utils'
import type { Holding } from '@/components/portfolio/HoldingsTable'

// Lists holdings that Akahu doesn't know about, so ones that have been sold can be
// cleared out in a click while ones held at an unconnected broker can be kept.
// Removing needs two clicks: deleted holdings can't be recovered.

export function UnmatchedHoldings({
  holdings,
  connected,
  onRemove,
}: {
  holdings: Holding[]
  connected: boolean
  onRemove: (ids: number[]) => Promise<void>
}) {
  const [kept, setKept] = useState<string[]>([])
  const [armed, setArmed] = useState<string | null>(null) // 'all' or a holding id awaiting its second click
  const [busy, setBusy] = useState(false)

  useEffect(() => { setKept(loadKept()) }, [])

  const { unmatched, duplicates } = findUnmatched(holdings, { connected, kept })
  const rows = [...unmatched, ...duplicates]
  if (rows.length === 0) return null

  async function remove(key: string, ids: number[]) {
    if (armed !== key) { setArmed(key); return }
    setBusy(true)
    setArmed(null)
    try { await onRemove(ids) } finally { setBusy(false) }
  }

  function keepAll() {
    const next = [...kept, ...rows.map(r => r.ticker)]
    saveKept(next)
    setKept(next)
  }

  const btn = (armedNow: boolean): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
    border: `1px solid ${armedNow ? 'var(--red)' : 'var(--border)'}`,
    background: armedNow ? 'var(--red)' : 'transparent',
    color: armedNow ? '#fff' : 'var(--text2)',
  })

  return (
    <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: 'var(--amber-light)', border: '1px solid var(--amber)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <IconAlertTriangle size={15} style={{ color: 'var(--amber)', marginTop: 1, flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            {rows.length} holding{rows.length !== 1 ? 's' : ''} {rows.length !== 1 ? "aren't" : "isn't"} matched to your Akahu accounts
          </p>
          <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, marginTop: 2 }}>
            Fennec takes your portfolio from Akahu, so these were added by hand or imported. Remove any you&apos;ve sold. Keep any you hold at a broker Akahu can&apos;t see.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(h => {
          const key = String(h.id)
          const isDup = duplicates.includes(h)
          return (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 12, minWidth: 56 }}>{h.ticker}</span>
              <span style={{ fontSize: 11, color: 'var(--text2)', flex: 1, minWidth: 140 }}>
                {h.shares} share{h.shares !== 1 ? 's' : ''} · {fmtMoney(h.current_price * h.shares, 'USD')}
                {isDup && <span style={{ color: 'var(--amber)', fontWeight: 600 }}> · duplicate of a synced position</span>}
              </span>
              <button onClick={() => remove(key, [h.id])} onBlur={() => armed === key && setArmed(null)} disabled={busy} style={btn(armed === key)}>
                {armed === key ? 'Click again to remove' : 'Remove'}
              </button>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {rows.length > 1 && (
          <button onClick={() => remove('all', rows.map(r => r.id))} onBlur={() => armed === 'all' && setArmed(null)} disabled={busy} style={btn(armed === 'all')}>
            {armed === 'all' ? `Click again to remove all ${rows.length}` : `Remove all ${rows.length}`}
          </button>
        )}
        <button onClick={keepAll} disabled={busy} style={btn(false)}>Keep {rows.length > 1 ? 'all of these' : 'this'}</button>
      </div>
    </div>
  )
}
