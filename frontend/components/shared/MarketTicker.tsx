'use client'
import { useEffect, useState, useRef } from 'react'

interface TickerItem {
  ticker: string
  label: string
  market: string
  price: number
  changePct: number
}

// Returns whether a given exchange is currently open, based on UTC time
function getMarketStatus(market: string): 'open' | 'closed' | 'always' {
  if (market === '24h') return 'always'
  const now = new Date()
  const utcH = now.getUTCHours()
  const utcM = now.getUTCMinutes()
  const utcMins = utcH * 60 + utcM
  const day = now.getUTCDay() // 0=Sun, 6=Sat

  if (market === 'US') {
    // NYSE/NASDAQ: Mon-Fri 13:30–20:00 UTC
    if (day === 0 || day === 6) return 'closed'
    return utcMins >= 810 && utcMins < 1200 ? 'open' : 'closed'
  }
  if (market === 'ASX') {
    // ASX: Mon-Fri 23:00 (prev day UTC) – 05:00 UTC
    // In UTC terms: open when utcMins < 300 (0:00–5:00) or utcMins >= 1380 (23:00–24:00)
    // ASX trades Mon(AEST)–Fri(AEST) = Sun(UTC)–Thu(UTC) nights
    if (day === 5 || day === 6) return 'closed' // Fri/Sat UTC = Sat/Sun AEST
    return (utcMins >= 1380 || utcMins < 300) ? 'open' : 'closed'
  }
  if (market === 'NZX') {
    // NZX: Mon-Fri 21:00 UTC (prev day) – 03:45 UTC
    if (day === 5 || day === 6) return 'closed'
    return (utcMins >= 1260 || utcMins < 225) ? 'open' : 'closed'
  }
  return 'closed'
}

const STATUS_COLOR: Record<string, string> = {
  open:   '#22c55e',
  closed: 'var(--text3)',
  always: '#22c55e',
}

export function MarketTicker() {
  const [items, setItems] = useState<TickerItem[]>([])
  const [now, setNow] = useState(new Date())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || ''
      const res = await fetch(`${base}/api/prices/market-ticker`)
      if (res.ok) setItems(await res.json())
    } catch {}
  }

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 60_000)
    // Refresh market-open status every minute
    clockRef.current = setInterval(() => setNow(new Date()), 60_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (clockRef.current) clearInterval(clockRef.current)
    }
  }, [])

  // Duplicate for seamless loop
  const doubled = [...items, ...items]

  return (
    <div style={{
      height: 34,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      overflow: 'hidden',
      position: 'relative',
      flexShrink: 0,
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 40, background: 'linear-gradient(to right, var(--surface), transparent)', zIndex: 2, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, background: 'linear-gradient(to left, var(--surface), transparent)', zIndex: 2, pointerEvents: 'none' }} />

      <div className="ticker-track">
        {doubled.map((item, i) => {
          const pct = item.changePct ?? 0
          const up = pct >= 0
          const color = item.price === 0 ? 'var(--text3)' : up ? 'var(--green)' : 'var(--red)'
          const status = getMarketStatus(item.market)
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 20px', fontSize: 11.5, fontFamily: 'DM Mono, monospace', borderRight: '1px solid var(--border)', height: '100%' }}>
              {/* Market open/closed dot */}
              <span title={status === 'always' ? '24h market' : status === 'open' ? 'Market open' : 'Market closed'} style={{
                width: 5, height: 5, borderRadius: '50%',
                background: STATUS_COLOR[status],
                flexShrink: 0,
                boxShadow: status !== 'closed' ? `0 0 4px ${STATUS_COLOR[status]}` : 'none',
              }} />
              <span style={{ color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>{item.label}</span>
              {item.price > 0 ? (
                <>
                  <span style={{ color: 'var(--text)', fontWeight: 500 }}>{item.price.toFixed(2)}</span>
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
        .ticker-track {
          display: flex;
          align-items: center;
          height: 100%;
          white-space: nowrap;
          animation: ticker-scroll 40s linear infinite;
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
