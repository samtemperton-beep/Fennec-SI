'use client'
import Link from 'next/link'
import { useRewards } from '@/components/budget/useRewards'

// Level, points to the next level and the weekly streak, in one line.
// On the Budget page and the dashboard; tapping it opens Budget → Wins.
export function ProgressStrip({ compact = false }: { compact?: boolean }) {
  const { loading, ready, points, level, streak, badges } = useRewards()
  if (loading || !ready) return null

  return (
    <Link href="/app/finance/budget/wins" className="card" data-amounts="show"
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: compact ? '12px 16px' : '14px 18px', marginBottom: compact ? 0 : 20, textDecoration: 'none', color: 'inherit', flexWrap: 'wrap' }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }} aria-hidden>🦊</div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>Level {level.number} · {level.name}</strong>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{points.toLocaleString('en-NZ')} pts</span>
        </div>
        <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden', margin: '6px 0 4px' }}
          role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level.progress * 100)} aria-label="Progress to next level">
          <div style={{ width: `${Math.max(3, level.progress * 100)}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--accent, var(--primary)))', borderRadius: 3 }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          {level.next ? `${level.toNext.toLocaleString('en-NZ')} pts to ${level.next.name}` : 'Top level reached'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{streak > 0 ? '🔥' : '🌱'} {streak}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>week streak</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🏅 {badges.size}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>badges</div>
        </div>
      </div>
    </Link>
  )
}
