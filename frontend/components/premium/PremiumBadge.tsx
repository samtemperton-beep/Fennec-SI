'use client'

export function PremiumBadge({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const styles: Record<string, React.CSSProperties> = {
    sm: { fontSize: 10, padding: '2px 7px', borderRadius: 10 },
    lg: { fontSize: 12, padding: '4px 10px', borderRadius: 12 },
  }
  return (
    <span
      style={{
        ...styles[size],
        background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
        color: '#1a1a1a',
        fontFamily: 'Syne, sans-serif',
        fontWeight: 700,
        letterSpacing: 0.3,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        verticalAlign: 'middle',
      }}
    >
      ✦ PREMIUM
    </span>
  )
}
