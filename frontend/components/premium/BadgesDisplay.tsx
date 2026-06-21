'use client'
import { useState } from 'react'

const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  platinum: '#e5e4e2',
}

interface Badge {
  badge_id: string
  earned_at: string
  metadata: any
  badges: {
    name: string
    description: string
    icon: string
    tier: string
  }
}

export function BadgesDisplay({ badges }: { badges: Badge[] }) {
  const [expanded, setExpanded] = useState(false)

  if (badges.length === 0) return null

  const shown = expanded ? badges : badges.slice(0, 6)

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div className="flex items-center justify-between mb-3">
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14 }}>
          🏆 Achievements
        </span>
        <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
          {badges.length} earned
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {shown.map(b => (
          <div
            key={b.badge_id}
            title={`${b.badges.name}: ${b.badges.description}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 20,
              background: 'var(--surface2)',
              border: `1px solid ${TIER_COLORS[b.badges.tier] || 'var(--border)'}`,
              fontSize: 12, fontFamily: 'Syne, sans-serif',
              cursor: 'default',
            }}
          >
            <span style={{ fontSize: 14 }}>{b.badges.icon}</span>
            <span style={{ color: TIER_COLORS[b.badges.tier], fontWeight: 600 }}>{b.badges.name}</span>
          </div>
        ))}
      </div>
      {badges.length > 6 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'Syne, sans-serif' }}
        >
          {expanded ? 'Show less' : `+${badges.length - 6} more`}
        </button>
      )}
    </div>
  )
}
