import type { CommunityPerson } from '@/lib/api'

// Shared by the Community page and its cards (community_migration.sql).

export interface Post {
  id: number
  user_id: string
  username: string
  type: string
  ticker?: string | null
  signal?: string | null
  body: string
  likes: number
  comment_count?: number
  hidden?: boolean
  created_at: string
  liked?: boolean
}

export interface Comment {
  id: number
  post_id: number
  user_id: string
  username: string
  body: string
  hidden?: boolean
  created_at: string
}

export type People = Record<string, CommunityPerson>

export const POST_TYPES: { id: string; label: string; filter: string }[] = [
  { id: 'discussion', label: 'Discussion', filter: 'Discussion' },
  { id: 'pick', label: 'Share idea', filter: 'Share ideas' },
  { id: 'milestone', label: 'Milestone', filter: 'Milestones' },
  { id: 'news', label: 'News take', filter: 'News takes' },
]
export const typeLabel = (t: string) => POST_TYPES.find(p => p.id === t)?.label ?? t

/** The author's own view on a share. Never shown as BUY or SELL. */
export const VIEWS = [
  { id: 'bullish', label: 'Positive' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'bearish', label: 'Negative' },
]
export const viewLabel = (s?: string | null) => VIEWS.find(v => v.id === s?.toLowerCase())?.label ?? null

export const REPORT_REASONS = [
  { id: 'spam', label: 'Spam or advertising' },
  { id: 'scam', label: 'Scam, or talking up a share to sell it' },
  { id: 'abuse', label: 'Abusive or harassing' },
  { id: 'personal', label: "Shares someone's personal information" },
  { id: 'other', label: 'Something else' },
]

export const POST_MAX = 1000
export const COMMENT_MAX = 500
export const PAGE_SIZE = 30

export const NOT_ADVICE = 'Posts are members’ own opinions, not financial advice. Check things for yourself before you invest.'
