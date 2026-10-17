'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { IconAdjustmentsHorizontal, IconArrowUpRight, IconCheck } from '@tabler/icons-react'
import type { NetWorthBreakdown, NetWorthResponse } from '@/lib/api'

export type NetWorthPart = 'bank' | 'investments' | 'kiwisaver' | 'property' | 'debt'

const RANGES = [
  { label: '1M', days: 31 },
  { label: '3M', days: 92 },
  { label: '1Y', days: 366 },
  { label: 'All', days: Infinity },
]

const PARTS: { key: NetWorthPart; label: string; href: string }[] = [
  { key: 'bank',        label: 'Bank',        href: '/app/finance/accounts' },
  { key: 'investments', label: 'Investments', href: '/app/portfolio' },
  { key: 'kiwisaver',   label: 'KiwiSaver',   href: '/app/finance/kiwisaver' },
  { key: 'property',    label: 'Property',    href: '/app/finance/homeloan' },
  { key: 'debt',        label: 'Home loan',   href: '/app/finance/homeloan' },
]

const PROPERTY_SOURCE: Record<string, string> = {
  market_estimate: 'market estimate',
  rv: 'rateable value',
  purchase_price: 'purchase price',
}

function fmt(n: number, opts: { sign?: boolean; compact?: boolean } = {}) {
  const s = Math.abs(n).toLocaleString('en-NZ', {
    style: 'currency', currency: 'NZD', maximumFractionDigits: opts.compact && Math.abs(n) >= 1000 ? 1 : 0,
    notation: opts.compact ? 'compact' : 'standard',
  })
  if (n < 0) return `−${s}`
  return opts.sign ? `+${s}` : s
}

function shortDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}

// Snapshots store every component, so any combination can be re-totalled — history included.
export function totalOf(b: NetWorthBreakdown, excluded: NetWorthPart[]) {
  return PARTS.reduce((s, p) => (excluded.includes(p.key) ? s : s + b[p.key]), 0)
}

export function NetWorthCard({ data, loading, error, excluded, onToggle }: {
  data: NetWorthResponse | null
  loading: boolean
  error: string | null
  excluded: NetWorthPart[]
  onToggle: (part: NetWorthPart) => void
}) {
  const [range, setRange] = useState('3M')
  const [editing, setEditing] = useState(false)

  const points = useMemo(() => {
    const history = (data?.history ?? []).map(p => ({ date: p.date, total: totalOf(p, excluded) }))
    const days = RANGES.find(r => r.label === range)?.days ?? Infinity
    if (!Number.isFinite(days)) return history
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cut = cutoff.toISOString().slice(0, 10)
    return history.filter(p => p.date >= cut)
  }, [data, range, excluded])

  const current = data?.current
  const total = current ? totalOf(current, excluded) : null
  const first = points[0]
  const change = total !== null && first && points.length >= 2 ? total - first.total : null
  const changePct = change !== null && first && first.total !== 0 ? (change / Math.abs(first.total)) * 100 : null

  // Outside edit mode, hide parts that are empty (except Property, which prompts setup).
  const visibleParts = current
    ? PARTS.filter(p => editing || current[p.key] !== 0 || p.key === 'property')
    : []

  return (
    <section className="nw-card">
      <div className="nw-head">
        <div style={{ minWidth: 0 }}>
          <div className="nw-eyebrow">
            Net worth
            {excluded.length > 0 && !editing && (
              <span className="nw-badge">excl. {excluded.map(k => PARTS.find(p => p.key === k)!.label.toLowerCase()).join(', ')}</span>
            )}
          </div>
          <div className="nw-total">{loading || total === null ? '—' : fmt(total)}</div>
          <div className="nw-change">
            {change !== null ? (
              <>
                <span>{change >= 0 ? '▲' : '▼'} {fmt(change, { sign: true })}{changePct !== null ? ` (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%)` : ''}</span>
                <span style={{ opacity: 0.7 }}> since {shortDate(first!.date)}</span>
              </>
            ) : !loading && current ? (
              <span style={{ opacity: 0.75 }}>Tracking starts today</span>
            ) : null}
          </div>
        </div>
        <div className="nw-ranges" role="group" aria-label="Chart range">
          {RANGES.map(r => (
            <button key={r.label} onClick={() => setRange(r.label)} className={range === r.label ? 'active' : ''} aria-pressed={range === r.label}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="nw-chart">
        {error ? (
          <div className="nw-empty">Couldn&apos;t load your net worth: {error}</div>
        ) : points.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.7)' }} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Tooltip
                cursor={{ stroke: 'rgba(255,255,255,0.5)', strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p: any = payload[0].payload
                  return (
                    <div className="nw-tip">
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{shortDate(p.date)}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{fmt(p.total)}</div>
                    </div>
                  )
                }}
              />
              <Area type="monotone" dataKey="total" stroke="#fff" strokeWidth={2} fill="url(#nwFill)" activeDot={{ r: 4, fill: '#fff', stroke: 'var(--primary)', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : !loading ? (
          <div className="nw-empty">
            {data && !data.historyAvailable
              ? 'Net worth history isn’t switched on yet.'
              : 'Fennec records your net worth every day. Your trend line fills in from here.'}
          </div>
        ) : null}
      </div>

      {current && (
        <>
          <div className="nw-parts-head">
            <span>{editing ? 'Choose what counts towards your net worth' : 'Made up of'}</span>
            <button onClick={() => setEditing(e => !e)} className="nw-edit" aria-pressed={editing}>
              {editing ? <><IconCheck size={13} /> Done</> : <><IconAdjustmentsHorizontal size={13} /> Edit</>}
            </button>
          </div>
          <div className="nw-parts">
            {visibleParts.map(p => {
              const value = current[p.key]
              const isOff = excluded.includes(p.key)
              const note = p.key === 'property'
                ? (current.propertySource ? PROPERTY_SOURCE[current.propertySource] : 'add on Home Loan')
                : null
              const body = (
                <>
                  <span className="nw-part-label">
                    {editing && <span className={`nw-check ${isOff ? '' : 'on'}`} aria-hidden>{!isOff && <IconCheck size={10} />}</span>}
                    {p.label}
                    {!editing && <IconArrowUpRight size={11} className="nw-part-arrow" aria-hidden />}
                  </span>
                  <span className="nw-part-value">{value === 0 && p.key === 'property' ? '—' : fmt(value, { compact: Math.abs(value) >= 100000 })}</span>
                  {note && <span className="nw-part-note">{note}</span>}
                </>
              )
              return editing ? (
                <button
                  key={p.key}
                  onClick={() => onToggle(p.key)}
                  className={`nw-part ${isOff ? 'off' : ''}`}
                  role="switch"
                  aria-checked={!isOff}
                >
                  {body}
                </button>
              ) : (
                <Link key={p.key} href={p.href} className={`nw-part ${isOff ? 'off' : ''}`} title={`Open ${p.label}`}>
                  {body}
                </Link>
              )
            })}
          </div>
        </>
      )}

      {current && current.missingFx.length > 0 && (
        <p className="nw-footnote">
          {current.missingFx.join(', ')} holdings aren&apos;t included right now: the exchange rate couldn&apos;t be loaded.
        </p>
      )}
    </section>
  )
}
