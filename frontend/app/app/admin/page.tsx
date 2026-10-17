'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import {
  IconShield, IconUsers, IconBrain, IconSettings2,
  IconRefresh, IconCrown, IconActivity, IconCheck, IconX,
} from '@tabler/icons-react'

const AVAILABLE_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', note: 'Fast & cheap' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', note: 'Balanced (recommended)' },
]

const AI_SECTIONS = [
  { key: 'model_analyze', label: 'Stock Analyzer', desc: 'Individual stock analysis signal' },
  { key: 'model_helper', label: 'AI Helper', desc: 'Floating chat assistant', defaultModel: 'claude-sonnet-4-6' },
  { key: 'model_chat', label: 'AI Advisor Chat', desc: 'Portfolio chat advisor' },
  { key: 'model_top10', label: "Today's Picks", desc: 'Top 10 stock picks generation' },
  { key: 'model_opportunities', label: 'Discover / Opportunities', desc: 'Hidden gem opportunities' },
  { key: 'model_summary', label: 'Dashboard Daily Summary', desc: 'Fennec daily briefing on the dashboard' },
  { key: 'model_news', label: 'News Digest', desc: 'AI news analysis & digest' },
  { key: 'model_ipo', label: 'IPO Analysis', desc: 'IPO scoring and analysis' },
  { key: 'model_deep_dive', label: 'Deep Dive', desc: 'In-depth stock research (premium)' },
]

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
      background: `${color}22`, color, letterSpacing: '.04em', textTransform: 'uppercase' as const,
    }}>
      {children}
    </span>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 20px', flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase' as const }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [tab, setTab] = useState<'overview' | 'models' | 'users'>('overview')

  // Stats
  const [stats, setStats] = useState<any>(null)
  const [usageStats, setUsageStats] = useState<any>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Models
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [pendingModels, setPendingModels] = useState<Record<string, string>>({})

  // Users
  const [users, setUsers] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('is_admin').then(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!p?.is_admin) { router.replace('/app/portfolio'); return }
      setChecking(false)
    })
  }, [router])

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const [s, u] = await Promise.all([api.adminGetStats(), api.adminGetUsageStats()])
      setStats(s)
      setUsageStats(u)
    } catch {}
    setStatsLoading(false)
  }, [])

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true)
    try {
      const { settings: list } = await api.adminGetSettings()
      const map: Record<string, string> = {}
      for (const s of list) map[s.key] = s.value
      setSettings(map)
      setPendingModels(map)
    } catch {}
    setSettingsLoading(false)
  }, [])

  const loadUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const { users: list } = await api.adminGetUsers()
      setUsers(list || [])
    } catch {}
    setUsersLoading(false)
  }, [])

  useEffect(() => {
    if (checking) return
    loadStats()
    loadSettings()
    loadUsers()
  }, [checking, loadStats, loadSettings, loadUsers])

  async function saveModel(key: string, value: string) {
    setSavingKey(key)
    try {
      await api.adminSetSetting(key, value)
      setSettings(prev => ({ ...prev, [key]: value }))
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 2000)
    } catch {}
    setSavingKey(null)
  }

  async function toggleTier(userId: string, currentTier: string) {
    setTogglingId(userId)
    const next = currentTier === 'premium' ? 'free' : 'premium'
    try {
      await api.adminSetTier(userId, next)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, subscription_tier: next } : u))
    } catch {}
    setTogglingId(null)
  }

  async function resetUsage(userId: string) {
    setResettingId(userId)
    try {
      await api.adminResetUsage(userId)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, usage_count: 0 } : u))
      if (usageStats) {
        setUsageStats((prev: any) => ({
          ...prev,
          perUser: prev.perUser.map((u: any) => u.id === userId ? { ...u, usage_count: 0 } : u),
        }))
      }
    } catch {}
    setResettingId(null)
  }

  if (checking) return null

  const today = new Date().toISOString().slice(0, 10)

  const tabs = [
    { id: 'overview', label: 'Overview', icon: IconActivity },
    { id: 'models', label: 'AI Models', icon: IconBrain },
    { id: 'users', label: 'Users', icon: IconUsers },
  ] as const

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconShield size={20} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>Admin Panel</h1>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)' }}>Platform management and configuration</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: 'var(--surface2)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13,
              background: tab === t.id ? 'var(--surface)' : 'transparent',
              color: tab === t.id ? 'var(--text)' : 'var(--text2)',
              fontWeight: tab === t.id ? 700 : 400,
              boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Platform Overview</h2>
            <button
              onClick={() => { loadStats() }}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', color: 'var(--text2)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <IconRefresh size={13} />
              Refresh
            </button>
          </div>

          {statsLoading ? (
            <div style={{ color: 'var(--text2)', fontSize: 13, padding: '20px 0' }}>Loading…</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
                <StatCard label="Total Users" value={stats?.total ?? '—'} />
                <StatCard label="Premium Users" value={stats?.premium ?? '—'} sub={stats?.total ? `${Math.round((stats.premium / stats.total) * 100)}% of total` : undefined} />
                <StatCard label="Active This Week" value={stats?.activeThisWeek ?? '—'} />
                <StatCard label="AI Calls Today" value={usageStats?.totalToday ?? '—'} />
                <StatCard label="AI Calls All-time" value={usageStats?.totalAllTime ?? '—'} />
              </div>

              {/* Per-user usage top 10 */}
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Top Users by AI Usage (Today)</h3>
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['User', 'Tier', 'Usage Today', 'Total Usage'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text2)', fontWeight: 600, letterSpacing: '.04em', fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(usageStats?.perUser ?? [])
                      .slice()
                      .sort((a: any, b: any) => {
                        const aToday = a.last_usage_reset === today ? (a.usage_count || 0) : 0
                        const bToday = b.last_usage_reset === today ? (b.usage_count || 0) : 0
                        return bToday - aToday
                      })
                      .slice(0, 15)
                      .map((u: any) => {
                        const todayCount = u.last_usage_reset === today ? (u.usage_count || 0) : 0
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '9px 14px', color: 'var(--text)' }}>
                              {u.username || u.email || u.id.slice(0, 8)}
                              {u.is_admin && <span style={{ marginLeft: 6 }}><Tag color="var(--accent)">admin</Tag></span>}
                            </td>
                            <td style={{ padding: '9px 14px' }}>
                              {u.subscription_tier === 'premium'
                                ? <Tag color="var(--amber)">Premium</Tag>
                                : <Tag color="var(--text2)">Free</Tag>}
                            </td>
                            <td style={{ padding: '9px 14px', color: todayCount > 0 ? 'var(--text)' : 'var(--text2)', fontWeight: todayCount > 5 ? 700 : 400 }}>{todayCount}</td>
                            <td style={{ padding: '9px 14px', color: 'var(--text2)' }}>{u.usage_count || 0}</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* MODELS TAB */}
      {tab === 'models' && (
        <div>
          <div style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>AI Model Configuration</h2>
            <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
              Set the Claude model used for each AI feature. Changes take effect within 60 seconds (settings cache TTL).
              Applies to premium users; free users always use Gemini.
            </p>
          </div>

          {settingsLoading ? (
            <div style={{ color: 'var(--text2)', fontSize: 13, padding: '20px 0' }}>Loading…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {AI_SECTIONS.map(section => {
                const currentModel = pendingModels[section.key] || section.defaultModel || 'claude-haiku-4-5-20251001'
                const savedModel = settings[section.key] || section.defaultModel || 'claude-haiku-4-5-20251001'
                const isDirty = currentModel !== savedModel
                const isSaving = savingKey === section.key
                const isSaved = savedKey === section.key
                return (
                  <div
                    key={section.key}
                    style={{
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      borderRadius: 12, padding: '16px 18px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{section.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{section.desc}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {AVAILABLE_MODELS.map(m => (
                          <button
                            key={m.id}
                            onClick={() => setPendingModels(prev => ({ ...prev, [section.key]: m.id }))}
                            title={m.note}
                            style={{
                              padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                              fontWeight: currentModel === m.id ? 700 : 400,
                              border: currentModel === m.id ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                              background: currentModel === m.id ? 'var(--accent)22' : 'var(--surface)',
                              color: currentModel === m.id ? 'var(--accent)' : 'var(--text2)',
                              transition: 'all 0.15s',
                            }}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => saveModel(section.key, currentModel)}
                        disabled={isSaving || !isDirty}
                        style={{
                          padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: isDirty && !isSaving ? 'pointer' : 'default',
                          border: 'none',
                          background: isSaved ? 'var(--green)' : isDirty ? 'var(--accent)' : 'var(--surface)',
                          color: isSaved || isDirty ? '#fff' : 'var(--text2)',
                          fontWeight: 600, opacity: !isDirty && !isSaved ? 0.4 : 1,
                          display: 'flex', alignItems: 'center', gap: 4,
                          transition: 'all 0.15s',
                        }}
                      >
                        {isSaved ? <><IconCheck size={13} /> Saved</> : isSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* Free limit setting */}
              <div style={{ marginTop: 14 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Platform Settings</h3>
                <FreeLimitEditor
                  current={settings['free_daily_ai_limit'] || '10'}
                  onSave={(v) => saveModel('free_daily_ai_limit', v)}
                  isSaving={savingKey === 'free_daily_ai_limit'}
                  isSaved={savedKey === 'free_daily_ai_limit'}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* USERS TAB */}
      {tab === 'users' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px' }}>User Management</h2>
              <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>{users.length} users</p>
            </div>
            <button
              onClick={loadUsers}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', color: 'var(--text2)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <IconRefresh size={13} />
              Refresh
            </button>
          </div>

          {usersLoading ? (
            <div style={{ color: 'var(--text2)', fontSize: 13, padding: '20px 0' }}>Loading…</div>
          ) : (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['User', 'Tier', 'Usage', 'Last Active', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text2)', fontWeight: 600, letterSpacing: '.04em', fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{u.username || '—'}</div>
                        <div style={{ color: 'var(--text2)', fontSize: 10.5 }}>{u.email}</div>
                        {u.is_admin && <Tag color="var(--accent)">admin</Tag>}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        {u.subscription_tier === 'premium'
                          ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconCrown size={12} color="var(--amber)" /><Tag color="var(--amber)">Premium</Tag></span>
                          : <Tag color="var(--text2)">Free</Tag>}
                      </td>
                      <td style={{ padding: '9px 14px', color: 'var(--text)' }}>
                        {u.last_usage_reset === today ? u.usage_count || 0 : 0}
                        <span style={{ color: 'var(--text2)', fontSize: 10.5 }}> today</span>
                      </td>
                      <td style={{ padding: '9px 14px', color: 'var(--text2)', fontSize: 11 }}>
                        {u.last_usage_reset || '—'}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => toggleTier(u.id, u.subscription_tier)}
                            disabled={togglingId === u.id}
                            style={{
                              padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600,
                              border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
                              opacity: togglingId === u.id ? 0.5 : 1,
                            }}
                          >
                            {togglingId === u.id ? '…' : u.subscription_tier === 'premium' ? 'Downgrade' : 'Upgrade'}
                          </button>
                          <button
                            onClick={() => resetUsage(u.id)}
                            disabled={resettingId === u.id}
                            title="Reset daily AI usage counter"
                            style={{
                              padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                              border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)',
                              opacity: resettingId === u.id ? 0.5 : 1,
                            }}
                          >
                            {resettingId === u.id ? '…' : 'Reset'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FreeLimitEditor({ current, onSave, isSaving, isSaved }: {
  current: string
  onSave: (v: string) => void
  isSaving: boolean
  isSaved: boolean
}) {
  const [val, setVal] = useState(current)
  useEffect(() => { setVal(current) }, [current])
  const isDirty = val !== current

  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 18px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Free Daily AI Limit</div>
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>Max AI calls per day for free-tier users</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          min={1}
          max={100}
          style={{
            width: 70, padding: '6px 10px', borderRadius: 7, fontSize: 13,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', textAlign: 'center' as const,
          }}
        />
        <button
          onClick={() => onSave(val)}
          disabled={isSaving || !isDirty}
          style={{
            padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: isDirty && !isSaving ? 'pointer' : 'default',
            border: 'none',
            background: isSaved ? 'var(--green)' : isDirty ? 'var(--accent)' : 'var(--surface)',
            color: isSaved || isDirty ? '#fff' : 'var(--text2)',
            fontWeight: 600, opacity: !isDirty && !isSaved ? 0.4 : 1,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {isSaved ? <><IconCheck size={13} /> Saved</> : isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
