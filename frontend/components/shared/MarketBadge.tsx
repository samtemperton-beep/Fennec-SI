import type { Market } from '@/lib/markets'

// Colour-coded market tag, so FPH (NZX) and FPH (US) can't be confused.
// The words carry the meaning; the colour is a quick extra cue.
const STYLE: Record<Market, { label: string; color: string; bg: string }> = {
  NZX: { label: 'NZX', color: '#0f9d8f', bg: 'rgba(20,184,166,0.14)' },
  ASX: { label: 'ASX', color: '#d97706', bg: 'rgba(245,158,11,0.15)' },
  US:  { label: 'US',  color: '#4f6ee8', bg: 'rgba(91,124,240,0.15)' },
}

export function MarketBadge({ market }: { market: Market }) {
  const s = STYLE[market]
  return (
    <span title={market === 'US' ? 'US market' : `${market} (${market === 'NZX' ? 'New Zealand' : 'Australia'})`}
      style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: s.color, background: s.bg, padding: '1px 6px', borderRadius: 4, verticalAlign: 'middle', lineHeight: 1.5 }}>
      {s.label}
    </span>
  )
}
