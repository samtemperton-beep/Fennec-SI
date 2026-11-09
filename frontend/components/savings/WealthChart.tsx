'use client'
// Lines over the coming years, one per pot, with an optional dashed total.
// Plain SVG like the KiwiSaver chart, so it follows the app's colours in light and dark.

export interface Series { label: string; color: string; values: number[]; dashed?: boolean }

const short = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
    : Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`

function niceStep(max: number) {
  const raw = max / 4
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  return [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw
}

export function WealthChart({ series, startYear, ariaLabel }: { series: Series[]; startYear: number; ariaLabel: string }) {
  const n = Math.max(0, ...series.map(s => s.values.length))
  if (n < 2) return null
  const W = 600, H = 220, PAD = { t: 12, r: 16, b: 28, l: 52 }
  const max = Math.max(1, ...series.flatMap(s => s.values))
  const step = niceStep(max)
  const top = Math.ceil(max / step) * step
  const x = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => H - PAD.b - (Math.max(0, v) / top) * (H - PAD.t - PAD.b)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t ? '3,4' : undefined} />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--text3)">{short(t)}</text>
          </g>
        ))}
        {Array.from({ length: n }, (_, i) => i).filter(i => n <= 6 || i % 2 === 0 || i === n - 1).map(i => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text3)">{i === 0 ? 'Now' : startYear + i}</text>
        ))}
        {series.map(s => (
          <g key={s.label}>
            <path d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
              fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.5 : 2.5} strokeDasharray={s.dashed ? '5,4' : undefined} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={x(s.values.length - 1)} cy={y(s.values[s.values.length - 1])} r={s.dashed ? 2.5 : 3.5} fill={s.color} />
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 6 }}>
        {series.map(s => (
          <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
            <span style={{ width: 14, height: 0, borderTop: `${s.dashed ? 2 : 3}px ${s.dashed ? 'dashed' : 'solid'} ${s.color}` }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
