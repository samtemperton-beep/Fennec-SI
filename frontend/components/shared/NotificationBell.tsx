'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconBell } from '@tabler/icons-react'
import { api } from '@/lib/api'

/** Fired by the Notifications page after marking things read, so the count updates at once. */
export const NOTIFICATIONS_CHANGED = 'fennec:notifications-changed'

// The bell in the top bar, with how many notifications are unread. Checks on
// each page change, when the tab comes back into view, and every two minutes.
export function NotificationBell({ pathname }: { pathname: string }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let live = true
    const load = () => api.getUnreadCount().then(r => { if (live) setCount(r.count ?? 0) }).catch(() => {})
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    const timer = setInterval(load, 120_000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(NOTIFICATIONS_CHANGED, load)
    return () => {
      live = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(NOTIFICATIONS_CHANGED, load)
    }
  }, [pathname])

  const label = count ? `Notifications, ${count} unread` : 'Notifications'
  return (
    <Link href="/app/alerts" className={`topnav-settings ${pathname === '/app/alerts' ? 'active' : ''}`} title={label} aria-label={label} style={{ position: 'relative' }}>
      <IconBell size={20} />
      {count > 0 && (
        <span aria-hidden style={{
          position: 'absolute', top: 3, right: 2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
          background: 'var(--red)', color: 'white', fontSize: 10, fontWeight: 700, lineHeight: '16px', textAlign: 'center',
        }}>{count > 99 ? '99+' : count}</span>
      )}
    </Link>
  )
}
