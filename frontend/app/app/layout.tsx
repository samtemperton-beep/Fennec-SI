'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import {
  IconChartBar, IconBrain, IconTrendingUp, IconStar, IconEye,
  IconNewSection, IconMail, IconCalendar, IconUsers, IconBell,
  IconSettings, IconLogout, IconTrophy,
  IconSun, IconMoon, IconShield, IconBuildingBank, IconArrowsExchange,
  IconWallet, IconReceipt, IconTarget, IconLayoutDashboard, IconPigMoney,
  IconBriefcase, IconCalculator, IconFileInvoice, IconHome, IconInbox,
} from '@tabler/icons-react'
import { FennecAI } from '@/components/shared/FennecAI'
import { MarketTicker } from '@/components/shared/MarketTicker'
import { Avatar } from '@/components/shared/Avatar'
import { PremiumBadge } from '@/components/premium/PremiumBadge'

// ── Section definitions ───────────────────────────────────────────────────────

const SECTIONS = {
  dashboard: {
    label: 'Dashboard',
    icon: IconLayoutDashboard,
    defaultHref: '/app/dashboard',
    groups: [],
  },
  investing: {
    label: 'Investing',
    icon: IconTrendingUp,
    defaultHref: '/app/portfolio',
    groups: [
      {
        label: 'My Investing',
        items: [
          { href: '/app/portfolio',     label: 'My Portfolio',   icon: IconChartBar },
          { href: '/app/top10',         label: "Today's Picks",  icon: IconStar },
          { href: '/app/opportunities', label: 'Discover',       icon: IconBrain },
          { href: '/app/watchlist',     label: 'Watchlist',      icon: IconEye },
        ],
      },
      {
        label: 'Market',
        items: [
          { href: '/app/news',        label: 'News',        icon: IconNewSection },
          { href: '/app/newsletters', label: 'Newsletters', icon: IconMail },
          { href: '/app/ipo',         label: 'Events',      icon: IconCalendar },
        ],
      },
    ],
  },
  finance: {
    label: 'Finance',
    icon: IconBuildingBank,
    defaultHref: '/app/finance/accounts',
    groups: [
      {
        label: 'Household',
        items: [
          { href: '/app/finance/accounts',     label: 'Accounts',     icon: IconBuildingBank },
          { href: '/app/finance/transactions', label: 'Transactions', icon: IconArrowsExchange },
          { href: '/app/finance/budget',       label: 'Budget',       icon: IconWallet },
          { href: '/app/finance/bills',        label: 'Bills',        icon: IconReceipt },
          { href: '/app/finance/goals',        label: 'Goals',        icon: IconTarget },
          { href: '/app/finance/kiwisaver',    label: 'KiwiSaver',    icon: IconPigMoney },
          { href: '/app/finance/homeloan',     label: 'Home Loan',    icon: IconHome },
          { href: '/app/finance/inbox',        label: 'Email Inbox',  icon: IconInbox },
        ],
      },
      {
        label: 'Business',
        items: [
          { href: '/app/finance/business',                  label: 'Overview',      icon: IconBriefcase },
          { href: '/app/finance/business/transactions',     label: 'Transactions',  icon: IconArrowsExchange },
          { href: '/app/finance/business/invoices',         label: 'Invoices',      icon: IconFileInvoice },
          { href: '/app/finance/business/tax',              label: 'Tax',           icon: IconCalculator },
        ],
      },
    ],
  },
  community: {
    label: 'Community',
    icon: IconUsers,
    defaultHref: '/app/community',
    groups: [
      {
        label: 'Community',
        items: [
          { href: '/app/community',   label: 'Community',    icon: IconUsers },
          { href: '/app/leaderboard', label: 'Leaderboard',  icon: IconTrophy },
          { href: '/app/alerts',      label: 'Notifications', icon: IconBell },
        ],
      },
    ],
  },
} as const

type SectionKey = keyof typeof SECTIONS

function getActiveSection(pathname: string): SectionKey {
  if (pathname === '/app/dashboard') return 'dashboard'
  if (pathname.startsWith('/app/finance')) return 'finance'
  if (pathname.startsWith('/app/community') || pathname.startsWith('/app/leaderboard') || pathname.startsWith('/app/alerts')) return 'community'
  return 'investing'
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [isPremium, setIsPremium] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('light')
  const supabase = createClient()

  const activeSection = getActiveSection(pathname)
  const showTicker = activeSection === 'investing'

  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem('theme')) || 'light'
    setTheme(saved as 'dark' | 'light')
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user)
      if (data.user) {
        const { data: p } = await supabase.from('profiles')
          .select('username, avatar_color, avatar_emoji, avatar_url, location, profession, is_premium, is_admin')
          .eq('id', data.user.id).single()
        setProfile(p)
        if (p?.is_premium) setIsPremium(true)
        if (p?.is_admin) setIsAdmin(true)
      }
    })
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const section = SECTIONS[activeSection]

  const sidebar = (
    <aside style={{
      width: 240,
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)' }}>
        <Link href="/app/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IconTrendingUp size={18} color="white" />
          </div>
          <div>
            <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', fontFamily: 'Plus Jakarta Sans, sans-serif', display: 'block', lineHeight: 1.2 }}>Fennec</span>
            <span style={{ fontSize: 9.5, color: 'var(--text3)', fontStyle: 'italic', lineHeight: 1 }}>spend &amp; invest</span>
          </div>
        </Link>
      </div>

      {/* Section switcher */}
      <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 3 }}>
        {(Object.entries(SECTIONS) as [SectionKey, typeof SECTIONS[SectionKey]][]).map(([key, s]) => {
          const Icon = s.icon
          const isActive = activeSection === key
          return (
            <Link
              key={key}
              href={s.defaultHref}
              title={s.label}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '6px 2px', borderRadius: 7, textDecoration: 'none', minWidth: 0,
                background: isActive ? 'var(--primary-light)' : 'transparent',
                border: isActive ? '1px solid var(--primary)' : '1px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={15} style={{ color: isActive ? 'var(--primary)' : 'var(--text3)', flexShrink: 0 }} />
              <span style={{ fontSize: 7.5, fontWeight: 700, fontFamily: 'Syne, sans-serif', color: isActive ? 'var(--primary)' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.02em', lineHeight: 1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                {s.label}
              </span>
            </Link>
          )
        })}
      </div>

      {/* Sub-nav */}
      <nav style={{ flex: 1, padding: '6px 10px', overflowY: 'auto' }}>
        {activeSection === 'dashboard' ? (
          <div style={{ padding: '20px 8px', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>Select a section above to navigate</p>
          </div>
        ) : (
          (section as any).groups.map((group: any) => (
            <div key={group.label}>
              <span style={{ display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em', color: 'var(--text3)', textTransform: 'uppercase', padding: '12px 8px 5px' }}>
                {group.label}
              </span>
              {group.items.map((n: any) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`nav-link mb-1 ${pathname === n.href || pathname.startsWith(n.href + '/') ? 'active' : ''}`}
                >
                  <n.icon size={16} />
                  {n.label}
                </Link>
              ))}
            </div>
          ))
        )}
      </nav>

      {/* Footer */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
        <Link href="/app/settings" className={`nav-link mb-1 ${pathname === '/app/settings' ? 'active' : ''}`} style={{ marginBottom: 2 }}>
          <IconSettings size={15} /> Settings
        </Link>
        {isAdmin && (
          <Link href="/app/admin" className={`nav-link mb-1 ${pathname === '/app/admin' ? 'active' : ''}`} style={{ marginBottom: 2 }}>
            <IconShield size={15} /> Admin
          </Link>
        )}
        <button onClick={toggleTheme} className="nav-link w-full mb-1" style={{ marginBottom: 2 }}>
          {theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button onClick={signOut} className="nav-link w-full" style={{ color: 'var(--text2)' }}>
          <IconLogout size={15} /> Sign out
        </button>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, background: 'var(--surface2)', marginTop: 8 }}>
            <Avatar
              username={profile?.username || user.email}
              avatarColor={profile?.avatar_color}
              avatarEmoji={profile?.avatar_emoji}
              avatarUrl={profile?.avatar_url}
              size={30}
            />
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.username || user.email}
              </div>
              {isPremium ? (
                <PremiumBadge size="sm" />
              ) : profile?.profession ? (
                <div style={{ fontSize: 10, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.profession}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </aside>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Permanent sidebar — always visible, always pushes content right */}
      {sidebar}

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Market ticker — investing section only */}
        {showTicker && <MarketTicker />}

        <div style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </div>
      </main>
      <FennecAI />
    </div>
  )
}
