'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { SnapshotHistory } from '@/components/shared/SnapshotHistory'
import { projectRange, EMPLOYEE_RATES, FUND_RETURNS, RANGE_SPREAD, GOVT_MTC_MAX, GOVT_MTC_FULL_AT, DEFAULT_INFLATION, type ProjectionPoint, type ProjectionInput } from '@/lib/kiwisaver'
import { WhatIf } from '@/components/kiwisaver/WhatIf'
import { SalaryCalculator } from '@/components/kiwisaver/SalaryCalculator'
import { toast } from 'sonner'
import { IconPigMoney, IconEdit, IconCheck, IconX, IconTrendingUp, IconCalendar, IconTarget, IconCoin, IconRefresh } from '@tabler/icons-react'

// Rules and the projection maths live in lib/kiwisaver.ts (tested separately).
const PROVIDERS = [
  'Simplicity', 'Fisher Funds', 'Milford', 'SuperLife', 'ANZ',
  'ASB', 'BNZ', 'Westpac', 'Booster', 'Generate', 'Kernel', 'Other',
]
// Default rate rose from 3% to 3.5% on 1 Apr 2026 (4% from 1 Apr 2028). 3% remains available as a temporary reduction.
// (EMPLOYEE_RATES and the per-fund return guides live in lib/kiwisaver.ts so the what-if shares them.)
const FUND_COLORS: Record<string, string> = { conservative: '#6366f1', balanced: '#0ea5e9', growth: '#10b981', aggressive: '#f59e0b' }
const FUND_TYPES: Record<string, { label: string; defaultReturn: number; color: string }> = Object.fromEntries(
  Object.entries(FUND_RETURNS).map(([k, v]) => [k, { ...v, color: FUND_COLORS[k] }])
)

function fmt(n: number) {
  return n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
}
function fmtAge(dob: string, targetAge: number): string {
  const birth = new Date(dob)
  const retire = new Date(birth.getFullYear() + targetAge, birth.getMonth(), birth.getDate())
  const now = new Date()
  const months = (retire.getFullYear() - now.getFullYear()) * 12 + (retire.getMonth() - now.getMonth())
  if (months <= 0) return 'Retirement age reached'
  const y = Math.floor(months / 12)
  const m = months % 12
  return y > 0 ? `${y}y ${m}m` : `${m} months`
}
// ── SVG line chart ────────────────────────────────────────────────────────────
function ProjectionChart({ points, color, band }: { points: ProjectionPoint[]; color: string; band?: { low: ProjectionPoint[]; high: ProjectionPoint[] } }) {
  if (points.length < 2) return null
  const W = 560, H = 180, PAD = { t: 12, r: 16, b: 32, l: 56 }
  // The band's three series share the same months, so it lines up index for index.
  const bandOk = !!band && band.low.length === points.length && band.high.length === points.length
  const maxBal = Math.max(...points.map(p => p.balance), ...(bandOk ? band!.high.map(p => p.balance) : []))
  const minBal = 0
  // Space points by elapsed time, so a part-year at the end isn't drawn as a full year.
  const span = points[points.length - 1].months || 1
  const cx = (i: number) => PAD.l + (points[i].months / span) * (W - PAD.l - PAD.r)
  const cy = (b: number) => H - PAD.b - ((b - minBal) / (maxBal - minBal || 1)) * (H - PAD.t - PAD.b)

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${cy(p.balance).toFixed(1)}`).join(' ')
  const fill = [...points.map((p, i) => `${cx(i).toFixed(1)},${cy(p.balance).toFixed(1)}`), `${cx(points.length - 1).toFixed(1)},${(H - PAD.b).toFixed(1)}`, `${cx(0).toFixed(1)},${(H - PAD.b).toFixed(1)}`].join(' ')

  const milestones = [100000, 250000, 500000, 1000000]
  const yLabels = milestones.filter(m => m <= maxBal * 1.05)

  // Show every N-th year label
  const step = points.length > 15 ? 5 : points.length > 8 ? 3 : 1

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="ks-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Y gridlines */}
      {yLabels.map(m => (
        <g key={m}>
          <line x1={PAD.l} x2={W - PAD.r} y1={cy(m)} y2={cy(m)} stroke="var(--border)" strokeWidth="1" strokeDasharray="3,4" />
          <text x={PAD.l - 6} y={cy(m) + 4} textAnchor="end" fontSize="9" fill="var(--text3)">${m >= 1000000 ? '1M' : m >= 1000 ? `${m / 1000}k` : m}</text>
        </g>
      ))}
      {/* Range: results if returns run a couple of points lower / higher */}
      {bandOk && (
        <>
          <polygon
            points={[...band!.high.map((p, i) => `${cx(i).toFixed(1)},${cy(p.balance).toFixed(1)}`), ...band!.low.map((p, i) => `${cx(i).toFixed(1)},${cy(p.balance).toFixed(1)}`).reverse()].join(' ')}
            fill={color} fillOpacity="0.1"
          />
          <path d={band!.high.map((p, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${cy(p.balance).toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="4,4" />
          <path d={band!.low.map((p, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${cy(p.balance).toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="4,4" />
        </>
      )}
      {/* Fill */}
      <polygon points={fill} fill="url(#ks-grad)" />
      {/* Line */}
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* X labels */}
      {points.map((p, i) => ({ p, i })).filter(({ p, i }) => {
        if (i === points.length - 1) return true
        if (i % step !== 0) return false
        // Don't draw a label that would collide with the final one.
        return p.year !== points[points.length - 1].year && (points[points.length - 1].months - p.months) >= 6
      }).map(({ p, i }) => (
        <text key={`${p.year}-${i}`} x={cx(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--text3)">{p.year}</text>
      ))}
      {/* Final dot */}
      <circle cx={cx(points.length - 1)} cy={cy(points[points.length - 1].balance)} r="4" fill={color} />
    </svg>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function KiwiSaverPage() {
  const supabase = createClient()
  const [settings, setSettings] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasCreds, setHasCreds] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [historyKey, setHistoryKey] = useState(0) // bumped after each sync to reload the history chart
  const [real, setReal] = useState(true) // show projections in today's money rather than future dollars

  // Fields Akahu owns once an account is linked; the form must not write them back.
  const AKAHU_OWNED = ['provider', 'current_balance', 'akahu_account_id', 'akahu_returns', 'pir', 'akahu_synced_at']
  const isSynced = !!settings?.akahu_account_id

  async function loadSettings(openFormIfEmpty = true) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase.from('fin_kiwisaver').select('*').eq('user_id', user.id).maybeSingle()
    if (data) {
      setSettings(data)
      setForm(data)
    } else {
      const defaults = {
        provider: '', fund_type: 'balanced', current_balance: 0,
        retirement_age: 65, annual_salary: 0,
        employee_rate: 3.5, employer_rate: 3.5, voluntary_monthly: 0,
        expected_return: 5.5,
      }
      setSettings(null)
      setForm(defaults)
      if (openFormIfEmpty) setEditing(true) // first time — open settings immediately
    }
    return data
  }

  async function syncFromAkahu(manual: boolean) {
    setSyncing(true)
    try {
      await api.syncAkahu()
      await loadSettings(false)
      setHistoryKey(k => k + 1)
      if (manual) toast.success('KiwiSaver synced from Akahu')
    } catch (e: any) {
      if (manual) toast.error(e.message)
    }
    setSyncing(false)
  }

  useEffect(() => {
    async function load() {
      const data = await loadSettings()
      const { data: creds } = await supabase.from('akahu_credentials').select('user_id').maybeSingle()
      setHasCreds(!!creds)
      setLoading(false)
      // Keep the balance fresh: sync automatically when Akahu is connected and the
      // balance is more than 6 hours old (or has never been synced).
      const last = data?.akahu_synced_at ? new Date(data.akahu_synced_at).getTime() : 0
      if (creds && Date.now() - last > 6 * 60 * 60 * 1000) syncFromAkahu(false)
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('You are signed out. Sign in again to save.')
      const editable = isSynced
        ? Object.fromEntries(Object.entries(form).filter(([k]) => !AKAHU_OWNED.includes(k)))
        : form
      const payload = { ...editable, user_id: user.id, last_updated: new Date().toISOString() }
      const { data, error } = await supabase.from('fin_kiwisaver').upsert(payload, { onConflict: 'user_id' }).select().single()
      if (error || !data) throw new Error(error?.message ?? 'Could not save')
      setSettings(data)
      setForm(data)
      setEditing(false)
    } catch (e: any) {
      // Keep the form open so nothing the user typed is lost.
      toast.error(`Could not save: ${e.message}`)
    }
    setSaving(false)
  }

  // From the salary calculator. With the settings form open (or nothing saved yet),
  // fill the form so the user's other unsaved edits aren't overwritten; otherwise save it.
  async function applyCalculatedSalary(salary: number) {
    setForm((f: any) => ({ ...f, annual_salary: salary }))
    if (editing || !settings) {
      if (!editing) setEditing(true)
      toast.success('Salary filled in. Save your details to update the projection.')
      return
    }
    const { data, error } = await supabase.from('fin_kiwisaver')
      .update({ annual_salary: salary, last_updated: new Date().toISOString() })
      .eq('user_id', settings.user_id).select().single()
    if (error || !data) {
      toast.error(`Could not save: ${error?.message ?? 'unknown error'}`)
      return
    }
    setSettings(data)
    setForm(data)
    toast.success('Projection updated with your new salary')
  }

  const num = (v: any, fallback: number) => (v == null || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v))
  const projectionInput: ProjectionInput | null = useMemo(() => settings ? {
    dob: settings.date_of_birth,
    retirementAge: num(settings.retirement_age, 65),
    annualSalary: num(settings.annual_salary, 0),
    employeeRate: num(settings.employee_rate, 3.5),
    employerRate: num(settings.employer_rate, 3.5),
    voluntaryMonthly: num(settings.voluntary_monthly, 0),
    expectedReturn: num(settings.expected_return, 5.5),
    currentBalance: num(settings.current_balance, 0),
    inflation: real ? DEFAULT_INFLATION : null,
  } : null, [settings, real])
  const range = useMemo(() => (projectionInput ? projectRange(projectionInput) : null), [projectionInput])
  const model = range?.expected ?? null
  const projection = model?.points ?? []
  const projected = model?.finalBalance ?? 0
  const contrib = model?.contributions ?? null
  const needsDetails = !!settings && !model
  const fundColor = FUND_TYPES[settings?.fund_type]?.color ?? '#0ea5e9'

  const milestones = [
    { label: '$100k', value: 100000 },
    { label: '$250k', value: 250000 },
    { label: '$500k', value: 500000 },
    { label: '$1M',   value: 1000000 },
  ]

  if (loading) return <div style={{ padding: 32, color: 'var(--text3)' }}>Loading…</div>

  return (
    <div style={{ padding: '28px 32px', maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, sans-serif', color: 'var(--text)', margin: 0 }}>KiwiSaver</h1>
          {settings?.provider && <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>{settings.provider} · {FUND_TYPES[settings.fund_type]?.label ?? settings.fund_type} fund</p>}
          {isSynced && (
            <p style={{ fontSize: 11, color: 'var(--green)', marginTop: 3, fontWeight: 600 }}>
              ● Balance synced via Akahu{settings.akahu_synced_at ? ` · ${new Date(settings.akahu_synced_at).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasCreds && (
            <button
              onClick={() => syncFromAkahu(true)}
              disabled={syncing}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--primary-light)', border: '1px solid var(--primary)', color: 'var(--primary)', fontWeight: 700, fontSize: 13, cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.7 : 1 }}
            >
              <IconRefresh size={15} /> {syncing ? 'Syncing…' : 'Sync'}
            </button>
          )}
          <button
            onClick={() => editing ? save() : setEditing(true)}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: editing ? 'var(--primary)' : 'var(--surface2)', border: '1px solid var(--border)', color: editing ? 'white' : 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            {editing ? <><IconCheck size={15} /> {saving ? 'Saving…' : 'Save'}</> : <><IconEdit size={15} /> Edit</>}
          </button>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px', marginBottom: 22 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Your KiwiSaver details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Provider */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Provider</label>
              <select value={form.provider || ''} onChange={e => setForm((f: any) => ({ ...f, provider: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}>
                <option value="">Select provider</option>
                {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {/* Fund type */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Fund type</label>
              <select value={form.fund_type || 'balanced'} onChange={e => {
                const ft = e.target.value
                setForm((f: any) => ({ ...f, fund_type: ft, expected_return: FUND_TYPES[ft]?.defaultReturn ?? f.expected_return }))
              }} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}>
                {Object.entries(FUND_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {/* Current balance */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Current balance (NZD)</label>
              <input type="number" value={form.current_balance || ''} disabled={isSynced} onChange={e => setForm((f: any) => ({ ...f, current_balance: Number(e.target.value) }))} placeholder="0" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, opacity: isSynced ? 0.6 : 1 }} />
              {isSynced && <span style={{ fontSize: 10, color: 'var(--text3)' }}>Kept up to date from your provider via Akahu</span>}
            </div>
            {/* Annual salary */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Annual salary (NZD)</label>
              <input type="number" value={form.annual_salary || ''} onChange={e => setForm((f: any) => ({ ...f, annual_salary: Number(e.target.value) }))} placeholder="0" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} />
            </div>
            {/* Date of birth */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Date of birth</label>
              <input type="date" value={form.date_of_birth || ''} onChange={e => setForm((f: any) => ({ ...f, date_of_birth: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} />
            </div>
            {/* Retirement age */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Target retirement age</label>
              <input type="number" value={form.retirement_age || 65} onChange={e => setForm((f: any) => ({ ...f, retirement_age: Number(e.target.value) }))} min={55} max={75} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} />
            </div>
            {/* Employee rate */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Employee contribution</label>
              <select value={form.employee_rate || 3.5} onChange={e => setForm((f: any) => ({ ...f, employee_rate: Number(e.target.value) }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}>
                {EMPLOYEE_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            {/* Employer rate */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Employer contribution</label>
              <input type="number" value={form.employer_rate || 3.5} onChange={e => setForm((f: any) => ({ ...f, employer_rate: Number(e.target.value) }))} min={3} step={0.5} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} />
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>Default minimum is 3.5% from 1 Apr 2026 — check your employment agreement</span>
            </div>
            {/* Voluntary top-up */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Voluntary top-up / month</label>
              <input type="number" value={form.voluntary_monthly || ''} onChange={e => setForm((f: any) => ({ ...f, voluntary_monthly: Number(e.target.value) }))} placeholder="0" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} />
            </div>
            {/* Expected return */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Expected annual return (%)</label>
              <input type="number" value={form.expected_return || 5.5} onChange={e => setForm((f: any) => ({ ...f, expected_return: Number(e.target.value) }))} step={0.5} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} />
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>After fees and tax. Balanced ≈ 5.5%, growth ≈ 7% are rough long-run guides, not promises.</span>
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <SalaryCalculator
          defaultKiwiSaverRate={num(settings?.employee_rate ?? form.employee_rate, 3.5)}
          employerRate={num(settings?.employer_rate ?? form.employer_rate, 3.5)}
          currentSalary={editing || !settings ? num(form.annual_salary, 0) || null : num(settings.annual_salary, 0) || null}
          onUseSalary={applyCalculatedSalary}
        />
      )}

      {settings && (
        <>
          {/* Akahu supplies the balance but not age or pay, so ask for the two things the projection needs. */}
          {needsDetails && !editing && (
            <div style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Add two details to see your retirement projection</p>
              <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 14 }}>
                Your provider shares your balance, but not your age or pay. These are saved to your account only and used to work out your projection.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Date of birth</label>
                  <input type="date" value={form.date_of_birth || ''} onChange={e => setForm((f: any) => ({ ...f, date_of_birth: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Annual salary before tax (NZD)</label>
                  <input type="number" min={0} value={form.annual_salary || ''} onChange={e => setForm((f: any) => ({ ...f, annual_salary: Number(e.target.value) }))} placeholder="e.g. 70000" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }} />
                </div>
              </div>
              <button
                onClick={save}
                disabled={saving || !form.date_of_birth || !(Number(form.annual_salary) > 0)}
                style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--primary)', border: 'none', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving || !form.date_of_birth || !(Number(form.annual_salary) > 0) ? 0.5 : 1 }}
              >
                {saving ? 'Saving…' : 'Show my projection'}
              </button>
              {isSynced && (
                <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
                  Assuming a {FUND_TYPES[settings.fund_type]?.label ?? 'Balanced'} fund at {settings.expected_return}% a year, because your provider doesn&apos;t tell us which fund you&apos;re in. Use Edit to change it.
                </p>
              )}
            </div>
          )}

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            {/* Current balance */}
            <div style={{ background: fundColor, borderRadius: 14, padding: '18px 20px', color: 'white' }}>
              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Current Balance</div>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{fmt(settings.current_balance)}</div>
              <div style={{ fontSize: 10, opacity: 0.75, marginTop: 4 }}>{FUND_TYPES[settings.fund_type]?.label} · {settings.expected_return}% p.a.</div>
              {settings.akahu_returns != null && (
                <div style={{ fontSize: 11, opacity: 0.9, marginTop: 6, fontWeight: 600 }}>
                  {Number(settings.akahu_returns) >= 0 ? '+' : ''}{fmt(Number(settings.akahu_returns))} returns to date
                </div>
              )}
              {settings.pir != null && (
                <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>PIR {Number(settings.pir)}%</div>
              )}
            </div>
            {/* Projected at retirement */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Projected at {settings.retirement_age}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{model ? fmt(projected) : '—'}</div>
              {model
                ? <>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{fmtAge(settings.date_of_birth, settings.retirement_age)} away · {real ? "today's money" : 'future dollars'}</div>
                    {range && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Range {fmt(range.low.finalBalance)} – {fmt(range.high.finalBalance)}</div>}
                  </>
                : <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>needs date of birth and salary</div>}
            </div>
            {/* Monthly contributions */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Monthly Into KiwiSaver</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{contrib ? fmt(contrib.total) : '—'}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                {contrib ? (contrib.govt > 0 ? `incl. govt contribution ~${fmt(contrib.govt)}/mo` : 'no govt contribution applies') : 'needs date of birth and salary'}
              </div>
            </div>
          </div>

          <SnapshotHistory kind="kiwisaver" title="KiwiSaver balance history" valueLabel="Balance" investedLabel="Balance less returns" refreshKey={historyKey} />

          {/* Contribution breakdown */}
          {contrib && model && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Monthly contribution breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: `You (${settings.employee_rate}%)`, amount: contrib.employee, color: fundColor },
                  { label: `Employer (${settings.employer_rate}%, after tax)`, amount: contrib.employerNet, color: '#10b981' },
                  ...(contrib.govt > 0 ? [{ label: 'Govt contribution', amount: contrib.govt, color: '#f59e0b' }] : []),
                  ...(contrib.voluntary > 0 ? [{ label: 'Voluntary top-up', amount: contrib.voluntary, color: '#8b5cf6' }] : []),
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>{row.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{fmt(row.amount)}</span>
                    <div style={{ width: 120, height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (row.amount / contrib.total) * 100)}%`, background: row.color, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Total</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{fmt(contrib.total)}/mo</span>
                </div>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, marginTop: 10 }}>
                Your employer pays {fmt(contrib.employerGross)}/mo, but {parseFloat((contrib.esctRate * 100).toFixed(1))}% of it goes in tax (employer superannuation contribution tax) before reaching your account, so {fmt(contrib.employerNet)} arrives.
              </p>
              {model.govtShortfallAnnual > 1 && (
                <p style={{ fontSize: 11, color: 'var(--amber)', lineHeight: 1.6, marginTop: 6 }}>
                  You&apos;re missing out on about {fmt(model.govtShortfallAnnual)} a year of government money. Your own contributions are {fmt(model.memberAnnual)}/yr; reaching {fmt(GOVT_MTC_FULL_AT)}/yr gets the full {fmt(GOVT_MTC_MAX)}.
                </p>
              )}
            </div>
          )}

          {/* Projection chart */}
          {projection.length > 1 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Projected growth</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>at {settings.expected_return}% p.a.{real ? `, ${DEFAULT_INFLATION}% inflation` : ''}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {([[true, 'Today’s money'], [false, 'Future dollars']] as [boolean, string][]).map(([v, label]) => (
                      <button key={label} onClick={() => setReal(v)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: real === v ? 'var(--primary-light)' : 'transparent', color: real === v ? 'var(--primary)' : 'var(--text2)' }}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <ProjectionChart points={projection} color={fundColor} band={range ? { low: range.low.points, high: range.high.points } : undefined} />
              {range && (
                <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
                  The shaded area shows the result if returns average {RANGE_SPREAD}% a year lower or higher than assumed: {fmt(range.low.finalBalance)} to {fmt(range.high.finalBalance)} at {settings.retirement_age}.
                </p>
              )}
            </div>
          )}

          {/* Try changes (nothing is saved) */}
          {projectionInput && projection.length > 1 && <WhatIf base={projectionInput} real={real} />}

          {/* Milestones */}
          {projection.length > 1 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Milestones</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                {milestones.map(({ label, value }) => {
                  const hit = projection.find(p => p.balance >= value)
                  const reached = Number(settings.current_balance) >= value
                  return (
                    <div key={label} style={{ borderRadius: 10, padding: '12px 14px', background: reached ? fundColor : 'var(--surface2)', border: `1px solid ${reached ? fundColor : 'var(--border)'}` }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: reached ? 'white' : 'var(--text)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{label}</div>
                      {reached ? (
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', marginTop: 3 }}>Already reached ✓</div>
                      ) : hit ? (
                        <>
                          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>{hit.year}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>age {hit.age}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>Beyond projection</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Govt MTC note */}
          <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text2)' }}>Government contribution:</strong> The government adds 25c for every $1 you put in (your own contributions, not your employer’s), up to a max of $260.72/year since 1 July 2025. You get the maximum by contributing at least $1,042.86/year. It isn’t paid if you earn over $180,000 or are 65 or older, and the projection follows those rules.
            <br /><br />
            <strong style={{ color: 'var(--text2)' }}>About the projection:</strong> it&apos;s an estimate, not a forecast. It assumes your pay, contribution rates and return stay the same. &quot;Today’s money&quot; takes off {DEFAULT_INFLATION}% a year for inflation and assumes your pay rises with it. Enter an expected return after fees and tax (PIR); real returns vary year to year and can be negative.
          </div>
        </>
      )}

      {!settings && !editing && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
          <IconPigMoney size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p>Add your KiwiSaver details above to see your retirement projection.</p>
        </div>
      )}
    </div>
  )
}
