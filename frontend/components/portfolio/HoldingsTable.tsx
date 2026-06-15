'use client'
import { useState } from 'react'
import { SignalBadge } from '@/components/shared/SignalBadge'
import { fmtCurrency, fmtPct, fmt } from '@/lib/utils'
import { IconChevronUp, IconChevronDown, IconTrash, IconLoader } from '@tabler/icons-react'

export interface Holding {
  id: number
  ticker: string
  shares: number
  buy_price: number
  current_price: number
  market: string
  signal?: string | null
  signal_reason?: string | null
  sector?: string | null
}

type SortKey = 'ticker' | 'shares' | 'buy_price' | 'current_price' | 'pl' | 'plpct'

interface Props {
  holdings: Holding[]
  analyzingSet: Set<number>
  onDelete: (id: number) => void
  onAnalyze: (h: Holding) => void
}

export function HoldingsTable({ holdings, analyzingSet, onDelete, onAnalyze }: Props) {
  const [sort, setSort] = useState<SortKey>('ticker')
  const [dir, setDir] = useState<1 | -1>(1)

  function toggleSort(k: SortKey) {
    if (sort === k) setDir(d => d === 1 ? -1 : 1)
    else { setSort(k); setDir(1) }
  }

  function getValue(h: Holding, k: SortKey): number | string {
    const pl = (h.current_price - h.buy_price) * h.shares
    const plpct = h.buy_price > 0 ? ((h.current_price - h.buy_price) / h.buy_price) * 100 : 0
    switch (k) {
      case 'ticker': return h.ticker
      case 'shares': return h.shares
      case 'buy_price': return h.buy_price
      case 'current_price': return h.current_price
      case 'pl': return pl
      case 'plpct': return plpct
    }
  }

  const sorted = [...holdings].sort((a, b) => {
    const av = getValue(a, sort), bv = getValue(b, sort)
    if (typeof av === 'string') return av.localeCompare(bv as string) * dir
    return ((av as number) - (bv as number)) * dir
  })

  function SortIcon({ k }: { k: SortKey }) {
    if (sort !== k) return null
    return dir === 1 ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />
  }

  const th = (k: SortKey, label: string) => (
    <th
      onClick={() => toggleSort(k)}
      style={{ cursor: 'pointer', color: sort === k ? 'var(--accent2)' : 'var(--text2)', fontFamily: 'Syne, sans-serif', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 12px', textAlign: k === 'ticker' ? 'left' : 'right', whiteSpace: 'nowrap' }}
    >
      <span className="inline-flex items-center gap-1">{label}<SortIcon k={k} /></span>
    </th>
  )

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {th('ticker', 'Ticker')}
            {th('shares', 'Shares')}
            {th('buy_price', 'Buy Price')}
            {th('current_price', 'Current')}
            {th('pl', 'P&L')}
            {th('plpct', 'P&L %')}
            <th style={{ color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 12px', textAlign: 'center' }}>Signal</th>
            <th style={{ padding: '10px 12px' }} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(h => {
            const pl = (h.current_price - h.buy_price) * h.shares
            const plpct = h.buy_price > 0 ? ((h.current_price - h.buy_price) / h.buy_price) * 100 : 0
            const isAnalyzing = analyzingSet.has(h.id)
            return (
              <tr
                key={h.id}
                style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                className="hover:bg-surface2"
              >
                <td style={{ padding: '12px' }}>
                  <div>
                    <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>{h.ticker}</span>
                    {h.market !== 'US' && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text2)', background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>{h.market}</span>
                    )}
                    {h.sector && <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>{h.sector}</p>}
                  </div>
                </td>
                <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{fmt(h.shares)}</td>
                <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{fmtCurrency(h.buy_price)}</td>
                <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{fmtCurrency(h.current_price)}</td>
                <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 13, color: pl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {pl >= 0 ? '+' : ''}{fmtCurrency(pl)}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 13, color: plpct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {fmtPct(plpct)}
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  {isAnalyzing ? (
                    <IconLoader size={16} className="animate-spin" style={{ color: 'var(--accent)', display: 'inline-block' }} />
                  ) : h.signal ? (
                    <div className="flex flex-col items-center gap-1">
                      <SignalBadge signal={h.signal} />
                      {h.signal_reason && (
                        <span style={{ fontSize: 10, color: 'var(--text2)', maxWidth: 140, textAlign: 'center', display: 'block', lineHeight: 1.3 }} title={h.signal_reason}>
                          {h.signal_reason.slice(0, 60)}{h.signal_reason.length > 60 ? '…' : ''}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => onAnalyze(h)}
                      style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'Syne, sans-serif', cursor: 'pointer' }}
                    >
                      Analyze
                    </button>
                  )}
                </td>
                <td style={{ padding: '12px' }}>
                  <button
                    onClick={() => onDelete(h.id)}
                    className="p-1 rounded hover:bg-surface2 transition-colors"
                    style={{ color: 'var(--text2)' }}
                  >
                    <IconTrash size={15} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
