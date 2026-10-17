'use client'
import Link from 'next/link'
import { IconTarget, IconArrowRight, IconPlus } from '@tabler/icons-react'

function fmt(n: number) {
  return n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
}

export function GoalsCard({ goals, loading }: { goals: any[]; loading: boolean }) {
  return (
    <div className="dash-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="ins-icon"><IconTarget size={15} /></div>
          <span className="cf-title">Savings goals</span>
        </div>
        {goals.length > 0 && (
          <Link href="/app/finance/goals" className="cf-link">View all <IconArrowRight size={12} /></Link>
        )}
      </div>
      {loading ? (
        <div className="skeleton" style={{ height: 40 }} />
      ) : goals.length === 0 ? (
        <Link href="/app/finance/goals" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
          <IconPlus size={14} /> Set your first savings goal
        </Link>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {goals.map((g: any) => {
            const target = Number(g.target_amount)
            const saved = Number(g.current_amount)
            const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0
            return (
              <div key={g.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{g.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmt(saved)} / {fmt(target)}</span>
                </div>
                <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
