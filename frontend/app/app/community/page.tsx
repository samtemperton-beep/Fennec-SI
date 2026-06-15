'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { PostCard, type Post } from '@/components/community/PostCard'
import { PostComposer } from '@/components/community/PostComposer'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconTrophy, IconFlame } from '@tabler/icons-react'

const FILTERS = ['All', 'Picks', 'Milestones', 'News Takes']
const FILTER_MAP: Record<string, string> = { 'Picks': 'pick', 'Milestones': 'milestone', 'News Takes': 'news' }

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [trending, setTrending] = useState<{ ticker: string; count: number }[]>([])
  const [likedIds, setLikedIds] = useState(new Set<number>())
  const supabase = createClient()
  const channelRef = useRef<any>(null)

  useEffect(() => {
    init()
    return () => { channelRef.current?.unsubscribe() }
  }, [])

  async function init() {
    const { data: { user: u } } = await supabase.auth.getUser()
    setUser(u)
    if (u) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', u.id).single()
      setProfile(p)
      // Fetch liked post IDs
      const { data: likes } = await supabase.from('post_likes').select('post_id').eq('user_id', u.id)
      if (likes) setLikedIds(new Set(likes.map(l => l.post_id)))
    }

    await fetchPosts()
    await fetchLeaderboard()

    // Real-time subscription
    const ch = supabase.channel('community-posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async ({ new: post }) => {
        const enriched = { ...post as Post, liked: false }
        setPosts(prev => [enriched, ...prev])
        updateTrending([enriched, ...posts])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, ({ new: post }) => {
        setPosts(prev => prev.map(p => p.id === (post as Post).id ? { ...p, likes: (post as Post).likes } : p))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, ({ old }) => {
        setPosts(prev => prev.filter(p => p.id !== (old as any).id))
      })
      .subscribe()
    channelRef.current = ch
  }

  async function fetchPosts() {
    setLoading(true)
    const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(50)
    const ps = (data || []) as Post[]
    setPosts(ps)
    updateTrending(ps)
    setLoading(false)
  }

  async function fetchLeaderboard() {
    const { data } = await supabase.from('profiles').select('username, picks_score, total_gain_pct').order('picks_score', { ascending: false }).limit(10)
    setLeaderboard(data || [])
  }

  function updateTrending(ps: Post[]) {
    const counts: Record<string, number> = {}
    ps.filter(p => p.ticker).forEach(p => { counts[p.ticker!] = (counts[p.ticker!] || 0) + 1 })
    setTrending(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ticker, count]) => ({ ticker, count })))
  }

  async function onPost(draft: { type: string; ticker?: string; signal?: string; body: string }) {
    if (!user || !profile) return
    await supabase.from('posts').insert({
      user_id: user.id,
      username: profile.username,
      ...draft,
    })
  }

  async function onLike(postId: number, liked: boolean) {
    if (!user) return
    if (liked) {
      await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id })
      await supabase.from('posts').update({ likes: (posts.find(p => p.id === postId)?.likes || 0) + 1 }).eq('id', postId)
      setLikedIds(s => new Set(s).add(postId))
    } else {
      await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id)
      await supabase.from('posts').update({ likes: Math.max(0, (posts.find(p => p.id === postId)?.likes || 1) - 1) }).eq('id', postId)
      setLikedIds(s => { const n = new Set(s); n.delete(postId); return n })
    }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: liked ? p.likes + 1 : p.likes - 1, liked } : p))
  }

  async function onDelete(postId: number) {
    await supabase.from('posts').delete().eq('id', postId)
  }

  const filtered = filter === 'All' ? posts : posts.filter(p => p.type === FILTER_MAP[filter])
  const withLikes = filtered.map(p => ({ ...p, liked: likedIds.has(p.id) }))

  return (
    <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 260px', gap: 20 }} className="grid-cols-1 xl:grid-cols-[1fr_260px]">
      <div>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 20 }}>Community</h1>

        {profile && <PostComposer username={profile.username} onPost={onPost} />}

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 13,
                fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer',
                background: filter === f ? 'var(--accent)' : 'var(--surface)',
                color: filter === f ? 'white' : 'var(--text2)',
                border: filter === f ? 'none' : '1px solid var(--border)',
              }}
            >{f}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><LoadingSpinner size={32} /></div>
        ) : withLikes.length === 0 ? (
          <div className="card text-center py-12">
            <p style={{ color: 'var(--text2)' }}>No posts yet. Be the first!</p>
          </div>
        ) : (
          withLikes.map(p => (
            <PostCard key={p.id} post={p} currentUserId={user?.id} onLike={onLike} onDelete={onDelete} />
          ))
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4 hidden xl:block">
        {/* Leaderboard */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <IconTrophy size={16} style={{ color: 'var(--amber)' }} />
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>Leaderboard</span>
          </div>
          {leaderboard.map((u, i) => (
            <div key={i} className="flex items-center gap-3 mb-3">
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text2)', width: 18, textAlign: 'right' }}>#{i + 1}</span>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white', fontWeight: 700 }}>
                {(u.username || 'U')[0].toUpperCase()}
              </div>
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, flex: 1 }}>{u.username}</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--amber)' }}>{u.picks_score}pts</span>
            </div>
          ))}
        </div>

        {/* Trending Tickers */}
        {trending.length > 0 && (
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <IconFlame size={16} style={{ color: 'var(--red)' }} />
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>Trending</span>
            </div>
            {trending.map(t => (
              <div key={t.ticker} className="flex items-center gap-2 mb-2">
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 12, width: 50 }}>{t.ticker}</span>
                <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 3, width: `${(t.count / trending[0].count) * 100}%` }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text2)', width: 20, textAlign: 'right' }}>{t.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
