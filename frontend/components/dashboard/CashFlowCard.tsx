'use client'
import Link from 'next/link'
import { IconArrowsExchange, IconArrowRight } from '@tabler/icons-react'
import type { CashFlow } from '@/lib/spending'

function fmt(n: number) {
  const s = Math.abs(n).toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
  return n < 0 ? `−${s}` : s
}

export function CashFlowCard({ thisMonth, lastMonth, monthLabel, loading }: {
  thisMonth: CashFlow | null
  /** Last month up to the same day of the month, for a like-for-like comparison. */
  lastMonth: CashFlow | null
  monthLabel: string
  loading: boolean
}) {
  const income = thisMonth?.income ?? 0
  const spending = thisMonth?.spending ?? 0
  const left = income - spending
  const max = Math.max(income, spending, 1)

  const prevSpend = lastMonth?.spending ?? 0
  const spendDelta = prevSpend > 0 ? ((spending - prevSpend) / prevSpend) * 100 : null

  return (
    <div className="cf-card">
      <div className="cf-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="ins-icon"><IconArrowsExchange size={15} /></div>
          <span className="cf-title">Cash flow · {monthLabel}</span>
        </div>
        <Link href="/app/finance/transactions" className="cf-link">Transactions <IconArrowRight size={12} /></Link>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="skeleton" style={{ height: 34 }} />
          <div className="skeleton" style={{ height: 34 }} />
        </div>
      ) : !thisMonth ? (
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>Connect your bank on Finance → Accounts to see money in and out.</p>
      ) : (
        <>
          <div className="cf-rows">
            {[
              { label: 'In', value: income, cls: 'cf-in' },
              { label: 'Out', value: spending, cls: 'cf-out' },
            ].map(r => (
              <div key={r.label} className="cf-row">
                <span className="cf-row-label">{r.label}</span>
                <div className="cf-bar-track">
                  <div className={`cf-bar ${r.cls}`} style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
                </div>
                <span className="cf-row-value">{fmt(r.value)}</span>
              </div>
            ))}
          </div>

          <div className="cf-left">
            <span style={{ color: 'var(--text2)' }}>{left >= 0 ? 'Left over so far' : 'Spent more than came in'}</span>
            <span className="cf-left-value">{left >= 0 ? '+' : ''}{fmt(left)}</span>
          </div>

          {spendDelta !== null && (
            <p className="cf-compare">
              Spending is <strong>{Math.abs(spendDelta) < 1 ? 'about the same as' : `${Math.round(Math.abs(spendDelta))}% ${spendDelta > 0 ? 'higher' : 'lower'} than`}</strong> this
              time last month ({fmt(prevSpend)}).
            </p>
          )}
          {thisMonth.transfersExcluded > 0 && (
            <p className="cf-note">{fmt(thisMonth.transfersExcluded)} of transfers between your own accounts left out.</p>
          )}
        </>
      )}
    </div>
  )
}
