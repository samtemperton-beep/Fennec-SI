'use client'
import { useEffect, useState } from 'react'
import { IconRosetteDiscountCheck, IconBan } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'
import { timeAgo } from '@/lib/utils'
import { Modal } from '@/components/shared/Modal'
import { Avatar } from '@/components/shared/Avatar'
import { typeLabel, type People, type Post } from '@/lib/community'

const supabase = createClient()

// What other members can see about someone: name, avatar, verified, badges and
// their posts. Never amounts. Blocking hides their posts and replies from you.
export function PersonCard({ personId, people, currentUserId, blocked, onBlock, onClose }: {
  personId: string | null
  people: People
  currentUserId?: string
  blocked: Set<string>
  onBlock: (id: string, block: boolean) => void
  onClose: () => void
}) {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const p = personId ? people[personId] : undefined

  useEffect(() => {
    if (!personId) return
    setPosts(null)
    supabase.from('posts').select('id, user_id, username, type, ticker, body, likes, comment_count, created_at')
      .eq('user_id', personId).order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => setPosts((data ?? []) as Post[]))
  }, [personId])

  const isBlocked = !!personId && blocked.has(personId)
  const name = p?.username ?? posts?.[0]?.username ?? 'Member'
  const joined = p?.joined ? new Date(`${p.joined}-01`).toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' }) : null

  return (
    <Modal open={!!personId} onClose={onClose} title={name}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Avatar username={name} avatarColor={p?.avatarColor ?? undefined} avatarEmoji={p?.avatarEmoji ?? undefined} avatarUrl={p?.avatarUrl ?? undefined} size={52} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 4 }}>
            {name}{p?.verified && <IconRosetteDiscountCheck size={17} style={{ color: 'var(--primary)' }} />}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {p?.verified ? 'Verified investor' : 'Member'}{joined ? ` · joined ${joined}` : ''}
          </div>
        </div>
      </div>

      {!!p?.badges.length && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {p.badges.map(b => (
            <span key={b.id} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)' }}>{b.icon} {b.name}</span>
          ))}
        </div>
      )}

      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>Recent posts</p>
      {posts === null ? (
        <p style={{ fontSize: 12, color: 'var(--text3)' }}>Loading…</p>
      ) : posts.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text3)' }}>No posts yet.</p>
      ) : posts.map(post => (
        <div key={post.id} style={{ borderTop: '1px solid var(--border)', padding: '8px 0', fontSize: 13 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{typeLabel(post.type)}{post.ticker ? ` · ${post.ticker}` : ''} · {timeAgo(post.created_at)}</div>
          <div style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>{post.body}</div>
        </div>
      ))}

      {personId && personId !== currentUserId && (
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => onBlock(personId, !isBlocked)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: isBlocked ? 'var(--text2)' : 'var(--red)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <IconBan size={13} /> {isBlocked ? `Unblock ${name}` : `Block ${name}`}
          </button>
        </div>
      )}
    </Modal>
  )
}
