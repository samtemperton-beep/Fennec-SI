'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { NetWorthResponse } from '@/lib/api'

const RANGES = [
  { label: '1M', days: 31 },
  { label: '3M', days: 92 },
  { label: '1Y', days: 366 },
  { label: 'All', days: Infinity },
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

export function NetWorthCard({ data, loading, error }: { data: NetWorthResponse | null; loading: boolean; error: string | null }) {
  const [range, setRange] = useState('3M')

  const points = useMemo(() => {
    const history = data?.history ?? []
    const days = RANGES.find(r => r.label === range)?.days ?? Infinity
    if (!Number.isFinite(days)) return history
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cut = cutoff.toISOString().slice(0, 10)
    return history.filter(p => p.date >= cut)
  }, [data, range])

  const current = data?.current
  const first = points[0]
  const change = current && first && points.length >= 2 ? current.total - first.total : null
  const changePct = change !== null && first && first.total !== 0 ? (change / Math.abs(first.total)) * 100 : null

  const parts = current ? [
    { label: 'Bank', value: current.bank, href: '/app/finance/accounts' },
    { label: 'Investments', value: current.investments, href: '/app/portfolio' },
    { label: 'KiwiSaver', value: current.kiwisaver, href: '/app/finance/kiwisaver' },
    { label: 'Property', value: current.property, href: '/app/finance/homeloan',
      note: current.propertySource ? PROPERTY_SOURCE[current.propertySource] : 'add on Home Loan' },
    { label: 'Home loan', value: current.debt, href: '/app/finance/homeloan' },
  ].filter(p => p.value !== 0 || p.label === 'Property') : []

  return (
    <section className="nw-card">
      <div className="nw-head">
        <div style={{ minWidth: 0 }}>
          <div className="nw-eyebrow">Net worth</div>
          <div className="nw-total">{loading ? '—' : current ? fmt(current.total) : '—'}</div>
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

      {parts.length > 0 && (
        <div className="nw-parts">
          {parts.map(p => (
            <Link key={p.label} href={p.href} className="nw-part">
              <span className="nw-part-label">{p.label}</span>
              <span className="nw-part-value">{p.value === 0 && p.label === 'Property' ? '—' : fmt(p.value, { compact: Math.abs(p.value) >= 100000 })}</span>
              {p.note && <span className="nw-part-note">{p.note}</span>}
            </Link>
          ))}
        </div>
      )}

      {current && current.missingFx.length > 0 && (
        <p className="nw-footnote">
          {current.missingFx.join(', ')} holdings aren&apos;t included right now: the exchange rate couldn&apos;t be loaded.
        </p>
      )}
    </section>
  )
}
