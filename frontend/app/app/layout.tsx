'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import {
  IconChartBar, IconBrain, IconTrendingUp, IconStar, IconEye,
  IconNewSection, IconMail, IconCalendar, IconUsers, IconBell,
  IconSettings, IconMenu2, IconX, IconLogout, IconTrophy,
  IconSun, IconMoon,
} from '@tabler/icons-react'
import { StockHelper } from '@/components/shared/StockHelper'
import { Avatar } from '@/components/shared/Avatar'
import { PremiumBadge } from '@/components/premium/PremiumBadge'

const NAV_SECTIONS = [
  {
    label: 'Investing',
    items: [
      { href: '/app/portfolio', label: 'My Portfolio', icon: IconChartBar },
      { href: '/app/top10', label: "Today's Picks", icon: IconStar },
      { href: '/app/opportunities', label: 'Discover', icon: IconBrain },
      { href: '/app/watchlist', label: 'Watchlist', icon: IconEye },
    ],
  },
  {
    label: 'Market',
    items: [
      { href: '/app/news', label: 'News', icon: IconNewSection },
      { href: '/app/newsletters', label: 'Newsletters', icon: IconMail },
      { href: '/app/ipo', label: 'IPO Calendar', icon: IconCalendar },
    ],
  },
  {
    label: 'Community',
    items: [
      { href: '/app/community', label: 'Community', icon: IconUsers },
      { href: '/app/leaderboard', label: 'Leaderboard', icon: IconTrophy },
      { href: '/app/alerts', label: 'Alerts', icon: IconBell },
    ],
  },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [isPremium, setIsPremium] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('light')
  const supabase = createClient()

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
        const { data: p } = await supabase.from('profiles').select('username, avatar_color, avatar_emoji, avatar_url, location, profession, is_premium').eq('id', data.user.id).single()
        setProfile(p)
        if (p?.is_premium) setIsPremium(true)
      }
    })
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

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
      {/* Logo + tagline */}
      <div style={{ padding: '22px 18px 16px', borderBottom: '1px solid var(--border)' }}>
        <Link href="/app/portfolio" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, textDecoration: 'none' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IconTrendingUp size={18} color="white" />
          </div>
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Fennec SI</span>
        </Link>
        <p style={{ fontSize: 10.5, color: 'var(--text3)', fontStyle: 'italic', paddingLeft: 44, lineHeight: 1.3, marginTop: -2 }}>grow with confidence</p>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
        {NAV_SECTIONS.map(section => (
          <div key={section.label}>
            <span style={{ display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em', color: 'var(--text3)', textTransform: 'uppercase', padding: '14px 8px 5px' }}>
              {section.label}
            </span>
            {section.items.map(n => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={`nav-link mb-1 ${pathname === n.href ? 'active' : ''}`}
              >
                <n.icon size={16} />
                {n.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
        <Link href="/app/settings" className={`nav-link mb-1 ${pathname === '/app/settings' ? 'active' : ''}`} style={{ marginBottom: 2 }}>
          <IconSettings size={15} />
          Settings
        </Link>
        <button onClick={toggleTheme} className="nav-link w-full mb-1" style={{ marginBottom: 2 }}>
          {theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button onClick={signOut} className="nav-link w-full" style={{ color: 'var(--text2)' }}>
          <IconLogout size={15} />
          Sign out
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
      {/* Desktop sidebar */}
      <div className="hidden md:block">{sidebar}</div>

      {/* Mobile overlay — sidebar left, backdrop right */}
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div style={{ width: 240, flexShrink: 0 }}>{sidebar}</div>
          <div style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setOpen(false)} className="flex-1" />
        </div>
      )}

      {/* Main */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Mobile top bar — z-51 keeps it above the overlay (z-50) so toggle button stays clickable */}
        <div className="flex items-center gap-3 px-4 py-3 md:hidden" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'relative', zIndex: 51 }}>
          <button onClick={() => setOpen(o => !o)} style={{ color: 'var(--primary)' }}>
            {open ? <IconX size={22} /> : <IconMenu2 size={22} />}
          </button>
          {!open && <span style={{ fontWeight: 800, fontSize: 15, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Fennec SI</span>}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </div>
      </main>
      <StockHelper />
    </div>
  )
}
