'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The switch at the top of Finance → Savings: growth and comparisons, or goals.
// One menu tab for both keeps the Finance menu short.
const TABS = [
  { href: '/app/finance/savings', label: 'Growth' },
  { href: '/app/finance/savings/goals', label: 'Goals' },
]

export function SavingsTabs() {
  const pathname = usePathname()
  return (
    <div role="tablist" aria-label="Savings" style={{ display: 'inline-flex', gap: 4, background: 'var(--surface2)', borderRadius: 10, padding: 3 }}>
      {TABS.map(t => {
        const on = pathname === t.href
        return (
          <Link key={t.href} href={t.href} role="tab" aria-selected={on}
            style={{ padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none', background: on ? 'var(--primary)' : 'transparent', color: on ? 'white' : 'var(--text2)' }}>
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
