'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { IconSend, IconTrash, IconFlag } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'
import { timeAgo } from '@/lib/utils'
import { Avatar } from '@/components/shared/Avatar'
import { COMMENT_MAX, type Comment, type People } from '@/lib/community'

const supabase = createClient()

// Replies under a post. Loaded when opened; the database keeps the count.
export function Comments({ postId, userId, people, blocked, onPeople, onCount, onReport, onOpenPerson }: {
  postId: number
  userId?: string
  people: People
  blocked: Set<string>
  onPeople: (ids: string[]) => void
  onCount: (n: number) => void
  onReport: (commentId: number) => void
  onOpenPerson: (id: string) => void
}) {
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    supabase.from('post_comments').select('*').eq('post_id', postId).order('created_at').limit(200).then(({ data, error }) => {
      if (error) { setComments([]); return }
      const cs = (data ?? []) as Comment[]
      setComments(cs)
      onPeople(cs.map(c => c.user_id))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !body.trim()) return
    setSending(true)
    const { data, error } = await supabase.from('post_comments').insert({ post_id: postId, user_id: userId, body: body.trim() }).select().single()
    setSending(false)
    if (error) { toast.error(error.message); return }
    const next = [...(comments ?? []), data as Comment]
    setComments(next); setBody('')
    onCount(next.filter(c => !c.hidden).length)
  }

  async function remove(id: number) {
    if (!confirm('Delete your comment?')) return
    const { error } = await supabase.from('post_comments').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    const next = (comments ?? []).filter(c => c.id !== id)
    setComments(next)
    onCount(next.filter(c => !c.hidden).length)
  }

  const shown = (comments ?? []).filter(c => !blocked.has(c.user_id))

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      {comments === null ? (
        <p style={{ fontSize: 12, color: 'var(--text3)' }}>Loading…</p>
      ) : shown.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>No replies yet.</p>
      ) : shown.map(c => {
        const p = people[c.user_id]
        return (
          <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={() => onOpenPerson(c.user_id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }} aria-label={`About ${c.username}`}>
              <Avatar username={c.username} avatarColor={p?.avatarColor ?? undefined} avatarEmoji={p?.avatarEmoji ?? undefined} avatarUrl={p?.avatarUrl ?? undefined} size={26} />
            </button>
            <div style={{ flex: 1, minWidth: 0, background: 'var(--surface2)', borderRadius: 10, padding: '6px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <button onClick={() => onOpenPerson(c.user_id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: 'var(--text)', fontSize: 12 }}>{c.username}</button>
                <span style={{ color: 'var(--text3)' }}>{timeAgo(c.created_at)}</span>
                {c.hidden && <span style={{ color: 'var(--amber)', fontSize: 11 }}>Hidden while we review it</span>}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {c.user_id === userId ? (
                    <button onClick={() => remove(c.id)} aria-label="Delete comment" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', lineHeight: 0 }}><IconTrash size={13} /></button>
                  ) : (
                    <button onClick={() => onReport(c.id)} aria-label="Report comment" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', lineHeight: 0 }}><IconFlag size={13} /></button>
                  )}
                </span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.body}</p>
            </div>
          </div>
        )
      })}
      {userId && (
        <form onSubmit={send} style={{ display: 'flex', gap: 6 }}>
          <input value={body} onChange={e => setBody(e.target.value.slice(0, COMMENT_MAX))} placeholder="Write a reply"
            style={{ flex: 1, minWidth: 0, padding: '7px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }} />
          <button type="submit" disabled={!body.trim() || sending} aria-label="Send reply"
            style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', opacity: !body.trim() || sending ? 0.5 : 1, lineHeight: 0 }}>
            <IconSend size={14} />
          </button>
        </form>
      )}
    </div>
  )
}
