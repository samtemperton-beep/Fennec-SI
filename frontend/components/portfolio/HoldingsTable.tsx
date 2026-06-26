'use client'
import { useState } from 'react'
import { SignalBadge } from '@/components/shared/SignalBadge'
import { fmtCurrency, fmtPct } from '@/lib/utils'
import { IconChevronUp, IconChevronDown, IconLoader, IconExternalLink } from '@tabler/icons-react'
import { type Broker, getStockUrl } from '@/lib/brokers'

const BUBBLE_COLORS = ['#5B7CF0','#14B8A6','#22C55E','#F59E0B','#EF4444','#A855F7','#F97316','#0EA5E9','#EC4899','#6366F1']
function tickerColor(t: string) {
  let h = 0
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0
  return BUBBLE_COLORS[h % BUBBLE_COLORS.length]
}

export interface Holding {
  id: number
  ticker: string
  name?: string | null
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
  broker?: Broker | null
}

export function HoldingsTable({ holdings, analyzingSet, onDelete, onAnalyze, broker }: Props) {
  const [sort, setSort] = useState<SortKey>('ticker')
  const [dir, setDir] = useState<1 | -1>(1)
  const [hoveredId, setHoveredId] = useState<number | null>(null)

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

  const th = (k: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <th onClick={() => toggleSort(k)}
      style={{ cursor: 'pointer', color: sort === k ? 'var(--primary)' : 'var(--text3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '12px 16px', textAlign: align, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}
    >
      <span className="inline-flex items-center gap-1">{label}<SortIcon k={k} /></span>
    </th>
  )

  // Label for the broker link tooltip
  const brokerLabel = broker ? `View on ${broker.name}` : 'View on exchange'

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {th('ticker', 'Stock', 'left')}
            {th('current_price', 'Value')}
            {th('pl', 'Your gain')}
            {th('plpct', 'Return')}
            <th style={{ color: 'var(--text3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Signal</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(h => {
            const pl = (h.current_price - h.buy_price) * h.shares
            const plpct = h.buy_price > 0 ? ((h.current_price - h.buy_price) / h.buy_price) * 100 : 0
            const isAnalyzing = analyzingSet.has(h.id)
            const stockUrl = getStockUrl(broker, h.ticker, h.market)
            const isHovered = hoveredId === h.id
            return (
              <tr key={h.id}
                onMouseEnter={() => setHoveredId(h.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ borderBottom: '1px solid var(--border)', background: isHovered ? 'var(--surface2)' : undefined, transition: 'background 0.12s' }}
              >
                {/* Stock cell — clickable to broker/exchange */}
                <td style={{ padding: '12px 16px' }}>
                  <a href={stockUrl} target="_blank" rel="noopener noreferrer"
                    title={brokerLabel}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: tickerColor(h.ticker), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'white', flexShrink: 0, letterSpacing: '-.01em' }}>
                      {h.ticker.slice(0, 4)}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{h.name || h.ticker}</span>
                        {h.market !== 'US' && (
                          <span style={{ fontSize: 9, color: 'var(--text3)', background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>{h.market}</span>
                        )}
                        <IconExternalLink size={11} style={{ color: 'var(--primary)', opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s', flexShrink: 0 }} />
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
                        {h.shares} shares{h.name ? ` · ${h.ticker}` : ''}
                        {broker && isHovered && (
                          <span style={{ marginLeft: 6, color: 'var(--primary)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
                            {broker.flag} {broker.name} →
                          </span>
                        )}
                        {!broker && isHovered && (
                          <span style={{ marginLeft: 6, color: 'var(--text2)', fontFamily: 'Syne, sans-serif' }}>
                            {h.market === 'NZX' ? 'NZX →' : h.market === 'ASX' ? 'ASX →' : 'Yahoo Finance →'}
                          </span>
                        )}
                      </p>
                    </div>
                  </a>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 500 }}>{fmtCurrency(h.current_price * h.shares)}</p>
                  <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>@ {fmtCurrency(h.current_price)}</p>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 13, color: pl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                  {pl >= 0 ? '+' : ''}{fmtCurrency(pl)}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 13, color: plpct >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                  {fmtPct(plpct)}
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  {isAnalyzing ? (
                    <IconLoader size={16} className="animate-spin" style={{ color: 'var(--primary)', display: 'inline-block' }} />
                  ) : h.signal ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <SignalBadge signal={h.signal} />
                      {h.signal_reason && (
                        <span style={{ fontSize: 10, color: 'var(--text2)', maxWidth: 140, textAlign: 'center', display: 'block', lineHeight: 1.3 }} title={h.signal_reason}>
                          {h.signal_reason.slice(0, 60)}{h.signal_reason.length > 60 ? '…' : ''}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button onClick={() => onAnalyze(h)}
                      style={{ fontSize: 11, color: 'var(--primary)', fontFamily: 'Syne, sans-serif', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                    >
                      Analyze
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
