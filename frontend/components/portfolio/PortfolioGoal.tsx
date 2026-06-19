'use client'
import { useState, useEffect } from 'react'
import { IconTarget, IconEdit, IconX, IconTrophy, IconFlame } from '@tabler/icons-react'
import { Modal } from '@/components/shared/Modal'

interface Goal {
  targetPct: number
  startValue: number
  startDate: string
  endDate: string
  label: string
}

interface Props {
  currentValue: number
  userId: string | null
}

function storageKey(uid: string) {
  return `portfolio_goal_${uid}`
}

export function PortfolioGoal({ currentValue, userId }: Props) {
  const [goal, setGoal] = useState<Goal | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState({ targetPct: '100', months: '12', label: 'Double my portfolio' })

  useEffect(() => {
    if (!userId) return
    const saved = localStorage.getItem(storageKey(userId))
    if (saved) setGoal(JSON.parse(saved))
  }, [userId])

  function saveGoal() {
    if (!userId || currentValue <= 0) return
    const targetPct = parseFloat(form.targetPct)
    const months = parseInt(form.months)
    const startDate = new Date().toISOString()
    const endDate = new Date(Date.now() + months * 30.44 * 86400000).toISOString()
    const newGoal: Goal = { targetPct, startValue: currentValue, startDate, endDate, label: form.label }
    localStorage.setItem(storageKey(userId), JSON.stringify(newGoal))
    setGoal(newGoal)
    setEditOpen(false)
  }

  function clearGoal() {
    if (!userId) return
    localStorage.removeItem(storageKey(userId))
    setGoal(null)
  }

  const now = Date.now()

  if (!goal) {
    return (
      <>
        <button
          onClick={() => setEditOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--surface)', border: '1px dashed var(--border)',
            borderRadius: 12, padding: '14px 18px', cursor: 'pointer',
            color: 'var(--text2)', fontSize: 13, width: '100%',
            fontFamily: 'DM Mono, monospace', transition: 'border-color 0.2s, color 0.2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)' }}
        >
          <IconTarget size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          Set a portfolio goal — track your progress over time
        </button>
        <GoalModal open={editOpen} onClose={() => setEditOpen(false)} form={form} setForm={setForm} onSave={saveGoal} isNew />
      </>
    )
  }

  const gainPct = goal.startValue > 0 ? ((currentValue - goal.startValue) / goal.startValue) * 100 : 0
  const progress = Math.min(Math.max((gainPct / goal.targetPct) * 100, 0), 100)
  const totalMs = new Date(goal.endDate).getTime() - new Date(goal.startDate).getTime()
  const elapsedMs = now - new Date(goal.startDate).getTime()
  const daysLeft = Math.max(0, Math.ceil((new Date(goal.endDate).getTime() - now) / 86400000))
  const totalDays = Math.ceil(totalMs / 86400000)
  const daysElapsed = totalDays - daysLeft
  const timeProgress = Math.min((elapsedMs / totalMs) * 100, 100)
  const isAhead = progress >= timeProgress
  const isDone = gainPct >= goal.targetPct
  const isExpired = now > new Date(goal.endDate).getTime() && !isDone

  const endDateFormatted = new Date(goal.endDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <>
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isDone
              ? <IconTrophy size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
              : <IconTarget size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
            <div>
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, margin: 0 }}>
                {goal.label}
              </p>
              <p style={{ color: 'var(--text2)', fontSize: 11, margin: 0, marginTop: 1 }}>
                {isDone ? 'Goal reached!' : isExpired ? 'Time expired' : `${daysLeft} days left · due ${endDateFormatted}`}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => { setForm({ targetPct: String(goal.targetPct), months: String(Math.round(totalDays / 30.44)), label: goal.label }); setEditOpen(true) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text2)', lineHeight: 0 }}
            >
              <IconEdit size={14} />
            </button>
            <button
              onClick={clearGoal}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text2)', lineHeight: 0 }}
            >
              <IconX size={14} />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'baseline' }}>
            <span style={{ fontSize: 22, fontFamily: 'Syne, sans-serif', fontWeight: 800, color: isDone ? 'var(--amber)' : gainPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
            </span>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              target: +{goal.targetPct}%
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
            {/* Time elapsed indicator */}
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: 0,
              width: `${timeProgress}%`,
              background: 'rgba(255,255,255,0.05)',
              borderRight: '1px dashed var(--border)',
            }} />
            {/* Gain progress */}
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: isDone ? 'var(--amber)' : isAhead ? 'var(--green)' : 'var(--accent)',
              borderRadius: 4,
              transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <span style={{ fontSize: 10, color: 'var(--text2)' }}>
              {progress.toFixed(0)}% of goal
            </span>
            <span style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 3, color: isAhead ? 'var(--green)' : isExpired ? 'var(--red)' : 'var(--amber)' }}>
              {!isDone && !isExpired && <IconFlame size={10} />}
              {isDone ? 'Target hit!' : isExpired ? 'Missed' : isAhead ? `${daysElapsed}d in, ahead of pace` : `${daysElapsed}d in, behind pace`}
            </span>
          </div>
        </div>

        {/* Mini stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
          {[
            { label: 'Gain since set', value: `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%` },
            { label: 'Still needed', value: isDone ? '✓ Done' : `+${Math.max(0, goal.targetPct - gainPct).toFixed(1)}%` },
            { label: 'Time used', value: `${timeProgress.toFixed(0)}%` },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
              <p style={{ fontSize: 10, color: 'var(--text2)', margin: '0 0 2px', fontFamily: 'Syne, sans-serif' }}>{s.label}</p>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0, fontFamily: 'Syne, sans-serif' }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      <GoalModal open={editOpen} onClose={() => setEditOpen(false)} form={form} setForm={setForm} onSave={saveGoal} />
    </>
  )
}

function GoalModal({ open, onClose, form, setForm, onSave, isNew }: {
  open: boolean; onClose: () => void
  form: { targetPct: string; months: string; label: string }
  setForm: (f: any) => void
  onSave: () => void
  isNew?: boolean
}) {
  const presets = [
    { label: '+50% in 6mo', targetPct: '50', months: '6' },
    { label: '2× in 12mo', targetPct: '100', months: '12' },
    { label: '3× in 3yr', targetPct: '200', months: '36' },
  ]

  return (
    <Modal open={open} onClose={onClose} title={isNew ? 'Set Portfolio Goal' : 'Edit Goal'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => setForm((f: any) => ({ ...f, targetPct: p.targetPct, months: p.months, label: p.label === '2× in 12mo' ? 'Double my portfolio' : p.label === '+50% in 6mo' ? 'Grow 50% in 6 months' : 'Triple my portfolio' }))}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 11,
                background: form.targetPct === p.targetPct && form.months === p.months ? 'rgba(91,106,255,0.2)' : 'var(--surface2)',
                border: form.targetPct === p.targetPct && form.months === p.months ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: form.targetPct === p.targetPct && form.months === p.months ? 'var(--accent2)' : 'var(--text)',
                fontFamily: 'DM Mono, monospace',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Goal name</label>
          <input
            value={form.label}
            onChange={e => setForm((f: any) => ({ ...f, label: e.target.value }))}
            placeholder="Double my portfolio"
            style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Target gain (%)</label>
            <input
              type="number"
              value={form.targetPct}
              onChange={e => setForm((f: any) => ({ ...f, targetPct: e.target.value }))}
              min="1"
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', marginBottom: 4 }}>Timeframe (months)</label>
            <input
              type="number"
              value={form.months}
              onChange={e => setForm((f: any) => ({ ...f, months: e.target.value }))}
              min="1"
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
            />
          </div>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text2)', margin: 0 }}>
          Progress is tracked from today's portfolio value. You can update the goal at any time.
        </p>

        <button
          onClick={onSave}
          style={{ background: 'var(--accent)', color: 'white', padding: '10px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >
          {isNew ? 'Set Goal' : 'Update Goal'}
        </button>
      </div>
    </Modal>
  )
}
