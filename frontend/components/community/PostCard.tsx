'use client'
import { SignalBadge } from '@/components/shared/SignalBadge'
import { timeAgo } from '@/lib/utils'
import { IconHeart, IconTrash } from '@tabler/icons-react'

export interface Post {
  id: number
  user_id: string
  username: string
  type: string
  ticker?: string
  signal?: string
  body: string
  likes: number
  created_at: string
  liked?: boolean
}

interface Props {
  post: Post
  currentUserId?: string
  onLike: (id: number, liked: boolean) => void
  onDelete: (id: number) => void
}

const TYPE_COLORS: Record<string, string> = {
  pick: 'var(--accent)',
  milestone: 'var(--green)',
  news: 'var(--amber)',
  discussion: 'var(--text2)',
}

export function PostCard({ post, currentUserId, onLike, onDelete }: Props) {
  const initial = (post.username || 'U')[0].toUpperCase()

  return (
    <div className="card mb-3">
      <div className="flex items-start gap-3">
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: 'white', fontWeight: 700, fontFamily: 'Syne, sans-serif', flexShrink: 0,
        }}>
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>{post.username}</span>
            <span style={{
              fontSize: 10, fontFamily: 'Syne, sans-serif', fontWeight: 600,
              padding: '1px 6px', borderRadius: 10,
              background: `${TYPE_COLORS[post.type] || 'var(--text2)'}20`,
              color: TYPE_COLORS[post.type] || 'var(--text2)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {post.type}
            </span>
            {post.ticker && <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>{post.ticker}</span>}
            {post.signal && <SignalBadge signal={post.signal} />}
            <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>{timeAgo(post.created_at)}</span>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{post.body}</p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => onLike(post.id, !post.liked)}
              className="flex items-center gap-1.5 transition-colors"
              style={{ color: post.liked ? 'var(--red)' : 'var(--text2)', fontSize: 13 }}
            >
              <IconHeart size={15} fill={post.liked ? 'currentColor' : 'none'} />
              <span>{post.likes}</span>
            </button>
            {post.user_id === currentUserId && (
              <button
                onClick={() => onDelete(post.id)}
                style={{ color: 'var(--text2)', fontSize: 13 }}
                className="flex items-center gap-1.5"
              >
                <IconTrash size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
