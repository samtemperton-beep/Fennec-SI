'use client'
export const dynamic = 'force-dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { IconTrophy, IconFlame, IconInfoCircle } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { askFennec } from '@/lib/askFennec'
import { PostCard } from '@/components/community/PostCard'
import { PostComposer } from '@/components/community/PostComposer'
import { ReportDialog } from '@/components/community/ReportDialog'
import { PersonCard } from '@/components/community/PersonCard'
import { Avatar } from '@/components/shared/Avatar'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { POST_TYPES, PAGE_SIZE, NOT_ADVICE, type Post, type People } from '@/lib/community'

const supabase = createClient()

interface LeaderEntry { rank: number; userId: string; username: string; avatarColor?: string; avatarEmoji?: string; avatarUrl?: string; gainPct: number }

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [leaders, setLeaders] = useState<LeaderEntry[] | null>(null)
  const [likedIds, setLikedIds] = useState(new Set<number>())
  const [blocked, setBlocked] = useState(new Set<string>())
  const [people, setPeople] = useState<People>({})
  const [reporting, setReporting] = useState<{ postId?: number; commentId?: number } | null>(null)
  const [personId, setPersonId] = useState<string | null>(null)
  const asked = useRef(new Set<string>())
  const userRef = useRef<string | null>(null)

  // Public details (avatar, verified, badges) for anyone not loaded yet.
  const loadPeople = useCallback((ids: string[]) => {
    const missing = [...new Set(ids)].filter(id => id && !asked.current.has(id))
    if (!missing.length) return
    missing.forEach(id => asked.current.add(id))
    api.communityPeople(missing)
      .then(r => setPeople(p => ({ ...p, ...Object.fromEntries(r.people.map(x => [x.id, x])) })))
      .catch(() => missing.forEach(id => asked.current.delete(id)))
  }, [])

  const fetchPosts = useCallback(async (type: string, offset: number) => {
    let q = supabase.from('posts').select('*').order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1)
    if (type !== 'all') q = q.eq('type', type)
    const { data, error } = await q
    if (error) { toast.error(error.message); return [] }
    return (data ?? []) as Post[]
  }, [])

  // Signed-in person, their likes and blocks, and the leaderboard.
  useEffect(() => {
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) return
      setUser({ id: u.id }); userRef.current = u.id
      const [{ data: p }, { data: likes }, { data: blocks }] = await Promise.all([
        supabase.from('profiles').select('username, avatar_color, avatar_emoji, avatar_url').eq('id', u.id).single(),
        supabase.from('post_likes').select('post_id').eq('user_id', u.id),
        supabase.from('user_blocks').select('blocked_id'),
      ])
      setProfile(p)
      setLikedIds(new Set((likes ?? []).map(l => l.post_id)))
      setBlocked(new Set((blocks ?? []).map((b: any) => b.blocked_id)))
    })()
    api.getLeaderboard().then(r => setLeaders((r.leaderboard ?? []).slice(0, 5))).catch(() => setLeaders([]))
  }, [])

  // The feed, again whenever the filter changes.
  useEffect(() => {
    let live = true
    setLoading(true)
    fetchPosts(filter, 0).then(ps => {
      if (!live) return
      setPosts(ps); setMore(ps.length === PAGE_SIZE); setLoading(false)
      loadPeople(ps.map(p => p.user_id))
    })
    return () => { live = false }
  }, [filter, fetchPosts, loadPeople])

  // New posts, like and reply counts, and removals, as they happen.
  useEffect(() => {
    const ch = supabase.channel('community-posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, ({ new: post }) => {
        const p = post as Post
        if (filter !== 'all' && p.type !== filter) return
        setPosts(prev => prev.some(x => x.id === p.id) ? prev : [p, ...prev])
        loadPeople([p.user_id])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, ({ new: post }) => {
        const p = post as Post
        setPosts(prev => p.hidden && p.user_id !== userRef.current
          ? prev.filter(x => x.id !== p.id)
          : prev.map(x => x.id === p.id ? { ...x, likes: p.likes, comment_count: p.comment_count, hidden: p.hidden } : x))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, ({ old }) => {
        setPosts(prev => prev.filter(x => x.id !== (old as any).id))
      })
      .subscribe()
    return () => { ch.unsubscribe() }
  }, [filter, loadPeople])

  async function loadMore() {
    setLoadingMore(true)
    const ps = await fetchPosts(filter, posts.length)
    setPosts(prev => [...prev, ...ps.filter(p => !prev.some(x => x.id === p.id))])
    setMore(ps.length === PAGE_SIZE)
    setLoadingMore(false)
    loadPeople(ps.map(p => p.user_id))
  }

  async function onPost(draft: { type: string; ticker?: string; signal?: string; body: string }) {
    if (!user) return false
    const { data, error } = await supabase.from('posts').insert({ user_id: user.id, username: profile?.username ?? '', ...draft }).select().single()
    if (error) { toast.error(error.message); return false }
    const p = data as Post
    if (filter === 'all' || filter === p.type) setPosts(prev => prev.some(x => x.id === p.id) ? prev : [p, ...prev])
    return true
  }

  // The database counts likes (community_migration.sql); this just shows it straight away.
  async function onLike(postId: number, liked: boolean) {
    if (!user) return
    const bump = (d: number) => setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: Math.max(0, p.likes + d) } : p))
    setLikedIds(s => { const n = new Set(s); liked ? n.add(postId) : n.delete(postId); return n })
    bump(liked ? 1 : -1)
    const { error } = liked
      ? await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id })
      : await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id)
    if (error && error.code !== '23505') {
      setLikedIds(s => { const n = new Set(s); liked ? n.delete(postId) : n.add(postId); return n })
      bump(liked ? -1 : 1)
      toast.error('Couldn’t save that like')
    }
  }

  async function onDelete(postId: number) {
    const { error } = await supabase.from('posts').delete().eq('id', postId)
    if (error) { toast.error(error.message); return }
    setPosts(prev => prev.filter(p => p.id !== postId))
  }

  async function onBlock(id: string, block: boolean) {
    if (!user) return
    const { error } = block
      ? await supabase.from('user_blocks').insert({ blocker_id: user.id, blocked_id: id })
      : await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', id)
    if (error && error.code !== '23505') { toast.error(error.message); return }
    setBlocked(s => { const n = new Set(s); block ? n.add(id) : n.delete(id); return n })
    toast.success(block ? 'Blocked. You won’t see their posts or replies.' : 'Unblocked')
    if (block) setPersonId(null)
  }

  function onReportClosed(hidden?: boolean) {
    if (hidden && reporting?.postId) setPosts(prev => prev.filter(p => p.id !== reporting.postId))
    setReporting(null)
  }

  const shown = posts.filter(p => !blocked.has(p.user_id)).map(p => ({ ...p, liked: likedIds.has(p.id) }))

  const trending = useMemo(() => {
    const counts: Record<string, number> = {}
    posts.filter(p => p.ticker && !blocked.has(p.user_id)).forEach(p => { counts[p.ticker!] = (counts[p.ticker!] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ticker, count]) => ({ ticker, count }))
  }, [posts, blocked])

  const chip = (on: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 20, fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer',
    background: on ? 'var(--primary)' : 'var(--surface2)', color: on ? 'white' : 'var(--text2)', border: on ? 'none' : '1px solid var(--border)',
  })

  return (
    <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 20 }} className="m-stack m-pad">
      <div>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Community</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>Share ideas, milestones and market takes with other Fennec members</p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text2)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', marginBottom: 16 }}>
          <IconInfoCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{NOT_ADVICE} Use the flag to report anything that looks wrong.</span>
        </div>

        {user && (profile?.username ? (
          <PostComposer username={profile.username} avatarColor={profile.avatar_color} avatarEmoji={profile.avatar_emoji} avatarUrl={profile.avatar_url} onPost={onPost} />
        ) : profile && (
          <div className="card mb-4" style={{ fontSize: 13, color: 'var(--text2)' }}>
            Choose a username in <Link href="/app/settings" style={{ color: 'var(--primary)' }}>Settings</Link> to post and reply. It’s what other members see.
          </div>
        ))}

        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => setFilter('all')} style={chip(filter === 'all')}>All</button>
          {POST_TYPES.map(t => <button key={t.id} onClick={() => setFilter(t.id)} style={chip(filter === t.id)}>{t.filter}</button>)}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><LoadingSpinner size={32} /></div>
        ) : shown.length === 0 ? (
          <div className="card text-center py-12">
            <p style={{ color: 'var(--text2)' }}>{filter === 'all' ? 'No posts yet. Be the first!' : 'Nothing here yet.'}</p>
          </div>
        ) : (
          <>
            {shown.map(p => (
              <PostCard key={p.id} post={p} currentUserId={user?.id} people={people} blocked={blocked}
                onLike={onLike} onDelete={onDelete} onReport={setReporting} onOpenPerson={setPersonId} onPeople={loadPeople}
                onCommentCount={(id, n) => setPosts(prev => prev.map(x => x.id === id ? { ...x, comment_count: n } : x))} />
            ))}
            {more && (
              <div className="flex justify-center" style={{ marginTop: 8 }}>
                <button onClick={loadMore} disabled={loadingMore} style={chip(false)}>{loadingMore ? 'Loading…' : 'Show older posts'}</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sidebar: beside the feed on wide screens, under it on phones */}
      <div className="space-y-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <IconTrophy size={16} style={{ color: 'var(--amber)' }} />
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, flex: 1 }}>Leaderboard</span>
            <Link href="/app/leaderboard" style={{ fontSize: 12, color: 'var(--primary)' }}>See all</Link>
          </div>
          {leaders === null ? (
            <p style={{ fontSize: 12, color: 'var(--text3)' }}>Loading…</p>
          ) : leaders.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>No verified portfolios yet. Verify yours on the Portfolio page to join.</p>
          ) : leaders.map(l => (
            <button key={l.userId} onClick={() => { loadPeople([l.userId]); setPersonId(l.userId) }}
              className="flex items-center gap-3 mb-3" style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text2)', width: 18, textAlign: 'right' }}>#{l.rank}</span>
              <Avatar username={l.username} avatarColor={l.avatarColor} avatarEmoji={l.avatarEmoji} avatarUrl={l.avatarUrl} size={26} />
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.username}</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: l.gainPct >= 0 ? 'var(--green)' : 'var(--red)' }}>{l.gainPct >= 0 ? '+' : ''}{l.gainPct.toFixed(1)}%</span>
            </button>
          ))}
        </div>

        {trending.length > 0 && (
          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <IconFlame size={16} style={{ color: 'var(--red)' }} />
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>Talked about</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>Shares mentioned most in recent posts. Tap one to ask Fennec about it.</p>
            {trending.map(t => (
              <button key={t.ticker} onClick={() => askFennec(`Tell me about ${t.ticker}: what the company does, recent news and the main things to weigh up. General information, not advice.`)}
                className="flex items-center gap-2 mb-2" style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)' }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 12, width: 56, textAlign: 'left' }}>{t.ticker}</span>
                <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--primary)', borderRadius: 3, width: `${(t.count / trending[0].count) * 100}%` }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text2)', width: 20, textAlign: 'right' }}>{t.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ReportDialog target={reporting} onClose={onReportClosed} />
      <PersonCard personId={personId} people={people} currentUserId={user?.id} blocked={blocked} onBlock={onBlock} onClose={() => setPersonId(null)} />
    </div>
  )
}
