'use client'
import { useState } from 'react'
import { IconHeart, IconTrash, IconMessageCircle, IconFlag, IconRosetteDiscountCheck } from '@tabler/icons-react'
import { timeAgo } from '@/lib/utils'
import { askFennec } from '@/lib/askFennec'
import { Avatar } from '@/components/shared/Avatar'
import { Comments } from '@/components/community/Comments'
import { typeLabel, viewLabel, type Post, type People } from '@/lib/community'

export type { Post }

interface Props {
  post: Post
  currentUserId?: string
  people: People
  blocked: Set<string>
  onLike: (id: number, liked: boolean) => void
  onDelete: (id: number) => void
  onReport: (target: { postId?: number; commentId?: number }) => void
  onOpenPerson: (id: string) => void
  onPeople: (ids: string[]) => void
  onCommentCount: (id: number, n: number) => void
}

const TYPE_COLORS: Record<string, string> = {
  pick: 'var(--accent)',
  milestone: 'var(--green)',
  news: 'var(--amber)',
  discussion: 'var(--text2)',
}

export function PostCard({ post, currentUserId, people, blocked, onLike, onDelete, onReport, onOpenPerson, onPeople, onCommentCount }: Props) {
  const [open, setOpen] = useState(false)
  const person = people[post.user_id]
  const mine = post.user_id === currentUserId
  const view = viewLabel(post.signal)
  const color = TYPE_COLORS[post.type] || 'var(--text2)'
  const iconBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text2)', fontSize: 13 }

  return (
    <div className="card mb-3">
      <div className="flex items-start gap-3">
        <button onClick={() => onOpenPerson(post.user_id)} aria-label={`About ${post.username}`} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}>
          <Avatar username={post.username} avatarColor={person?.avatarColor ?? undefined} avatarEmoji={person?.avatarEmoji ?? undefined} avatarUrl={person?.avatarUrl ?? undefined} size={36} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <button onClick={() => onOpenPerson(post.user_id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              {post.username}
              {person?.verified && <IconRosetteDiscountCheck size={14} style={{ color: 'var(--primary)' }} aria-label="Verified investor" />}
            </button>
            <span style={{
              fontSize: 10, fontFamily: 'Syne, sans-serif', fontWeight: 600, padding: '1px 6px', borderRadius: 10,
              background: `color-mix(in srgb, ${color} 14%, transparent)`, color, textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {typeLabel(post.type)}
            </span>
            {post.ticker && (
              <button onClick={() => askFennec(`Tell me about ${post.ticker}: what the company does, recent news and the main things to weigh up. General information, not advice.`)}
                title={`Ask Fennec about ${post.ticker}`}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--primary)', fontFamily: 'DM Mono, monospace', textDecoration: 'underline dotted' }}>
                {post.ticker}
              </button>
            )}
            {view && <span style={{ fontSize: 11, color: 'var(--text2)' }}>Their view: {view}</span>}
            <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>{timeAgo(post.created_at)}</span>
          </div>
          {post.hidden && mine && (
            <p style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 6 }}>Hidden from others while we review a report. Only you can see it.</p>
          )}
          <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 10, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{post.body}</p>
          <div className="flex items-center gap-4">
            <button onClick={() => onLike(post.id, !post.liked)} aria-pressed={!!post.liked} aria-label={post.liked ? 'Unlike' : 'Like'}
              style={{ ...iconBtn, color: post.liked ? 'var(--red)' : 'var(--text2)' }}>
              <IconHeart size={15} fill={post.liked ? 'currentColor' : 'none'} />
              <span>{post.likes}</span>
            </button>
            <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={iconBtn}>
              <IconMessageCircle size={15} />
              <span>{post.comment_count ? post.comment_count : 'Reply'}</span>
            </button>
            <span style={{ marginLeft: 'auto' }} />
            {mine ? (
              <button onClick={() => { if (confirm('Delete your post?')) onDelete(post.id) }} aria-label="Delete post" style={iconBtn}><IconTrash size={15} /></button>
            ) : (
              <button onClick={() => onReport({ postId: post.id })} aria-label="Report post" title="Report" style={iconBtn}><IconFlag size={15} /></button>
            )}
          </div>
          {open && (
            <Comments postId={post.id} userId={currentUserId} people={people} blocked={blocked} onPeople={onPeople}
              onCount={n => onCommentCount(post.id, n)} onReport={commentId => onReport({ commentId })} onOpenPerson={onOpenPerson} />
          )}
        </div>
      </div>
    </div>
  )
}
