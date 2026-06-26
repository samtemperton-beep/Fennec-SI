'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { fmtCurrency, timeAgo } from '@/lib/utils'
import { IconBell, IconPlus, IconTrash, IconCheck } from '@tabler/icons-react'
import { toast } from 'sonner'

interface Alert {
  id: number; ticker: string; type: string; price?: number; triggered: boolean; created_at: string
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState({ ticker: '', type: 'above', price: '' })
  const [checking, setChecking] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUserId(data.user.id); load(data.user.id) }
    })
  }, [])

  async function load(uid: string) {
    setLoading(true)
    const { data } = await supabase.from('alerts').select('*').eq('user_id', uid).order('created_at', { ascending: false })
    setAlerts(data || [])
    setLoading(false)
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    const { data, error } = await supabase.from('alerts').insert({
      user_id: userId, ticker: form.ticker.toUpperCase(), type: form.type, price: form.price ? parseFloat(form.price) : null,
    }).select().single()
    if (error) return toast.error(error.message)
    setAlerts(prev => [data, ...prev])
    setAddOpen(false); setForm({ ticker: '', type: 'above', price: '' })
    toast.success('Alert created')
  }

  async function remove(id: number) {
    await supabase.from('alerts').delete().eq('id', id)
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  async function checkNow() {
    setChecking(true)
    try {
      const { triggered } = await api.checkAlerts()
      toast.success(`${triggered.length} alerts checked${triggered.length > 0 ? `, ${triggered.length} triggered` : ''}`)
      if (userId) await load(userId)
    } catch (e: any) {
      toast.error(e.message)
    }
    setChecking(false)
  }

  const active = alerts.filter(a => !a.triggered)
  const triggered = alerts.filter(a => a.triggered)

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Price Alerts</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>Get notified when stocks hit your target prices</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={checkNow} disabled={checking} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600, cursor: 'pointer', boxShadow: 'var(--sh)' }}>
            {checking ? <LoadingSpinner size={13} /> : <IconCheck size={13} />} Check Now
          </button>
          <button onClick={() => setAddOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <IconPlus size={13} /> New Alert
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size={32} /></div>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Active ({active.length})</h2>
            {active.length === 0 ? (
              <div className="card text-center py-8">
                <p style={{ color: 'var(--text2)' }}>No active alerts. Create one to get notified when prices hit your targets.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {active.map(a => (
                  <div key={a.id} className="card flex items-center gap-4">
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(240,169,64,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <IconBell size={18} style={{ color: 'var(--amber)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>{a.ticker}</span>
                        <span style={{ fontSize: 12, color: 'var(--text2)', textTransform: 'capitalize' }}>{a.type}</span>
                        {a.price && <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: 'var(--amber)' }}>{fmtCurrency(a.price)}</span>}
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text2)' }}>Created {timeAgo(a.created_at)}</p>
                    </div>
                    <button onClick={() => remove(a.id)} style={{ color: 'var(--text2)', padding: 4 }}><IconTrash size={16} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {triggered.length > 0 && (
            <div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Triggered ({triggered.length})</h2>
              <div className="space-y-2">
                {triggered.map(a => (
                  <div key={a.id} className="card flex items-center gap-4" style={{ opacity: 0.6 }}>
                    <IconCheck size={18} style={{ color: 'var(--green)' }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>{a.ticker}</span>
                      <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 8 }}>{a.type} {a.price ? fmtCurrency(a.price) : ''} — triggered</span>
                    </div>
                    <button onClick={() => remove(a.id)} style={{ color: 'var(--text2)', padding: 4 }}><IconTrash size={16} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New Alert">
        <form onSubmit={add} className="space-y-4">
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Ticker</label>
            <input value={form.ticker} onChange={e => setForm(p => ({ ...p, ticker: e.target.value.toUpperCase() }))} placeholder="AAPL" required
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Alert Type</label>
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}
            >
              <option value="above">Price above</option>
              <option value="below">Price below</option>
              <option value="signal">Signal change</option>
            </select>
          </div>
          {form.type !== 'signal' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Target Price</label>
              <input type="number" step="any" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="150.00" required
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
              />
            </div>
          )}
          <button type="submit" style={{ width: '100%', background: 'var(--primary)', color: 'white', padding: '10px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
            Create Alert
          </button>
        </form>
      </Modal>
    </div>
  )
}
