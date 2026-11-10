'use client'
export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { BudgetTabs } from '@/components/budget/BudgetTabs'
import { ProgressStrip } from '@/components/budget/ProgressStrip'
import { useRewards } from '@/components/budget/useRewards'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { BADGES, LEVELS, REWARD_LABEL, badgeById } from '@/lib/rewards'
import { timeAgo } from '@/lib/utils'

// Budget → Wins: level, streak, badges and recent points.
export default function WinsPage() {
  const { rows, loading, ready, badges } = useRewards()

  return (
    <div style={{ padding: 24, maxWidth: 900 }} className="m-pad" data-amounts="show">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Wins</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>Points, streaks and badges for sticking to your budget and your pledges</p>
        </div>
        <BudgetTabs />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><LoadingSpinner size={28} /></div>
      ) : !ready ? (
        <div className="card" style={{ padding: 24, color: 'var(--text2)', fontSize: 13 }}>Wins are being switched on. Check back soon.</div>
      ) : (
        <>
          <ProgressStrip />

          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>How to earn points</h2>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
              <li><strong style={{ color: 'var(--text)' }}>+25</strong> for each week (Monday to Sunday) your spending stays under budget</li>
              <li><strong style={{ color: 'var(--text)' }}>+100</strong> for each month under budget</li>
              <li><strong style={{ color: 'var(--text)' }}>+20</strong> for each week you keep a <Link href="/app/finance/budget/pledges" style={{ color: 'var(--primary)' }}>pledge</Link></li>
              <li>Extra points for every badge below</li>
            </ul>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
              Spending counts against your budget when it’s in a budgeted category, so keep transactions sorted. New wins are checked every morning.
              Levels: {LEVELS.map(l => `${l.name} (${l.at})`).join(' · ')}.
            </p>
          </div>

          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Badges · {badges.size} of {BADGES.length}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
            {BADGES.map(b => {
              const got = badges.has(b.id)
              const when = rows?.find(r => r.kind === 'badge' && r.ref === b.id)?.earned_at
              return (
                <div key={b.id} className="card" title={b.how}
                  style={{ padding: 14, textAlign: 'center', opacity: got ? 1 : 0.55, border: got ? '1.5px solid var(--primary)' : undefined }}>
                  <div style={{ fontSize: 30, filter: got ? 'none' : 'grayscale(1)', marginBottom: 4 }} aria-hidden>{got ? b.icon : '🔒'}</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 }}>{b.how}</div>
                  <div style={{ fontSize: 11, color: got ? 'var(--primary)' : 'var(--text3)', marginTop: 6, fontWeight: 600 }}>
                    {got ? `Earned ${when ? timeAgo(when) : ''}` : `+${b.points} pts`}
                  </div>
                </div>
              )
            })}
          </div>

          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Recent points</h2>
          {!rows?.length ? (
            <div className="card" style={{ padding: 20, fontSize: 13, color: 'var(--text2)' }}>
              Nothing yet. <Link href="/app/finance/budget" style={{ color: 'var(--primary)' }}>Set a few budgets</Link> or <Link href="/app/finance/budget/pledges" style={{ color: 'var(--primary)' }}>make a pledge</Link> to start earning.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {rows.slice(0, 15).map((r, i) => {
                const b = r.kind === 'badge' ? badgeById(r.ref) : null
                const what = b ? `${b.icon} ${b.name}` : r.kind === 'week_under' ? `${REWARD_LABEL.week_under}: week of ${new Date(`${r.ref}T12:00:00Z`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
                  : r.kind === 'month_under' ? `${REWARD_LABEL.month_under}: ${new Date(`${r.ref}-01T12:00:00Z`).toLocaleDateString('en-NZ', { month: 'long', timeZone: 'UTC' })}`
                  : REWARD_LABEL[r.kind] ?? r.kind
                return (
                  <div key={`${r.kind}:${r.ref}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                    <span style={{ flex: 1 }}>{what}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{timeAgo(r.earned_at)}</span>
                    <strong style={{ color: 'var(--green)', minWidth: 48, textAlign: 'right' }}>+{r.points}</strong>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
