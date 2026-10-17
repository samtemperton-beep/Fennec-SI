'use client'
import Link from 'next/link'
import {
  IconBuildingBank, IconTarget, IconChartBar, IconArrowsExchange,
  IconWallet, IconNewSection, IconPigMoney, IconHome, IconFileInvoice,
} from '@tabler/icons-react'

const LINKS = [
  { href: '/app/portfolio', label: 'Portfolio', icon: IconChartBar, section: 'Investing', feature: 'investments' },
  { href: '/app/finance/accounts', label: 'Accounts', icon: IconBuildingBank, section: 'Finance', feature: 'finance' },
  { href: '/app/finance/transactions', label: 'Transactions', icon: IconArrowsExchange, section: 'Finance', feature: 'finance' },
  { href: '/app/finance/budget', label: 'Budget', icon: IconWallet, section: 'Finance', feature: 'finance' },
  { href: '/app/finance/goals', label: 'Goals', icon: IconTarget, section: 'Finance', feature: 'finance' },
  { href: '/app/finance/kiwisaver', label: 'KiwiSaver', icon: IconPigMoney, section: 'Finance', feature: 'finance' },
  { href: '/app/finance/homeloan', label: 'Home Loan', icon: IconHome, section: 'Finance', feature: 'finance' },
  { href: '/app/finance/business/invoices', label: 'Invoices', icon: IconFileInvoice, section: 'Business', feature: 'business' },
  { href: '/app/news', label: 'News', icon: IconNewSection, section: 'Investing', feature: 'investments' },
]

export function QuickLinksCard({ enabledFeatures }: { enabledFeatures: string[] | null }) {
  const links = LINKS.filter(l => !enabledFeatures || enabledFeatures.includes(l.feature))
  return (
    <div>
      <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>Quick Access</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
        {links.map(({ href, label, icon: Icon, section }) => (
          <Link key={href} href={href} style={{ textDecoration: 'none', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, transition: 'border-color 0.15s' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={16} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{label}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{section}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
