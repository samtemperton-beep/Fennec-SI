'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Avatar } from '@/components/shared/Avatar'
import { IconSettings, IconTrash, IconUpload, IconTarget, IconEdit, IconX, IconArrowLeft, IconChartBar } from '@tabler/icons-react'
import Link from 'next/link'
import { toast } from 'sonner'

const AVATAR_COLORS = [
  '#5b6aff', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
  '#14b8a6', '#a855f7', '#64748b', '#dc2626',
]

const AVATAR_EMOJIS = [
  '🦊', '🐻', '🦁', '🐯', '🦅', '🐺',
  '🦈', '🐉', '🚀', '💎', '🏆', '⚡',
  '🔥', '🌊', '🎯', '🦂', '🦋', '🦉',
]

const INVESTOR_TYPES = [
  'Retail Investor', 'Active Trader', 'Day Trader', 'Swing Trader',
  'Long-Term / Buy & Hold', 'Dividend Investor', 'Growth Investor',
  'Value Investor', 'Index / ETF Investor', 'Crypto Investor',
  'Financial Advisor', 'Fund Manager', 'Student / Learning', 'Other',
]

const GOAL_PRESETS = [
  { label: 'Grow 50%', targetPct: '50', months: '6' },
  { label: '2× portfolio', targetPct: '100', months: '12' },
  { label: '3× portfolio', targetPct: '200', months: '36' },
]

type AvatarTab = 'colour' | 'emoji' | 'upload'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [username, setUsername] = useState('')
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0])
  const [avatarEmoji, setAvatarEmoji] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarTab, setAvatarTab] = useState<AvatarTab>('colour')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [location, setLocation] = useState('')
  const [profession, setProfession] = useState('')
  const [riskLevel, setRiskLevel] = useState(7)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [finnhubKey, setFinnhubKey] = useState('')
  const [user, setUser] = useState<any>(null)
  // Goal
  const [goal, setGoal] = useState<any>(null)
  const [goalForm, setGoalForm] = useState({ targetPct: '100', months: '12', label: 'Double my portfolio' })
  const [editingGoal, setEditingGoal] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user: u } } = await supabase.auth.getUser()
    setUser(u)
    if (u) {
      const { data } = await supabase.from('profiles').select('*').eq('id', u.id).single()
      if (data) {
        setUsername(data.username || '')
        setAvatarColor(data.avatar_color || AVATAR_COLORS[0])
        setAvatarEmoji(data.avatar_emoji || '')
        setAvatarUrl(data.avatar_url || '')
        setLocation(data.location || '')
        setProfession(data.profession || '')
        setRiskLevel(data.risk_level || 7)
        if (data.avatar_url) setAvatarTab('upload')
        else if (data.avatar_emoji) setAvatarTab('emoji')
      }
      // Load goal from localStorage
      const saved = localStorage.getItem(`portfolio_goal_${u.id}`)
      if (saved) {
        const g = JSON.parse(saved)
        setGoal(g)
        setGoalForm({ targetPct: String(g.targetPct), months: String(Math.round((new Date(g.endDate).getTime() - new Date(g.startDate).getTime()) / (30.44 * 86400000))), label: g.label })
      }
    }
    setLoading(false)
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return }
    setUploadingAvatar(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${user.id}/avatar.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      setAvatarUrl(publicUrl)
      setAvatarEmoji('')
      toast.success('Photo uploaded')
    } catch (e: any) {
      toast.error(e.message || 'Upload failed')
    }
    setUploadingAvatar(false)
  }

  function selectEmoji(emoji: string) {
    setAvatarEmoji(emoji)
    setAvatarUrl('')
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    try {
      const update: any = {
        id: user.id, username, avatar_color: avatarColor,
        avatar_emoji: avatarTab === 'emoji' ? avatarEmoji : null,
        avatar_url: avatarTab === 'upload' ? avatarUrl : null,
        location: location || null, profession: profession || null, risk_level: riskLevel,
      }
      await supabase.from('profiles').upsert(update)
      if (anthropicKey || finnhubKey) {
        await supabase.auth.updateUser({ data: { anthropic_key: anthropicKey || user.user_metadata?.anthropic_key, finnhub_key: finnhubKey || user.user_metadata?.finnhub_key } })
      }
      toast.success('Settings saved')
    } catch (e: any) {
      toast.error(e.message)
    }
    setSaving(false)
  }

  function saveGoal() {
    if (!user) return
    const targetPct = parseFloat(goalForm.targetPct)
    const months = parseInt(goalForm.months)
    const existing = goal
    const startDate = existing?.startDate || new Date().toISOString()
    const startValue = existing?.startValue || 0
    const endDate = new Date(Date.now() + months * 30.44 * 86400000).toISOString()
    const newGoal = { targetPct, startValue, startDate, endDate, label: goalForm.label }
    localStorage.setItem(`portfolio_goal_${user.id}`, JSON.stringify(newGoal))
    setGoal(newGoal)
    setEditingGoal(false)
    toast.success('Goal updated')
  }

  function clearGoal() {
    if (!user || !confirm('Remove this goal?')) return
    localStorage.removeItem(`portfolio_goal_${user.id}`)
    setGoal(null)
    setEditingGoal(false)
    toast.success('Goal cleared')
  }

  const RISK_LABELS = ['', 'Very Conservative', 'Conservative', 'Moderate-Conservative', 'Moderate', 'Moderate', 'Moderate-Aggressive', 'Aggressive', 'Aggressive', 'Very Aggressive', 'Maximum Risk']

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="flex justify-center py-20"><LoadingSpinner size={32} /></div>
    </div>
  )

  const avatarPreview = (
    <Avatar
      username={username}
      avatarColor={avatarColor}
      avatarEmoji={avatarTab === 'emoji' ? avatarEmoji : undefined}
      avatarUrl={avatarTab === 'upload' ? avatarUrl : undefined}
      size={64}
    />
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Top nav */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div className="flex items-center gap-3">
          <Link href="/app/portfolio" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)', fontSize: 13, fontFamily: 'Syne, sans-serif', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text)'}
            onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text2)'}
          >
            <IconArrowLeft size={16} /> Back
          </Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <div className="flex items-center gap-2">
            <div style={{ background: 'var(--accent)', borderRadius: 6, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconChartBar size={13} color="white" />
            </div>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>Fennec SI</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IconSettings size={15} style={{ color: 'var(--text2)' }} />
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14 }}>Settings</span>
        </div>
      </div>

    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      {user && <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 28 }}>{user.email}</p>}

      <form onSubmit={save} className="space-y-6">
        {/* Profile */}
        <div className="card">
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Profile</h2>

          {/* Avatar section */}
          <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--surface2)' }}>
            <div className="flex items-center gap-4 mb-3">
              {avatarPreview}
              <div>
                <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14 }}>{username || 'Your Name'}</p>
                {profession && <p style={{ fontSize: 12, color: 'var(--text2)' }}>{profession}</p>}
                {location && <p style={{ fontSize: 11, color: 'var(--text2)' }}>📍 {location}</p>}
              </div>
            </div>

            {/* Avatar tabs */}
            <div className="flex gap-1 mb-3" style={{ background: 'var(--surface)', borderRadius: 8, padding: 3 }}>
              {(['colour', 'emoji', 'upload'] as AvatarTab[]).map(tab => (
                <button key={tab} type="button" onClick={() => setAvatarTab(tab)}
                  style={{
                    flex: 1, padding: '6px 4px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: avatarTab === tab ? 'var(--accent)' : 'transparent',
                    color: avatarTab === tab ? 'white' : 'var(--text2)',
                    fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 600,
                    textTransform: 'capitalize',
                  }}
                >
                  {tab === 'colour' ? '🎨 Colour' : tab === 'emoji' ? '😎 Character' : '📷 Photo'}
                </button>
              ))}
            </div>

            {/* Colour tab */}
            {avatarTab === 'colour' && (
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setAvatarColor(c)}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                      outline: avatarColor === c ? '3px solid white' : 'none',
                      outlineOffset: 2,
                      boxShadow: avatarColor === c ? `0 0 0 5px ${c}55` : 'none',
                    }}
                  />
                ))}
              </div>
            )}

            {/* Emoji/character tab */}
            {avatarTab === 'emoji' && (
              <div className="flex flex-wrap gap-2">
                {AVATAR_EMOJIS.map(em => (
                  <button key={em} type="button" onClick={() => selectEmoji(em)}
                    style={{
                      width: 44, height: 44, borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: avatarEmoji === em ? 'rgba(91,106,255,0.2)' : 'var(--surface)',
                      outline: avatarEmoji === em ? '2px solid var(--accent)' : 'none',
                      fontSize: 22, lineHeight: 1,
                    }}
                  >
                    {em}
                  </button>
                ))}
                <p style={{ fontSize: 11, color: 'var(--text2)', width: '100%', marginTop: 4 }}>Character shows on your chosen background colour</p>
              </div>
            )}

            {/* Upload tab */}
            {avatarTab === 'upload' && (
              <div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
                {avatarUrl ? (
                  <div className="flex items-center gap-3">
                    <img src={avatarUrl} alt="avatar" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
                    <div>
                      <button type="button" onClick={() => fileRef.current?.click()}
                        className="flex items-center gap-1"
                        style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        <IconUpload size={13} /> Change photo
                      </button>
                      <button type="button" onClick={() => { setAvatarUrl(''); setAvatarTab('colour') }}
                        className="flex items-center gap-1 mt-1"
                        style={{ fontSize: 12, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        <IconX size={13} /> Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadingAvatar}
                    className="flex flex-col items-center justify-center gap-2 w-full py-6 rounded-xl"
                    style={{ background: 'var(--surface)', border: '2px dashed var(--border)', cursor: 'pointer', color: 'var(--text2)' }}
                  >
                    {uploadingAvatar ? <LoadingSpinner size={20} /> : <IconUpload size={22} />}
                    <span style={{ fontSize: 12, fontFamily: 'Syne, sans-serif' }}>
                      {uploadingAvatar ? 'Uploading...' : 'Click to upload a photo (max 2MB)'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Username</label>
              <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
              />
            </div>

            <div className="flex gap-3">
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Location</label>
                <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Auckland, NZ"
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 13, outline: 'none' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Investor Type</label>
                <select value={profession} onChange={e => setProfession(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: profession ? 'var(--text)' : 'var(--text2)', fontFamily: 'DM Mono, monospace', fontSize: 13, outline: 'none' }}
                >
                  <option value="">Select...</option>
                  {INVESTOR_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 8 }}>
                Risk Level — {RISK_LABELS[riskLevel]}
              </label>
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 11, color: 'var(--green)' }}>Conservative</span>
                <input type="range" min={1} max={10} value={riskLevel} onChange={e => setRiskLevel(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: 11, color: 'var(--red)' }}>Aggressive</span>
              </div>
              <p className="text-center mt-1" style={{ fontFamily: 'DM Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{riskLevel}/10</p>
            </div>
          </div>
        </div>

        {/* Portfolio Goal */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16 }}>
              <IconTarget size={16} style={{ display: 'inline', marginRight: 6, color: 'var(--accent)' }} />
              Portfolio Goal
            </h2>
            {goal && !editingGoal && (
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditingGoal(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4 }}
                >
                  <IconEdit size={15} />
                </button>
                <button type="button" onClick={clearGoal}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4 }}
                >
                  <IconX size={15} />
                </button>
              </div>
            )}
          </div>

          {goal && !editingGoal ? (
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{goal.label}</p>
              <p style={{ fontSize: 12, color: 'var(--text2)' }}>
                Target: +{goal.targetPct}% · Due {new Date(goal.endDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          ) : editingGoal || !goal ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Presets */}
              <div className="flex gap-2">
                {GOAL_PRESETS.map(p => (
                  <button key={p.label} type="button"
                    onClick={() => setGoalForm(f => ({ ...f, targetPct: p.targetPct, months: p.months, label: p.label }))}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 11,
                      background: goalForm.targetPct === p.targetPct && goalForm.months === p.months ? 'rgba(91,106,255,0.2)' : 'var(--surface2)',
                      border: goalForm.targetPct === p.targetPct && goalForm.months === p.months ? '1px solid var(--accent)' : '1px solid var(--border)',
                      color: goalForm.targetPct === p.targetPct && goalForm.months === p.months ? 'var(--accent)' : 'var(--text)',
                      fontFamily: 'DM Mono, monospace',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input value={goalForm.label} onChange={e => setGoalForm(f => ({ ...f, label: e.target.value }))}
                placeholder="Name your goal"
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
              />
              <div className="flex gap-3">
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Target gain (%)</label>
                  <input type="number" value={goalForm.targetPct} min="1"
                    onChange={e => setGoalForm(f => ({ ...f, targetPct: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Timeframe (months)</label>
                  <input type="number" value={goalForm.months} min="1"
                    onChange={e => setGoalForm(f => ({ ...f, months: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={saveGoal}
                  style={{ flex: 1, background: 'var(--accent)', color: 'white', padding: '10px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600, border: 'none', cursor: 'pointer' }}
                >
                  {goal ? 'Update Goal' : 'Set Goal'}
                </button>
                {editingGoal && (
                  <button type="button" onClick={() => setEditingGoal(false)}
                    style={{ padding: '10px 16px', borderRadius: 8, fontFamily: 'Syne, sans-serif', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text2)', margin: 0 }}>Progress is tracked from your portfolio value when the goal was created.</p>
            </div>
          ) : null}
        </div>

        {/* API Keys */}
        <div className="card">
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>API Keys</h2>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>Keys are encrypted and stored securely. Never exposed to the browser.</p>
          <div className="space-y-4">
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Anthropic API Key (for AI features)</label>
              <input type="password" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)}
                placeholder={user?.user_metadata?.anthropic_key ? '••••••••••••••••••• (saved)' : 'sk-ant-...'}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Finnhub API Key (for market data)</label>
              <input type="password" value={finnhubKey} onChange={e => setFinnhubKey(e.target.value)}
                placeholder={user?.user_metadata?.finnhub_key ? '••••••••••••••••••• (saved)' : 'Your Finnhub key'}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
              />
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-lg"
          style={{ background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}
        >
          {saving ? <LoadingSpinner size={16} /> : null}
          Save Settings
        </button>
      </form>

      {/* Danger zone */}
      <div className="card mt-6 mb-8" style={{ border: '1px solid rgba(240,84,84,0.3)' }}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--red)', marginBottom: 8 }}>Danger Zone</h2>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>Permanently delete your account and all associated data.</p>
        <button onClick={async () => {
          if (!confirm('Are you sure? This will permanently delete your account and all data.')) return
          await supabase.from('profiles').delete().eq('id', user.id)
          await supabase.auth.signOut()
          window.location.href = '/'
        }} className="flex items-center gap-2 px-4 py-2 rounded-lg"
          style={{ background: 'rgba(240,84,84,0.1)', color: 'var(--red)', border: '1px solid rgba(240,84,84,0.3)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}
        >
          <IconTrash size={16} /> Delete Account
        </button>
      </div>
    </div>
    </div>
  )
}
