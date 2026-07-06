'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Avatar } from '@/components/shared/Avatar'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconTrophy, IconShieldCheck } from '@tabler/icons-react'

interface LeaderboardEntry {
  rank: number
  userId: string
  username: string
  avatarColor: string
  avatarEmoji?: string
  avatarUrl?: string
  gainPct: number
  portfolioValue: number
}

const RANK_MEDALS = ['🥇', '🥈', '🥉']

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getLeaderboard()
      .then(r => setEntries(r.leaderboard))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
      <div className="flex items-center gap-3 mb-2">
        <IconTrophy size={22} style={{ color: '#fbbf24' }} />
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Leaderboard</h1>
      </div>
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 24 }}>
        Top verified portfolios ranked by overall gain. Only broker-synced holdings count toward your rank — manually added stocks are excluded to keep the leaderboard fair.
      </p>

      {loading ? (
        <div className="flex justify-center py-20"><LoadingSpinner size={32} /></div>
      ) : entries.length === 0 ? (
        <div className="card text-center py-16">
          <IconShieldCheck size={40} style={{ color: 'var(--text2)', margin: '0 auto 12px' }} />
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 18, marginBottom: 8 }}>No verified portfolios yet</p>
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>
            Verify your portfolio from the Portfolio page to appear on the leaderboard.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map(entry => (
            <div
              key={entry.userId}
              className="card"
              style={{
                padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: 14,
                border: entry.rank <= 3 ? '1px solid rgba(251,191,36,0.3)' : undefined,
                background: entry.rank === 1 ? 'rgba(251,191,36,0.05)' : undefined,
              }}
            >
              <div style={{ width: 28, textAlign: 'center', fontSize: entry.rank <= 3 ? 20 : 14, fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--text2)' }}>
                {entry.rank <= 3 ? RANK_MEDALS[entry.rank - 1] : `#${entry.rank}`}
              </div>

              <Avatar
                username={entry.username}
                avatarColor={entry.avatarColor}
                avatarEmoji={entry.avatarEmoji}
                avatarUrl={entry.avatarUrl}
                size={36}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>
                    {entry.username || 'Anonymous'}
                  </span>
                  <IconShieldCheck size={13} style={{ color: 'var(--green)', flexShrink: 0 }} title="Verified portfolio" />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
                  Portfolio value: ${entry.portfolioValue.toLocaleString()}
                </span>
              </div>

              <div style={{
                fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 16,
                color: entry.gainPct >= 0 ? 'var(--green)' : 'var(--red)',
              }}>
                {entry.gainPct >= 0 ? '+' : ''}{entry.gainPct.toFixed(2)}%
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: 24, fontSize: 11, color: 'var(--text2)', textAlign: 'center' }}>
        Rankings based on verified holdings only. Updated in real time as prices refresh.
      </p>
    </div>
  )
}
