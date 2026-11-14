'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// A switch at the top of a page, for two pages that share one menu tab
// (Accounts | Transactions, Home Loan | Rental), so the Finance menu stays short.
// The menu item lists the other page in `also` (app/app/layout.tsx).

export const ACCOUNTS_TABS = [
  { href: '/app/finance/accounts', label: 'Accounts' },
  { href: '/app/finance/transactions', label: 'Transactions' },
]
export const PROPERTY_TABS = [
  { href: '/app/finance/homeloan', label: 'Home Loan' },
  { href: '/app/finance/rental', label: 'Rental' },
]

export function SubTabs({ tabs, label }: { tabs: { href: string; label: string }[]; label: string }) {
  const pathname = usePathname()
  return (
    <div role="tablist" aria-label={label} style={{ display: 'inline-flex', gap: 4, background: 'var(--surface2)', borderRadius: 10, padding: 3, marginBottom: 16 }}>
      {tabs.map(t => {
        const on = pathname === t.href || pathname.startsWith(t.href + '/')
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
