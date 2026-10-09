'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconPlus, IconCheck, IconTrophy } from '@tabler/icons-react'
import { toast } from 'sonner'

const supabase = createClient()
const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })
const dateFormat = new Intl.DateTimeFormat('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' })

const GOAL_COLORS = ['#5B7CF0','#14B8A6','#22C55E','#F59E0B','#EF4444','#A855F7','#F97316','#0EA5E9']
function goalColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return GOAL_COLORS[h % GOAL_COLORS.length]
}

interface Goal {
  id: string; name: string; target_amount: number; current_amount: number
  monthly_contribution: number | null; target_date: string | null
  owner: string; status: string
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', target_amount: '', monthly_contribution: '', target_date: '', owner: 'joint' })
  const [contributing, setContributing] = useState<string | null>(null)
  const [contribAmount, setContribAmount] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('fin_goals').select('*').order('created_at')
    if (error) toast.error(error.message)
    else setGoals(data || [])
    setLoading(false)
  }

  async function addGoal(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.target_amount) return
    setSaving(true)
    const { error } = await supabase.from('fin_goals').insert({
      name: form.name.trim(),
      target_amount: Number(form.target_amount),
      monthly_contribution: form.monthly_contribution ? Number(form.monthly_contribution) : null,
      target_date: form.target_date || null,
      owner: form.owner,
    })
    if (error) { toast.error(error.message) }
    else { toast.success('Goal created!'); setForm({ name: '', target_amount: '', monthly_contribution: '', target_date: '', owner: 'joint' }); setShowAdd(false); await load() }
    setSaving(false)
  }

  async function addContribution(goalId: string) {
    const amount = parseFloat(contribAmount)
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    const { error } = await supabase.from('fin_goal_contributions').insert({ goal_id: goalId, amount })
    if (error) { toast.error(error.message) }
    else { toast.success('Contribution added!'); setContributing(null); setContribAmount(''); await load() }
    setSaving(false)
  }

  async function updateStatus(goalId: string, status: string) {
    const { error } = await supabase.from('fin_goals').update({ status }).eq('id', goalId)
    if (error) { toast.error(error.message); return }
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, status } : g))
  }

  function monthsRemaining(g: Goal) {
    if (!g.target_date) return null
    const months = Math.ceil((new Date(g.target_date).getTime() - Date.now()) / (30.44 * 24 * 3600 * 1000))
    return Math.max(0, months)
  }

  const activeGoals = goals.filter(g => g.status === 'active')
  const otherGoals = goals.filter(g => g.status !== 'active')

  function renderGoal(g: Goal) {
    const pct = Math.min((g.current_amount / g.target_amount) * 100, 100)
    const color = goalColor(g.name)
    const months = monthsRemaining(g)
    const remaining = g.target_amount - g.current_amount
    const isComplete = g.current_amount >= g.target_amount

    return (
      <div key={g.id} className="card" style={{ padding: 20, opacity: g.status === 'paused' ? 0.65 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isComplete ? <IconTrophy size={18} color="white" /> : <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 13, color: 'white' }}>{g.name.slice(0, 2).toUpperCase()}</span>}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15 }}>{g.name}</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
              {g.owner !== 'joint' && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>{g.owner}</span>}
              {g.status === 'paused' && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'rgba(245,158,11,0.15)', color: 'var(--amber)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>Paused</span>}
              {isComplete && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'rgba(34,197,94,0.15)', color: 'var(--green)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>Complete!</span>}
            </div>
          </div>
          <select value={g.status} onChange={e => updateStatus(g.id, e.target.value)}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer' }}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color }}>
              {currency.format(g.current_amount)}
            </span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: 'var(--text2)' }}>
              of {currency.format(g.target_amount)}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--surface2)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.5s' }} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{pct.toFixed(1)}% · {currency.format(remaining)} to go</p>
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          {g.monthly_contribution && <div><p style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Monthly</p><p style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600 }}>{currency.format(g.monthly_contribution)}</p></div>}
          {g.target_date && <div><p style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Target</p><p style={{ fontSize: 12, fontWeight: 600 }}>{dateFormat.format(new Date(g.target_date))}{months !== null ? <span style={{ color: 'var(--text2)', fontWeight: 400 }}> ({months}mo)</span> : ''}</p></div>}
        </div>

        {/* Contribute */}
        {g.status === 'active' && !isComplete && (
          contributing === g.id ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input autoFocus type="number" min="0" step="0.01" value={contribAmount} onChange={e => setContribAmount(e.target.value)} placeholder="Amount"
                style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--primary)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
              <button onClick={() => addContribution(g.id)} disabled={saving}
                style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                Add
              </button>
              <button onClick={() => setContributing(null)} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => { setContributing(g.id); setContribAmount('') }}
              style={{ width: '100%', padding: '9px', borderRadius: 8, background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              + Add Contribution
            </button>
          )
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Goals</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Track savings targets and milestones</p>
        </div>
        <button onClick={() => setShowAdd(s => !s)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <IconPlus size={14} /> New Goal
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addGoal} className="card" style={{ marginBottom: 24, padding: 20 }}>
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 16 }}>New Goal</p>
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12 }}>
            {[
              { label: 'Goal Name', el: <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Emergency Fund" style={inp} /> },
              { label: 'Target Amount (NZD)', el: <input required type="number" min="1" step="0.01" value={form.target_amount} onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))} placeholder="0.00" style={inp} /> },
              { label: 'Monthly Contribution', el: <input type="number" min="0" step="0.01" value={form.monthly_contribution} onChange={e => setForm(f => ({ ...f, monthly_contribution: e.target.value }))} placeholder="Optional" style={inp} /> },
              { label: 'Target Date', el: <input type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} style={inp} /> },
              { label: 'Owner', el: <select value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} style={inp}><option value="joint">Joint</option><option value="me">Me</option><option value="partner">Partner</option></select> },
            ].map(({ label, el }) => (
              <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
                {el}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="submit" disabled={saving} style={{ padding: '9px 20px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              {saving ? 'Creating…' : 'Create Goal'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><LoadingSpinner size={28} /></div> : (
        goals.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <IconTrophy size={36} style={{ color: 'var(--text3)', marginBottom: 12 }} />
            <p style={{ color: 'var(--text2)', fontSize: 14 }}>No goals yet. Create your first savings goal above.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {activeGoals.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
                {activeGoals.map(renderGoal)}
              </div>
            )}
            {otherGoals.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12, fontFamily: 'Syne, sans-serif' }}>Completed / Paused</p>
                <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
                  {otherGoals.map(renderGoal)}
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

const inp: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%',
}
