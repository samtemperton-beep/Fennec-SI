'use client'
import { useEffect, useState, useRef } from 'react'
import { api } from '@/lib/api'

const INDICES = [
  { ticker: 'SPY',  label: 'S&P 500' },
  { ticker: 'QQQ',  label: 'Nasdaq' },
  { ticker: 'DIA',  label: 'Dow 30' },
  { ticker: 'IWM',  label: 'Russell 2000' },
  { ticker: 'GLD',  label: 'Gold' },
  { ticker: 'TLT',  label: '20Y Bond' },
  { ticker: 'USO',  label: 'Oil' },
  { ticker: 'BTC-USD', label: 'Bitcoin' },
]

interface Quote { price: number; change?: number; changePct?: number }

export function MarketTicker() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const tickers = INDICES.map(i => i.ticker)
      const data = await api.getPrices(tickers)
      setQuotes(data)
    } catch {}
  }

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  // Duplicate items for seamless loop
  const items = [...INDICES, ...INDICES]

  return (
    <div style={{
      height: 34,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      overflow: 'hidden',
      position: 'relative',
      flexShrink: 0,
    }}>
      {/* Fade edges */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 40, background: 'linear-gradient(to right, var(--surface), transparent)', zIndex: 2, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, background: 'linear-gradient(to left, var(--surface), transparent)', zIndex: 2, pointerEvents: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', height: '100%', animation: 'ticker-scroll 40s linear infinite', whiteSpace: 'nowrap' }}>
        {items.map((idx, i) => {
          const q = quotes[idx.ticker]
          const pct = q?.changePct ?? 0
          const up = pct >= 0
          const color = !q ? 'var(--text3)' : up ? 'var(--green)' : 'var(--red)'
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 20px', fontSize: 11.5, fontFamily: 'DM Mono, monospace', borderRight: '1px solid var(--border)', height: '100%' }}>
              <span style={{ color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>{idx.label}</span>
              {q ? (
                <>
                  <span style={{ color: 'var(--text)', fontWeight: 500 }}>{q.price?.toFixed(2)}</span>
                  <span style={{ color, fontWeight: 700 }}>{up ? '+' : ''}{pct.toFixed(2)}%</span>
                </>
              ) : (
                <span style={{ color: 'var(--text3)' }}>—</span>
              )}
            </span>
          )
        })}
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        div:hover > div[style*="ticker-scroll"] {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  )
}
