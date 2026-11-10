'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { loadRewards, levelFor, weekStreak, type RewardRow } from '@/lib/rewards'
import { localDate } from '@/lib/utils'

const supabase = createClient()
const REFRESHED = 'fennec-rewards-refreshed'

// Rewards for the signed-in person. Asks the server to check for new ones once
// a session (it also checks every morning), then reloads.
export function useRewards() {
  const [rows, setRows] = useState<RewardRow[] | null | undefined>(undefined) // undefined = loading, null = not set up yet

  const load = useCallback(async () => setRows(await loadRewards(supabase)), [])

  useEffect(() => {
    load()
    let fresh = false
    try { fresh = sessionStorage.getItem(REFRESHED) === '1' } catch {}
    if (!fresh) {
      api.refreshRewards().then(r => {
        try { sessionStorage.setItem(REFRESHED, '1') } catch {}
        if (r.new) load()
      }).catch(() => {})
    }
  }, [load])

  const points = (rows ?? []).reduce((s, r) => s + r.points, 0)
  const today = localDate(new Date())
  return {
    rows, loading: rows === undefined, ready: rows !== null, reload: load,
    points,
    level: levelFor(points),
    streak: weekStreak((rows ?? []).filter(r => r.kind === 'week_under').map(r => r.ref), today),
    badges: new Set((rows ?? []).filter(r => r.kind === 'badge').map(r => r.ref)),
  }
}
