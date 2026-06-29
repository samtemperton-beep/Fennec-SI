'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
const supabase = createClient()
import { IconSettings, IconUsers, IconRefresh, IconCrown, IconCheck, IconX } from '@tabler/icons-react'
import { toast } from 'sonner'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

interface User {
  id: string
  username: string | null
  email: string | null
  subscription_tier: string
  is_admin: boolean
  usage_count: number | null
  last_usage_reset: string | null
  created_at: string
}

interface Setting {
  key: string
  value: string
  description: string | null
  updated_at: string
}

interface Stats {
  total: number
  premium: number
  activeThisWeek: number
}

const SETTING_LABELS: Record<string, string> = {
  free_daily_ai_limit: 'Free daily AI calls',
  free_max_holdings: 'Free max holdings',
  free_max_watchlist: 'Free max watchlist items',
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'users' | 'settings'>('users')
  const [users, setUsers] = useState<User[]>([])
  const [settings, setSettings] = useState<Setting[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const t = data.session?.access_token ?? null
      setToken(t)
      if (!t) { setIsAdmin(false); setLoading(false); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin').single()
      setIsAdmin(profile?.is_admin === true)
      setLoading(false)
    })
  }, [])

  async function headers() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  }

  async function loadAll() {
    setLoading(true)
    const [uRes, sRes, stRes] = await Promise.all([
      fetch(`${API}/api/admin/users`, { headers: await headers() }),
      fetch(`${API}/api/admin/settings`, { headers: await headers() }),
      fetch(`${API}/api/admin/stats`, { headers: await headers() }),
    ])
    if (uRes.ok) setUsers((await uRes.json()).users ?? [])
    if (sRes.ok) setSettings((await sRes.json()).settings ?? [])
    if (stRes.ok) setStats(await stRes.json())
    setLoading(false)
  }

  useEffect(() => { if (isAdmin) loadAll() }, [isAdmin])

  async function toggleTier(user: User) {
    const tier = user.subscription_tier === 'premium' ? 'free' : 'premium'
    const res = await fetch(`${API}/api/admin/users/${user.id}/tier`, {
      method: 'PATCH',
      headers: await headers(),
      body: JSON.stringify({ tier }),
    })
    if (res.ok) {
      setUsers(u => u.map(x => x.id === user.id ? { ...x, subscription_tier: tier } : x))
      toast.success(`${user.username ?? 'User'} set to ${tier}`)
    } else toast.error('Failed to update tier')
  }

  async function resetUsage(user: User) {
    const res = await fetch(`${API}/api/admin/users/${user.id}/reset-usage`, {
      method: 'POST',
      headers: await headers(),
    })
    if (res.ok) {
      setUsers(u => u.map(x => x.id === user.id ? { ...x, usage_count: 0 } : x))
      toast.success('Usage reset')
    } else toast.error('Failed to reset usage')
  }

  async function saveSetting(key: string) {
    setSaving(true)
    const res = await fetch(`${API}/api/admin/settings/${key}`, {
      method: 'PATCH',
      headers: await headers(),
      body: JSON.stringify({ value: editValue }),
    })
    setSaving(false)
    if (res.ok) {
      setSettings(s => s.map(x => x.key === key ? { ...x, value: editValue } : x))
      setEditingKey(null)
      toast.success('Setting saved')
    } else toast.error('Failed to save')
  }

  const filteredUsers = users.filter(u =>
    !search || (u.username ?? '').toLowerCase().includes(search.toLowerCase()) || (u.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div style={{ padding: 40, color: 'var(--text2)', fontSize: 14 }}>Loading…</div>
  )

  if (!isAdmin) return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)' }}>Access denied</h1>
      <p style={{ color: 'var(--text2)', marginTop: 8 }}>You need admin privileges to view this page.</p>
    </div>
  )

  return (
    <div style={{ padding: '28px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Admin Panel</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Manage users, limits, and platform settings</p>
        </div>
        <button onClick={loadAll} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
          <IconRefresh size={14} /> Refresh
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total users', value: stats.total },
            { label: 'Premium users', value: stats.premium },
            { label: 'Active this week', value: stats.activeThisWeek },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
              <p style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</p>
              <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'DM Mono, monospace', color: 'var(--primary)', marginTop: 4 }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['users', 'settings'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === t ? 'var(--primary)' : 'none', color: tab === t ? 'white' : 'var(--text2)' }}>
            {t === 'users' ? <IconUsers size={14} /> : <IconSettings size={14} />}
            {t === 'users' ? 'Users' : 'Platform settings'}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…"
              style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['User', 'Tier', 'AI today', 'Joined', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Actions' ? 'center' : 'left', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <p style={{ fontWeight: 600, fontSize: 13 }}>{u.username ?? '—'}</p>
                      <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{u.email ?? u.id.slice(0, 8) + '…'}</p>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: u.subscription_tier === 'premium' ? 'rgba(250,204,21,0.15)' : 'var(--surface2)', color: u.subscription_tier === 'premium' ? '#FACC15' : 'var(--text2)' }}>
                        {u.subscription_tier === 'premium' && <IconCrown size={10} />}
                        {u.subscription_tier}
                      </span>
                      {u.is_admin && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--primary)', fontWeight: 700 }}>ADMIN</span>}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>
                      {u.usage_count ?? 0}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text2)' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                        <button onClick={() => toggleTier(u)}
                          disabled={u.is_admin}
                          title={u.is_admin ? 'Cannot change admin tier' : `Set to ${u.subscription_tier === 'premium' ? 'free' : 'premium'}`}
                          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: u.is_admin ? 'var(--text3)' : 'var(--primary)', fontSize: 11, cursor: u.is_admin ? 'default' : 'pointer', fontWeight: 600, opacity: u.is_admin ? 0.4 : 1 }}>
                          {u.subscription_tier === 'premium' ? 'Downgrade' : 'Upgrade'}
                        </button>
                        <button onClick={() => resetUsage(u)}
                          title="Reset today's AI usage"
                          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}>
                          Reset
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settings tab */}
      {tab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {settings.length === 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              No settings found. Run the SQL setup in Supabase first.
            </div>
          )}
          {settings.map(s => {
            const isEditing = editingKey === s.key
            return (
              <div key={s.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 14 }}>{SETTING_LABELS[s.key] ?? s.key}</p>
                  {s.description && <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{s.description}</p>}
                  <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                    key: <code style={{ fontFamily: 'DM Mono, monospace' }}>{s.key}</code>
                    {s.updated_at && ` · updated ${new Date(s.updated_at).toLocaleDateString()}`}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isEditing ? (
                    <>
                      <input value={editValue} onChange={e => setEditValue(e.target.value)}
                        type="number" min={0}
                        style={{ width: 80, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--primary)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, fontFamily: 'DM Mono, monospace', textAlign: 'center', outline: 'none' }}
                        onKeyDown={e => { if (e.key === 'Enter') saveSetting(s.key); if (e.key === 'Escape') setEditingKey(null) }}
                        autoFocus
                      />
                      <button onClick={() => saveSetting(s.key)} disabled={saving}
                        style={{ padding: 6, borderRadius: 6, border: 'none', background: 'var(--primary)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <IconCheck size={14} />
                      </button>
                      <button onClick={() => setEditingKey(null)}
                        style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <IconX size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 22, fontWeight: 800, color: 'var(--primary)', minWidth: 40, textAlign: 'center' }}>{s.value}</span>
                      <button onClick={() => { setEditingKey(s.key); setEditValue(s.value) }}
                        style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        Edit
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
