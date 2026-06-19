'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import {
  IconChartBar, IconBrain, IconTrendingUp, IconStar, IconEye,
  IconNewSection, IconMail, IconCalendar, IconUsers, IconBell,
  IconSettings, IconMenu2, IconX, IconLogout,
} from '@tabler/icons-react'
import { StockHelper } from '@/components/shared/StockHelper'

const NAV = [
  { href: '/app/portfolio', label: 'Portfolio', icon: IconChartBar },
  { href: '/app/top10', label: 'Top 10 Picks', icon: IconStar },
  { href: '/app/opportunities', label: 'Opportunities', icon: IconBrain },
  { href: '/app/watchlist', label: 'Watchlist', icon: IconEye },
  { href: '/app/news', label: 'News', icon: IconNewSection },
  { href: '/app/newsletters', label: 'Newsletters', icon: IconMail },
  { href: '/app/ipo', label: 'IPO Calendar', icon: IconCalendar },
  { href: '/app/community', label: 'Community', icon: IconUsers },
  { href: '/app/alerts', label: 'Alerts', icon: IconBell },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user)
      if (data.user) {
        const { data: p } = await supabase.from('profiles').select('username, avatar_color, location, profession').eq('id', data.user.id).single()
        setProfile(p)
      }
    })
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const sidebar = (
    <aside
      style={{
        width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0, flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
        <div style={{ background: 'var(--accent)', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IconChartBar size={16} color="white" />
        </div>
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15 }}>Fennec SI</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {NAV.map(n => (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={`nav-link mb-1 ${pathname === n.href ? 'active' : ''}`}
          >
            <n.icon size={17} />
            {n.label}
          </Link>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <Link href="/settings" className={`nav-link mb-1 ${pathname === '/settings' ? 'active' : ''}`}>
          <IconSettings size={17} />
          Settings
        </Link>
        <button onClick={signOut} className="nav-link w-full" style={{ cursor: 'pointer' }}>
          <IconLogout size={17} />
          Sign out
        </button>
        {user && (
          <div className="flex items-center gap-2 mt-3 px-2">
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: profile?.avatar_color || 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white', fontWeight: 700, fontFamily: 'Syne, sans-serif', flexShrink: 0 }}>
              {(profile?.username || user.email || 'U')[0].toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, fontFamily: 'Syne, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.username || user.email}
              </div>
              {profile?.profession && (
                <div style={{ fontSize: 10, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.profession}
                </div>
              )}
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

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div style={{ background: 'rgba(9,12,17,0.7)' }} onClick={() => setOpen(false)} className="flex-1" />
          <div style={{ width: 220 }}>{sidebar}</div>
        </div>
      )}

      {/* Main */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 px-4 py-3 md:hidden" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <button onClick={() => setOpen(o => !o)}>
            {open ? <IconX size={22} /> : <IconMenu2 size={22} />}
          </button>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>Fennec SI</span>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </div>
      </main>
      <StockHelper />
    </div>
  )
}
