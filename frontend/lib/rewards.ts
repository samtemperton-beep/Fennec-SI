import type { SupabaseClient } from '@supabase/supabase-js'

// Budget rewards and pledges (rewards_migration.sql). The server works out
// what's earned (backend/src/services/rewards.ts); keep BADGES in step with it.

export interface Badge { id: string; name: string; icon: string; points: number; how: string }

export const BADGES: Badge[] = [
  { id: 'budget_set',   name: 'Plan Made',       icon: '📝', points: 20,  how: 'Set budgets for 3 or more categories' },
  { id: 'week_1',       name: 'First Week Win',  icon: '🌱', points: 25,  how: 'Finish a week (Monday to Sunday) under budget' },
  { id: 'streak_4',     name: 'Month of Wins',   icon: '🔥', points: 75,  how: '4 weeks in a row under budget, any time' },
  { id: 'streak_8',     name: 'On a Roll',       icon: '⚡', points: 150, how: '8 weeks in a row under budget' },
  { id: 'streak_12',    name: 'Unstoppable',     icon: '🏆', points: 250, how: '12 weeks in a row under budget' },
  { id: 'month_1',      name: 'Month Mastered',  icon: '📅', points: 50,  how: 'A whole month under budget' },
  { id: 'month_3',      name: 'Quarter Champ',   icon: '🥇', points: 150, how: '3 months under budget' },
  { id: 'pledge_made',  name: 'Line Drawn',      icon: '✋', points: 15,  how: 'Make a no-spend pledge' },
  { id: 'pledge_30',    name: '30 Days Strong',  icon: '💪', points: 100, how: 'Keep a pledge for 30 days' },
  { id: 'pledge_90',    name: 'Habit Broken',    icon: '🧠', points: 250, how: 'Keep a pledge for 90 days' },
  { id: 'buddy_added',  name: 'Got a Buddy',     icon: '🤝', points: 25,  how: 'Team up with an accountability buddy' },
  { id: 'goal_reached', name: 'Goal Getter',     icon: '🎯', points: 150, how: 'Reach a savings goal' },
  { id: 'sorted_100',   name: 'Tidy Books',      icon: '🧹', points: 30,  how: 'Have 100 transactions in categories' },
  { id: 'saved_1000',   name: 'First $1k Saved', icon: '💰', points: 100, how: 'Save $1,000 across your goals' },
]
export const badgeById = (id: string) => BADGES.find(b => b.id === id)

export const LEVELS = [
  { at: 0, name: 'Kit' },
  { at: 100, name: 'Cub' },
  { at: 300, name: 'Scout' },
  { at: 700, name: 'Tracker' },
  { at: 1500, name: 'Fox' },
  { at: 3000, name: 'Silver Fox' },
  { at: 6000, name: 'Golden Fox' },
]
export function levelFor(points: number) {
  let i = 0
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].at) i++
  const next = LEVELS[i + 1] ?? null
  return {
    number: i + 1, name: LEVELS[i].name, next,
    progress: next ? (points - LEVELS[i].at) / (next.at - LEVELS[i].at) : 1,
    toNext: next ? next.at - points : 0,
  }
}

export const REWARD_LABEL: Record<string, string> = {
  week_under: 'Week under budget',
  month_under: 'Month under budget',
  pledge_week: 'Pledge kept all week',
  badge: 'Badge',
}

// ── Dates ──────────────────────────────────────────────────────────────────

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const mondayOf = (iso: string) => { const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); return addDays(iso, -((dow + 6) % 7)) }
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

/** Weeks in a row under budget, ending last week. */
export function weekStreak(weekStarts: string[], today: string) {
  const set = new Set(weekStarts)
  let ws = addDays(mondayOf(today), -7)
  let n = 0
  while (set.has(ws)) { n++; ws = addDays(ws, -7) }
  return n
}

export interface RewardRow { kind: string; ref: string; points: number; earned_at: string }

export async function loadRewards(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('money_rewards').select('kind, ref, points, earned_at').order('earned_at', { ascending: false })
  if (error) return null // before rewards_migration.sql
  return (data ?? []) as RewardRow[]
}

// ── Pledges ────────────────────────────────────────────────────────────────

export const PLEDGE_PRESETS: { name: string; icon: string; keywords: string[] }[] = [
  { name: 'Lotto', icon: '🎟️', keywords: ['lotto', 'mylotto'] },
  { name: 'Betting and casinos', icon: '🎰', keywords: ['tab nz', 'tab.co.nz', 'skycity', 'sky city casino', 'christchurch casino', 'betway', 'sportsbet', 'jackpot city', 'spin casino', 'pokies'] },
  { name: 'Uber Eats', icon: '🛵', keywords: ['uber eats', 'ubereats'] },
  { name: 'Food delivery apps', icon: '🥡', keywords: ['uber eats', 'ubereats', 'doordash', 'menulog', 'delivereasy'] },
  { name: 'Fast food', icon: '🍟', keywords: ['mcdonalds', 'kfc', 'burger king', 'carls jr', 'wendys', 'subway', 'dominos', 'pizza hut'] },
  { name: 'Buy now, pay later', icon: '💳', keywords: ['afterpay', 'laybuy', 'zip pay', 'zipmoney', 'humm'] },
  { name: 'Vapes', icon: '💨', keywords: ['vape', 'shosha'] },
]

// "UBER *EATS" and "uber eats" both become "ubereats"; same as the server.
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
export function matchesPledge(description: string | null | undefined, keywords: string[]) {
  const d = compact(description ?? '')
  return !!d && keywords.some(k => { const c = compact(k); return c.length >= 3 && d.includes(c) })
}
export const cleanKeyword = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40)

export interface Pledge { id: string; name: string; keywords: string[]; active: boolean; created_at: string; ended_at: string | null }
export interface Slip { id: number; pledge_id: string; description: string | null; amount: number; date: string }
