'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { readSecurityPrefs, AWAY_MINUTES } from '@/lib/security'
import { setAmountsHidden, setSecurityPrefs, useSecurityPrefs } from './PrivacyMode'

// Applies the account's security settings (lib/security.ts) inside the app:
// loads them from the profile, hides amounts again after time away, and signs
// out after the chosen time without activity.

const LAST_ACTIVE_KEY = 'fennec-last-active' // shared by every open tab
const WARN_MS = 60_000

const readLastActive = () => { try { return Number(localStorage.getItem(LAST_ACTIVE_KEY)) || 0 } catch { return 0 } }
const writeLastActive = (t: number) => { try { localStorage.setItem(LAST_ACTIVE_KEY, String(t)) } catch { /* private window */ } }

export function SecurityGuard({ userId }: { userId: string | null }) {
  const prefs = useSecurityPrefs()
  // The sign-out timer waits for the account's own setting, so a longer time
  // (or never) isn't overruled by the default while the profile loads.
  const [loaded, setLoaded] = useState(false)

  // The account's settings. A separate query, so the app still opens if the
  // column isn't there yet.
  useEffect(() => {
    if (!userId) return
    createClient().from('profiles').select('security_prefs').eq('id', userId).maybeSingle()
      .then(({ data, error }) => {
        if (!error) setSecurityPrefs(readSecurityPrefs(data?.security_prefs))
        setLoaded(true)
      }, () => setLoaded(true))
  }, [userId])

  // Hide amounts again after time away from the app.
  useEffect(() => {
    if (!prefs.rehideAfterAway) return
    let leftAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leftAt = Date.now()
      else if (leftAt && Date.now() - leftAt >= AWAY_MINUTES * 60_000) setAmountsHidden(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [prefs.rehideAfterAway])

  // Sign out after the chosen time without activity, in any open tab.
  const warned = useRef(false)
  useEffect(() => {
    const limit = prefs.idleMinutes * 60_000
    if (!userId || !limit || !loaded) return
    const supabase = createClient()
    let signInAt = 0
    let stopped = false

    const signOut = async () => {
      if (stopped) return
      stopped = true
      await supabase.auth.signOut()
      window.location.href = `/login?signedout=idle&after=${prefs.idleMinutes}`
    }
    const check = () => {
      // Counting from the later of the last activity and signing in, so an old
      // timestamp from a previous visit doesn't sign out a fresh sign-in.
      const idle = Date.now() - Math.max(readLastActive(), signInAt)
      if (idle >= limit) { signOut(); return }
      if (idle >= limit - WARN_MS && !warned.current) {
        warned.current = true
        toast('You’ll be signed out in a minute for security. Move the mouse or tap to stay signed in.', { duration: WARN_MS })
      }
    }
    let lastWrite = 0
    const active = () => {
      const now = Date.now()
      warned.current = false
      if (now - lastWrite > 10_000) { lastWrite = now; writeLastActive(now) }
    }

    // Check before recording this visit, so coming back to a tab left open
    // overnight signs out rather than counting as activity.
    supabase.auth.getSession().then(({ data }) => {
      signInAt = data.session?.user.last_sign_in_at ? Date.parse(data.session.user.last_sign_in_at) : Date.now()
      check()
      if (!stopped) active()
    })

    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const
    events.forEach(e => window.addEventListener(e, active, { passive: true }))
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(check, 15_000)
    return () => {
      stopped = true
      events.forEach(e => window.removeEventListener(e, active))
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [userId, prefs.idleMinutes, loaded])

  return null
}
