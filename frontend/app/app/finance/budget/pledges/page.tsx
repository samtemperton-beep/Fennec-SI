'use client'
export const dynamic = 'force-dynamic'
import { BudgetTabs } from '@/components/budget/BudgetTabs'
import { Pledges } from '@/components/budget/Pledges'
import { Buddies } from '@/components/budget/Buddies'

// Budget → Pledges: no-spend pledges and your accountability buddy.
export default function PledgesPage() {
  return (
    <div style={{ padding: 24, maxWidth: 900 }} className="m-pad">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Pledges</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>Cut out the spending you regret, with a friend in your corner</p>
        </div>
        <BudgetTabs />
      </div>
      <Pledges />
      <Buddies />
    </div>
  )
}
