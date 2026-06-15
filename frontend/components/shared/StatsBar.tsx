'use client'
import { fmtCurrency, fmtPct } from '@/lib/utils'

interface Stat {
  label: string
  value: string | number
  sub?: string
  type?: 'currency' | 'pct' | 'number' | 'text'
  positive?: boolean
}

export function StatsBar({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {stats.map((s, i) => (
        <div key={i} className="card py-3 px-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text2)', fontFamily: 'Syne, sans-serif' }}>
            {s.label}
          </p>
          <p
            className="text-xl font-bold"
            style={{
              fontFamily: 'DM Mono, monospace',
              color: s.positive === true ? 'var(--green)' : s.positive === false ? 'var(--red)' : 'var(--text)',
            }}
          >
            {s.type === 'currency' ? fmtCurrency(Number(s.value))
              : s.type === 'pct' ? fmtPct(Number(s.value))
              : s.value}
          </p>
          {s.sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{s.sub}</p>}
        </div>
      ))}
    </div>
  )
}
