'use client'
import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { createClient } from '@/lib/supabase'

// Value history from the daily snapshots the backend records at each Akahu sync.
// Plots value against what was paid in, so the gap between the lines is the
// gain and market moves are visible separately from deposits.

interface Row {
  snapshot_date: string
  currency: string
  value: number
  invested: number | null
}
interface Point {
  date: string
  value: number
  invested: number | null
}

const RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '1Y', days: 365 },
  { label: 'All', days: Infinity },
]

function shortDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}

export function SnapshotHistory({
  kind,
  title,
  valueLabel,
  investedLabel,
  refreshKey = 0,
}: {
  kind: 'broker' | 'kiwisaver'
  title: string
  valueLabel: string
  investedLabel: string
  refreshKey?: number
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [connected, setConnected] = useState(false)
  const [range, setRange] = useState('All')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [snaps, status] = await Promise.all([
        supabase
          .from('balance_snapshots')
          .select('snapshot_date, currency, value, invested')
          .eq('kind', kind)
          .order('snapshot_date', { ascending: true }),
        supabase.from('akahu_sync_status').select('user_id').maybeSingle(),
      ])
      if (cancelled) return
      setRows((snaps.data as Row[] | null) ?? [])
      setConnected(!!status.data)
    }
    load()
    return () => { cancelled = true }
  }, [kind, refreshKey])

  const { points, currency } = useMemo(() => {
    if (!rows || rows.length === 0) return { points: [] as Point[], currency: 'NZD' }
    // Sum accounts of the same kind per day, in the first account's currency.
    const cur = rows[0].currency
    const byDate = new Map<string, { value: number; invested: number; complete: boolean }>()
    for (const r of rows.filter(x => x.currency === cur)) {
      const e = byDate.get(r.snapshot_date) ?? { value: 0, invested: 0, complete: true }
      e.value += Number(r.value)
      if (r.invested === null) e.complete = false
      else e.invested += Number(r.invested)
      byDate.set(r.snapshot_date, e)
    }
    return {
      currency: cur,
      points: [...byDate.entries()].map(([date, e]) => ({
        date,
        value: Math.round(e.value * 100) / 100,
        invested: e.complete ? Math.round(e.invested * 100) / 100 : null,
      })),
    }
  }, [rows])

  const visible = useMemo(() => {
    const days = RANGES.find(r => r.label === range)?.days ?? Infinity
    if (!isFinite(days) || points.length === 0) return points
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    return points.filter(p => p.date >= cutoff)
  }, [points, range])

  const fmt = (n: number) => n.toLocaleString('en-NZ', { style: 'currency', currency, maximumFractionDigits: 0 })

  // Nothing to say for users who haven't connected Akahu at all.
  if (rows === null || (rows.length === 0 && !connected)) return null

  const first = visible[0]
  const last = visible[visible.length - 1]
  const hasInvested = visible.length > 0 && visible.every(p => p.invested !== null)
  const gainNow = last && last.invested !== null ? last.value - last.invested : null
  const gainThen = first && first.invested !== null ? first.value - first.invested : null
  const gainChange = gainNow !== null && gainThen !== null && visible.length > 1 ? gainNow - gainThen : null

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 15 }}>{title}</p>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            {currency} · as reported by your provider · one point per day, building from your first sync
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setRange(r.label)}
              style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: range === r.label ? 'var(--primary-light)' : 'transparent', color: range === r.label ? 'var(--primary)' : 'var(--text2)' }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length < 2 ? (
        <div style={{ padding: '28px 8px', textAlign: 'center', color: 'var(--text3)', fontSize: 13, lineHeight: 1.6 }}>
          {visible.length === 0
            ? 'No history yet. A point is saved each time your accounts sync (about daily), so this chart fills in over the coming days.'
            : <>First point saved on {shortDate(visible[0].date)} at <strong style={{ color: 'var(--text2)' }}>{fmt(visible[0].value)}</strong>. The chart appears once there are two days of data.</>}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 8 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{valueLabel}</p>
              <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 18, fontWeight: 500 }}>{fmt(last.value)}</p>
            </div>
            {gainNow !== null && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Gain now</p>
                <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 18, fontWeight: 500, color: gainNow >= 0 ? 'var(--green)' : 'var(--red)' }}>{gainNow >= 0 ? '+' : ''}{fmt(gainNow)}</p>
              </div>
            )}
            {gainChange !== null && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Gain change since {shortDate(first.date)}</p>
                <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 18, fontWeight: 500, color: gainChange >= 0 ? 'var(--green)' : 'var(--red)' }}>{gainChange >= 0 ? '+' : ''}{fmt(gainChange)}</p>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={visible} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: 'var(--text2)', fontFamily: 'DM Mono, monospace' }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis domain={['auto', 'auto']} width={64} tick={{ fontSize: 11, fill: 'var(--text2)', fontFamily: 'DM Mono, monospace' }} axisLine={false} tickLine={false} tickFormatter={v => fmt(Number(v))} />
              <Tooltip
                labelFormatter={(d: any) => shortDate(String(d))}
                formatter={(v: any, name: any) => [fmt(Number(v)), name]}
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'DM Mono, monospace', fontSize: 12 }}
                labelStyle={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, color: 'var(--text)' }}
              />
              <Area type="monotone" dataKey="value" name={valueLabel} stroke="var(--primary)" strokeWidth={2.5} fill="var(--primary)" fillOpacity={0.12} />
              {hasInvested && (
                <Line type="stepAfter" dataKey="invested" name={investedLabel} stroke="var(--text3)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
