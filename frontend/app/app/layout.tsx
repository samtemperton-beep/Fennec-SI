'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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
import { FoxIcon } from '@/components/shared/FoxIcon'
import { MarketTicker } from '@/components/shared/MarketTicker'
import { Avatar } from '@/components/shared/Avatar'
import { PremiumBadge } from '@/components/premium/PremiumBadge'

// ── Section definitions ───────────────────────────────────────────────────────

type NavItem = { href: string; label: string; icon: typeof IconChartBar }
type NavGroup = { label: string; items: NavItem[] }
type Section = { label: string; icon: typeof IconChartBar; defaultHref: string; groups: NavGroup[] }

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
    ],
  },
  business: {
    label: 'Business',
    icon: IconBriefcase,
    defaultHref: '/app/finance/business',
    groups: [
      {
        label: 'Business',
        items: [
          { href: '/app/finance/business',              label: 'Overview',     icon: IconBriefcase },
          { href: '/app/finance/business/transactions', label: 'Transactions', icon: IconArrowsExchange },
          { href: '/app/finance/business/invoices',     label: 'Invoices',     icon: IconFileInvoice },
          { href: '/app/finance/business/tax',          label: 'Tax',          icon: IconCalculator },
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
} satisfies Record<string, Section>

type SectionKey = keyof typeof SECTIONS

function getActiveSection(pathname: string): SectionKey {
  if (pathname === '/app/dashboard') return 'dashboard'
  if (pathname.startsWith('/app/finance/business')) return 'business'
  if (pathname.startsWith('/app/finance')) return 'finance'
  if (pathname.startsWith('/app/community') || pathname.startsWith('/app/leaderboard') || pathname.startsWith('/app/alerts')) return 'community'
  if (pathname.startsWith('/app/settings') || pathname.startsWith('/app/admin')) return 'dashboard'
  return 'investing'
}

// Longest matching href wins, so /app/finance/business/tax doesn't also light up Overview
function getActiveHref(items: NavItem[], pathname: string): string | null {
  let best: string | null = null
  for (const { href } of items) {
    if ((pathname === href || pathname.startsWith(href + '/')) && (!best || href.length > best.length)) best = href
  }
  return best
}

// Swipes that start inside something that scrolls sideways (tables, the ticker,
// the sub-nav itself) or inside a form control belong to that element, not to page nav.
function swipeBlocked(target: EventTarget | null, boundary: HTMLElement): boolean {
  let el = target as HTMLElement | null
  while (el && el !== boundary) {
    if (el.matches('input, textarea, select, [contenteditable="true"], [data-no-swipe]')) return true
    if (el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
    el = el.parentElement
  }
  return false
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const subnavRef = useRef<HTMLDivElement>(null)
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const supabase = createClient()

  const activeSection = getActiveSection(pathname)
  const showTicker = activeSection === 'investing'
  const section: Section = SECTIONS[activeSection]
  const sectionItems = section.groups.flatMap(g => g.items)
  const activeHref = getActiveHref(sectionItems, pathname)
  const activeIndex = sectionItems.findIndex(i => i.href === activeHref)

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
          .select('username, avatar_color, avatar_emoji, avatar_url, location, profession, is_premium, is_admin, onboarding_complete, enabled_features')
          .eq('id', data.user.id).single()
        setProfile(p)
        if (p?.is_premium) setIsPremium(true)
        if (p?.is_admin) setIsAdmin(true)
        // Redirect new users to onboarding
        if (p && p.onboarding_complete === false) {
          router.push('/onboarding')
        }
      }
    })
  }, [])

  // Close the account menu on navigation or outside click
  useEffect(() => { setMenuOpen(false) }, [pathname])
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  // Keep the active sub-nav pill in view on narrow screens
  useEffect(() => {
    const active = subnavRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [pathname])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Which top-level sections the user has enabled (null = all, for backwards compat)
  const enabledFeatures: string[] | null = profile?.enabled_features ?? null
  const SECTION_FEATURE_MAP: Record<SectionKey, string> = {
    dashboard: 'dashboard',
    investing: 'investments',
    finance: 'finance',
    business: 'business',
    community: 'community',
  }
  const sectionVisible = (key: SectionKey) => {
    if (!enabledFeatures) return true
    if (key === 'dashboard') return true // always show
    // Business used to live under Finance, so finance users keep access
    if (key === 'business') return enabledFeatures.includes('business') || enabledFeatures.includes('finance')
    return enabledFeatures.includes(SECTION_FEATURE_MAP[key])
  }

  // ── Swipe between pages within the current section ──
  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1 || sectionItems.length < 2 || swipeBlocked(e.target, e.currentTarget)) {
      touchRef.current = null
      return
    }
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
  }

  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const start = touchRef.current
    touchRef.current = null
    if (!start || activeIndex < 0) return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Date.now() - start.t > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return
    if (window.getSelection()?.toString()) return
    const nextIndex = dx < 0 ? activeIndex + 1 : activeIndex - 1
    const next = sectionItems[nextIndex]
    if (!next) return
    setSlideDir(dx < 0 ? 'left' : 'right')
    router.push(next.href)
  }

  useEffect(() => {
    if (!slideDir) return
    const t = setTimeout(() => setSlideDir(null), 300)
    return () => clearTimeout(t)
  }, [slideDir, pathname])

  const sectionTabs = (Object.entries(SECTIONS) as [SectionKey, Section][])
    .filter(([key]) => key !== 'dashboard' && sectionVisible(key))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <header className="topnav">
        <div className="topnav-bar">
          {/* Logo — doubles as the Dashboard button */}
          <Link
            href="/app/dashboard"
            className={`topnav-logo ${activeSection === 'dashboard' && pathname === '/app/dashboard' ? 'active' : ''}`}
            title="Dashboard"
          >
            <div className="topnav-logo-badge">
              <FoxIcon size={28} />
            </div>
            <div className="topnav-wordmark">
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', fontFamily: 'Plus Jakarta Sans, sans-serif', display: 'block', lineHeight: 1.2 }}>Fennec</span>
              <span style={{ fontSize: 9.5, color: 'var(--text3)', fontStyle: 'italic', lineHeight: 1 }}>spend &amp; invest</span>
            </div>
          </Link>

          {/* Main sections */}
          <nav className="topnav-sections">
            {sectionTabs.map(([key, s]) => {
              const Icon = s.icon
              return (
                <Link key={key} href={s.defaultHref} title={s.label} className={`topnav-section ${activeSection === key ? 'active' : ''}`}>
                  <Icon size={18} />
                  <span>{s.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Account menu */}
          <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="topnav-avatar"
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
              <Avatar
                username={profile?.username || user?.email || '?'}
                avatarColor={profile?.avatar_color}
                avatarEmoji={profile?.avatar_emoji}
                avatarUrl={profile?.avatar_url}
                size={32}
              />
            </button>
            {menuOpen && (
              <div className="topnav-menu">
                {user && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, background: 'var(--surface2)', marginBottom: 6 }}>
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
                <Link href="/app/settings" className={`nav-link mb-1 ${pathname === '/app/settings' ? 'active' : ''}`}>
                  <IconSettings size={15} /> Settings
                </Link>
                {isAdmin && (
                  <Link href="/app/admin" className={`nav-link mb-1 ${pathname === '/app/admin' ? 'active' : ''}`}>
                    <IconShield size={15} /> Admin
                  </Link>
                )}
                <button onClick={toggleTheme} className="nav-link w-full mb-1">
                  {theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                <button onClick={signOut} className="nav-link w-full" style={{ color: 'var(--text2)' }}>
                  <IconLogout size={15} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Pages within the current section */}
        {sectionItems.length > 0 && (
          <div ref={subnavRef} className="topnav-subnav" data-no-swipe>
            {section.groups.map((group, gi) => (
              <div key={group.label} style={{ display: 'contents' }}>
                {gi > 0 && <span className="topnav-subnav-divider" aria-hidden />}
                {group.items.map(n => {
                  const isActive = n.href === activeHref
                  return (
                    <Link key={n.href} href={n.href} data-active={isActive} className={`topnav-pill ${isActive ? 'active' : ''}`}>
                      <n.icon size={14} />
                      {n.label}
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </header>

      {/* Market ticker — investing section only */}
      {showTicker && <MarketTicker />}

      <main
        style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div key={pathname} className={`app-page${slideDir ? ` swipe-in-${slideDir}` : ''}`}>
          {children}
        </div>
      </main>
      <FennecAI />
    </div>
  )
}
