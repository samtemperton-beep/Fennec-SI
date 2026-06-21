'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { PremiumBadge } from '@/components/premium/PremiumBadge'
import { toast } from 'sonner'

interface User {
  id: string
  username: string
  subscription_tier: 'free' | 'premium'
  is_admin: boolean
  created_at: string
  tier_updated_at: string | null
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.adminGetUsers()
      .then(r => setUsers(r.users))
      .catch(e => toast.error('Access denied: ' + e.message))
      .finally(() => setLoading(false))
  }, [])

  async function toggleTier(user: User) {
    const newTier = user.subscription_tier === 'premium' ? 'free' : 'premium'
    setToggling(user.id)
    try {
      await api.adminSetTier(user.id, newTier)
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, subscription_tier: newTier, tier_updated_at: new Date().toISOString() } : u))
      toast.success(`${user.username} set to ${newTier}`)
    } catch (e: any) {
      toast.error(e.message)
    }
    setToggling(null)
  }

  const filtered = users.filter(u =>
    !search || u.username?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ padding: 24, maxWidth: 820, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 6 }}>Admin — User Tiers</h1>
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 24 }}>Manually toggle premium access for users.</p>

      <input
        placeholder="Search by username..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', marginBottom: 16, outline: 'none' }}
      />

      {loading ? (
        <div className="flex justify-center py-20"><LoadingSpinner size={32} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(u => (
            <div key={u.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14 }}>{u.username || '—'}</span>
                  {u.is_admin && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'rgba(91,106,255,0.2)', color: 'var(--accent)', fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>ADMIN</span>}
                  {u.subscription_tier === 'premium' && <PremiumBadge />}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>{u.id.slice(0, 8)}…</span>
                {u.tier_updated_at && (
                  <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 10 }}>
                    updated {new Date(u.tier_updated_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              <button
                onClick={() => toggleTier(u)}
                disabled={toggling === u.id}
                style={{
                  padding: '7px 14px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13,
                  cursor: toggling === u.id ? 'not-allowed' : 'pointer', border: 'none',
                  background: u.subscription_tier === 'premium' ? 'rgba(240,84,84,0.12)' : 'rgba(251,191,36,0.15)',
                  color: u.subscription_tier === 'premium' ? 'var(--red)' : '#f59e0b',
                  opacity: toggling === u.id ? 0.6 : 1,
                }}
              >
                {toggling === u.id ? '...' : u.subscription_tier === 'premium' ? 'Revoke Premium' : 'Grant Premium'}
              </button>
            </div>
          ))}
          {filtered.length === 0 && <p style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>No users found</p>}
        </div>
      )}
    </div>
  )
}
