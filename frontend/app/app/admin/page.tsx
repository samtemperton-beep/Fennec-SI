'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import {
  IconShield, IconUsers, IconBrain, IconSettings2,
  IconRefresh, IconCrown, IconActivity, IconCheck, IconX, IconLock, IconHeartbeat,
} from '@tabler/icons-react'
import { HealthPanel } from '@/components/admin/HealthPanel'

const GEMINI = 'gemini-2.5-flash'
const HAIKU = 'claude-haiku-4-5-20251001'
const SONNET = 'claude-sonnet-4-6'

const AVAILABLE_MODELS = [
  { id: GEMINI, label: 'Gemini 2.5 Flash', note: 'Cheapest' },
  { id: HAIKU, label: 'Haiku 4.5', note: 'Fast & cheap' },
  { id: SONNET, label: 'Sonnet 4.6', note: 'Best answers, costs the most' },
]

type Tier = 'free' | 'premium'
type PlanInfo = { label: string; desc: string; defaults: Record<Tier, boolean> }
type LimitInfo = { label: string; desc: string; defaults: Record<Tier, number> }

// AI only, never locked: someone stuck signing up always gets help
const SETUP_HELP = { label: 'Onboarding Setup Help', desc: 'Ask Fennec during Akahu setup (always included)' }

const settingKey = (feature: string, tier: Tier) => tier === 'premium' ? `model_${feature}` : `model_free_${feature}`
const planKey = (feature: string, tier: Tier) => `plan_${tier}_${feature}`
const limitKey = (limit: string, tier: Tier) => `limit_${tier}_${limit}`

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
  const [tab, setTab] = useState<'overview' | 'health' | 'models' | 'users'>('overview')

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
  const [modelTier, setModelTier] = useState<Tier>('premium')
  // Each feature's default per tier, from the backend so the two never disagree
  const [modelDefaults, setModelDefaults] = useState<Record<string, Record<Tier, string>>>({})
  const [planFeatures, setPlanFeatures] = useState<Record<string, PlanInfo>>({})
  const [planLimits, setPlanLimits] = useState<Record<string, LimitInfo>>({})
  const [resettingTier, setResettingTier] = useState(false)

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
      const { settings: list, modelDefaults: defaults, planFeatures: features, planLimits: limits } = await api.adminGetSettings()
      const map: Record<string, string> = {}
      for (const s of list) map[s.key] = s.value
      setSettings(map)
      setPendingModels(map)
      setModelDefaults(defaults ?? {})
      setPlanFeatures(features ?? {})
      setPlanLimits(limits ?? {})
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

  // Saves every changed setting in one row (access and model)
  async function saveRow(rowId: string, keys: string[], values: Record<string, string>) {
    setSavingKey(rowId)
    try {
      for (const k of keys) await api.adminSetSetting(k, values[k])
      setSettings(prev => ({ ...prev, ...Object.fromEntries(keys.map(k => [k, values[k]])) }))
      setSavedKey(rowId)
      setTimeout(() => setSavedKey(null), 2000)
    } catch (e: any) { window.alert(e.message) }
    setSavingKey(null)
  }

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

  async function resetModels(tier: Tier) {
    if (!window.confirm(`Put every feature, model and limit for ${tier} accounts back to its default?`)) return
    setResettingTier(true)
    try {
      await api.adminResetModels(tier)
      await loadSettings()
    } catch {}
    setResettingTier(false)
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
    { id: 'health', label: 'Health', icon: IconHeartbeat },
    { id: 'models', label: 'Plans & AI', icon: IconBrain },
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 28, background: 'var(--surface2)', padding: 4, borderRadius: 10, width: 'fit-content', maxWidth: '100%' }}>
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

      {tab === 'health' && <HealthPanel />}

      {/* PLANS & AI TAB */}
      {tab === 'models' && (
        <div>
          <div style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>Plans & AI</h2>
            <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
              Choose what free and premium accounts include, which AI model each feature uses, and each plan&apos;s limits. Changes take effect within 60 seconds.
            </p>
          </div>

          {/* Which accounts these choices apply to */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
              {(['free', 'premium'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setModelTier(t)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13,
                    background: modelTier === t ? 'var(--surface)' : 'transparent',
                    color: modelTier === t ? 'var(--text)' : 'var(--text2)',
                    fontWeight: modelTier === t ? 700 : 400,
                    boxShadow: modelTier === t ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  {t === 'premium' && <IconCrown size={14} color="var(--amber)" />}
                  {t === 'free' ? 'Free accounts' : 'Premium accounts'}
                </button>
              ))}
            </div>
            <button
              onClick={() => resetModels(modelTier)}
              disabled={resettingTier}
              title="Clears saved choices for these accounts so everything uses its default"
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', color: 'var(--text2)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, opacity: resettingTier ? 0.5 : 1 }}
            >
              <IconRefresh size={13} />
              {resettingTier ? 'Resetting…' : `Reset ${modelTier} to defaults`}
            </button>
          </div>

          {settingsLoading ? (
            <div style={{ color: 'var(--text2)', fontSize: 13, padding: '20px 0' }}>Loading…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: '4px 0 2px' }}>Features</h3>
              {[...Object.entries(planFeatures), ['setup_help', { ...SETUP_HELP, defaults: { free: true, premium: true } }] as [string, PlanInfo]].map(([feature, info]) => {
                const hasModel = !!modelDefaults[feature]
                const alwaysOn = feature === 'setup_help'
                const accessKey = planKey(feature, modelTier)
                const accessDefault = info.defaults[modelTier] ? 'on' : 'off'
                const onOff = (v?: string) => (v === 'on' || v === 'off' ? v : accessDefault)
                const access = alwaysOn ? 'on' : onOff(pendingModels[accessKey])
                const savedAccess = alwaysOn ? 'on' : onOff(settings[accessKey])

                const modelKey = settingKey(feature, modelTier)
                const fallback = modelDefaults[feature]?.[modelTier] ?? HAIKU
                const known = (v?: string) => v && AVAILABLE_MODELS.some(m => m.id === v) ? v : fallback
                const currentModel = known(pendingModels[modelKey])
                const savedModel = known(settings[modelKey])

                const changed = [
                  ...(access !== savedAccess ? [accessKey] : []),
                  ...(hasModel && currentModel !== savedModel ? [modelKey] : []),
                ]
                const isDirty = changed.length > 0
                const rowId = `${modelTier}:${feature}`
                const isSaving = savingKey === rowId
                const isSaved = savedKey === rowId
                const included = access === 'on'
                return (
                  <div
                    key={rowId}
                    style={{
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      borderRadius: 12, padding: '14px 18px', opacity: included ? 1 : 0.85,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: '1 1 220px' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{info.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{info.desc}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      {!alwaysOn && (
                        <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--border)', padding: 2, borderRadius: 8 }}>
                          {(['on', 'off'] as const).map(v => (
                            <button
                              key={v}
                              onClick={() => setPendingModels(prev => ({ ...prev, [accessKey]: v }))}
                              title={v === accessDefault ? 'Default' : undefined}
                              style={{
                                padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
                                display: 'flex', alignItems: 'center', gap: 4,
                                fontWeight: access === v ? 700 : 400,
                                background: access === v ? (v === 'on' ? 'var(--green-light)' : 'rgba(217,119,6,0.12)') : 'transparent',
                                color: access === v ? (v === 'on' ? 'var(--green)' : '#d97706') : 'var(--text2)',
                              }}
                            >
                              {v === 'off' && <IconLock size={12} />}
                              {v === 'on' ? 'Included' : 'Locked'}
                              {v === accessDefault && <span style={{ fontSize: 9.5, opacity: 0.7 }}>default</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      {hasModel && (
                        <div style={{ display: 'flex', gap: 4, opacity: included ? 1 : 0.4 }}>
                          {AVAILABLE_MODELS.map(m => (
                            <button
                              key={m.id}
                              onClick={() => setPendingModels(prev => ({ ...prev, [modelKey]: m.id }))}
                              title={m.note}
                              style={{
                                padding: '6px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                                fontWeight: currentModel === m.id ? 700 : 400,
                                border: currentModel === m.id ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                                background: currentModel === m.id ? 'var(--accent)22' : 'var(--surface)',
                                color: currentModel === m.id ? 'var(--accent)' : 'var(--text2)',
                                transition: 'all 0.15s',
                              }}
                            >
                              {m.label}{m.id === fallback && <span style={{ fontSize: 9.5, marginLeft: 4, opacity: 0.7 }}>default</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => saveRow(rowId, changed, { [accessKey]: access, [modelKey]: currentModel })}
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

              <h3 style={{ fontSize: 13, fontWeight: 700, margin: '14px 0 2px' }}>Limits</h3>
              <p style={{ fontSize: 11, color: 'var(--text2)', margin: '0 0 2px' }}>0 means no limit.</p>
              {Object.entries(planLimits).map(([limit, info]) => {
                const key = limitKey(limit, modelTier)
                const legacy = limit === 'daily_ai_calls' && modelTier === 'free' ? settings['free_daily_ai_limit'] : undefined
                return (
                  <LimitEditor
                    key={key}
                    label={info.label}
                    desc={info.desc}
                    defaultValue={String(info.defaults[modelTier])}
                    current={settings[key] ?? legacy ?? String(info.defaults[modelTier])}
                    onSave={(v) => saveModel(key, v)}
                    isSaving={savingKey === key}
                    isSaved={savedKey === key}
                  />
                )
              })}
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

function LimitEditor({ label, desc, defaultValue, current, onSave, isSaving, isSaved }: {
  label: string
  desc: string
  defaultValue: string
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
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{desc} · default {defaultValue === '0' ? 'no limit' : defaultValue}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          min={0}
          max={100000}
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
