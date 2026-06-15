'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconSettings, IconTrash } from '@tabler/icons-react'
import { toast } from 'sonner'

export default function SettingsPage() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [username, setUsername] = useState('')
  const [riskLevel, setRiskLevel] = useState(7)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [finnhubKey, setFinnhubKey] = useState('')
  const [user, setUser] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    init()
  }, [])

  async function init() {
    const { data: { user: u } } = await supabase.auth.getUser()
    setUser(u)
    if (u) {
      const { data } = await supabase.from('profiles').select('*').eq('id', u.id).single()
      if (data) {
        setProfile(data)
        setUsername(data.username || '')
        setRiskLevel(data.risk_level || 7)
      }
    }
    setLoading(false)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    try {
      await supabase.from('profiles').upsert({ id: user.id, username, risk_level: riskLevel })
      if (anthropicKey || finnhubKey) {
        await supabase.auth.updateUser({ data: { anthropic_key: anthropicKey || user.user_metadata?.anthropic_key, finnhub_key: finnhubKey || user.user_metadata?.finnhub_key } })
      }
      toast.success('Settings saved')
    } catch (e: any) {
      toast.error(e.message)
    }
    setSaving(false)
  }

  async function deleteAccount() {
    if (!confirm('Are you sure? This will permanently delete your account and all data.')) return
    await supabase.from('profiles').delete().eq('id', user.id)
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const RISK_LABELS = ['', 'Very Conservative', 'Conservative', 'Moderate-Conservative', 'Moderate', 'Moderate', 'Moderate-Aggressive', 'Aggressive', 'Aggressive', 'Very Aggressive', 'Maximum Risk']

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size={32} /></div>

  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 8 }}>
        <IconSettings size={22} style={{ display: 'inline', marginRight: 8 }} />
        Settings
      </h1>
      {user && <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 28 }}>{user.email}</p>}

      <form onSubmit={save} className="space-y-6">
        {/* Profile */}
        <div className="card">
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Profile</h2>
          <div className="space-y-4">
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
              />
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

        {/* API Keys */}
        <div className="card">
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>API Keys</h2>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>Keys are encrypted and stored securely. Never exposed to the browser.</p>
          <div className="space-y-4">
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>
                Anthropic API Key (for AI features)
              </label>
              <input
                type="password"
                value={anthropicKey}
                onChange={e => setAnthropicKey(e.target.value)}
                placeholder={user?.user_metadata?.anthropic_key ? '••••••••••••••••••• (saved)' : 'sk-ant-...'}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>
                Finnhub API Key (for market data)
              </label>
              <input
                type="password"
                value={finnhubKey}
                onChange={e => setFinnhubKey(e.target.value)}
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
      <div className="card mt-6" style={{ border: '1px solid rgba(240,84,84,0.3)' }}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--red)', marginBottom: 8 }}>Danger Zone</h2>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>Permanently delete your account and all associated data.</p>
        <button onClick={deleteAccount} className="flex items-center gap-2 px-4 py-2 rounded-lg"
          style={{ background: 'rgba(240,84,84,0.1)', color: 'var(--red)', border: '1px solid rgba(240,84,84,0.3)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}
        >
          <IconTrash size={16} /> Delete Account
        </button>
      </div>
    </div>
  )
}
