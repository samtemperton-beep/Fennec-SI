'use client'
import { useMemo, useState } from 'react'
import { IconAdjustmentsHorizontal, IconRefresh } from '@tabler/icons-react'
import {
  EMPLOYEE_RATES, FUND_RETURNS, GOVT_MTC_MAX_AGE, RANGE_SPREAD,
  projectKiwiSaver, projectRange, withScenario,
  type ProjectionInput, type Scenario,
} from '@/lib/kiwisaver'

// "What if I..." explorer. Nothing here is saved: it re-runs the same projection
// with a few inputs changed, so the effect of each choice is visible.

const nzd = (n: number) => Math.round(n).toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${nzd(Math.abs(n))}`

export interface WhatIfState {
  voluntary: number | null // $/month; null = unchanged
  employeeRate: number | null
  fund: string | null
  retirementAge: number | null
}
const UNCHANGED: WhatIfState = { voluntary: null, employeeRate: null, fund: null, retirementAge: null }

const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }
const field: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }

export function WhatIf({
  base,
  real,
  initial,
}: {
  /** The user's current plan, in the same units as the rest of the page (nominal; `inflation` set when showing today's money). */
  base: ProjectionInput
  real: boolean
  initial?: Partial<WhatIfState>
}) {
  const [s, setS] = useState<WhatIfState>({ ...UNCHANGED, ...initial })
  const changed = Object.values(s).some(v => v !== null)

  const scenario: Scenario = {
    voluntaryMonthly: s.voluntary ?? undefined,
    employeeRate: s.employeeRate ?? undefined,
    expectedReturn: s.fund ? FUND_RETURNS[s.fund]?.defaultReturn : undefined,
    retirementAge: s.retirementAge ?? undefined,
  }

  const { current, whatIf, funds } = useMemo(() => {
    const current = projectRange(base)
    const whatIf = changed ? projectRange(withScenario(base, scenario)) : null
    // Fund comparison keeps every other input as it is now.
    const funds = Object.entries(FUND_RETURNS).map(([key, f]) => ({
      key, ...f, range: projectRange(withScenario(base, { expectedReturn: f.defaultReturn })),
    }))
    return { current, whatIf, funds }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, s.voluntary, s.employeeRate, s.fund, s.retirementAge])

  if (!current) return null

  const shown = whatIf ?? current
  const delta = whatIf ? whatIf.expected.finalBalance - current.expected.finalBalance : 0
  const deltaPct = whatIf && current.expected.finalBalance > 0 ? (delta / current.expected.finalBalance) * 100 : 0
  const memberDelta = whatIf ? whatIf.expected.totals.member - current.expected.totals.member : 0
  const currentVoluntary = Number(base.voluntaryMonthly) || 0
  const voluntaryMax = Math.max(500, Math.ceil((currentVoluntary * 2) / 50) * 50)
  const retAge = s.retirementAge ?? base.retirementAge
  const t = shown.expected.totals
  const parts = [
    { label: 'Your starting balance', value: t.start, color: 'var(--text3)' },
    { label: 'Your own contributions', value: t.member, color: 'var(--primary)' },
    { label: 'Employer (after tax)', value: t.employerNet, color: '#10b981' },
    { label: 'Government', value: t.govt, color: '#f59e0b' },
    { label: 'Investment growth', value: Math.max(0, t.growth), color: '#8b5cf6' },
  ]
  const partsTotal = parts.reduce((a, p) => a + p.value, 0) || 1

  const box: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconAdjustmentsHorizontal size={17} style={{ color: 'var(--primary)' }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>What if…?</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Try changes to see their effect. Nothing here is saved.</p>
          </div>
        </div>
        {changed && (
          <button onClick={() => setS(UNCHANGED)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)' }}>
            <IconRefresh size={12} /> Reset
          </button>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBottom: 18 }}>
        <div>
          <label style={label} htmlFor="wi-vol">Extra top-up each month: <span style={{ color: 'var(--text)' }}>{nzd(s.voluntary ?? currentVoluntary)}</span></label>
          <input id="wi-vol" type="range" min={0} max={voluntaryMax} step={10} value={s.voluntary ?? currentVoluntary}
            onChange={e => setS(p => ({ ...p, voluntary: Number(e.target.value) === currentVoluntary ? null : Number(e.target.value) }))}
            style={{ width: '100%' }} />
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>Now: {nzd(currentVoluntary)}/month</span>
        </div>
        <div>
          <label style={label} htmlFor="wi-rate">Your contribution rate</label>
          <select id="wi-rate" value={s.employeeRate ?? base.employeeRate}
            onChange={e => setS(p => ({ ...p, employeeRate: Number(e.target.value) === base.employeeRate ? null : Number(e.target.value) }))} style={field}>
            {[...new Set([...EMPLOYEE_RATES, base.employeeRate])].sort((a, b) => a - b).map(r => <option key={r} value={r}>{r}%</option>)}
          </select>
        </div>
        <div>
          <label style={label} htmlFor="wi-fund">Fund type</label>
          <select id="wi-fund" value={s.fund ?? ''} onChange={e => setS(p => ({ ...p, fund: e.target.value || null }))} style={field}>
            <option value="">Current ({base.expectedReturn}% a year)</option>
            {Object.entries(FUND_RETURNS).map(([k, f]) => <option key={k} value={k}>{f.label} ({f.defaultReturn}% a year)</option>)}
          </select>
        </div>
        <div>
          <label style={label} htmlFor="wi-age">Age you stop: <span style={{ color: 'var(--text)' }}>{retAge}</span></label>
          <input id="wi-age" type="range" min={55} max={75} step={1} value={retAge}
            onChange={e => setS(p => ({ ...p, retirementAge: Number(e.target.value) === base.retirementAge ? null : Number(e.target.value) }))}
            style={{ width: '100%' }} />
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>Now: {base.retirementAge}</span>
        </div>
      </div>

      {/* Result */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Current plan</p>
          <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{nzd(current.expected.finalBalance)}</p>
          <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>Range {nzd(current.low.finalBalance)} – {nzd(current.high.finalBalance)}</p>
        </div>
        <div style={{ background: whatIf ? 'var(--primary-light)' : 'var(--surface2)', border: `1px solid ${whatIf ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>With your changes</p>
          {whatIf ? (
            <>
              <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{nzd(whatIf.expected.finalBalance)}</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: delta >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 3 }}>
                {signed(delta)} ({delta >= 0 ? '+' : '−'}{Math.abs(deltaPct).toFixed(1)}%)
              </p>
              <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Range {nzd(whatIf.low.finalBalance)} – {nzd(whatIf.high.finalBalance)}</p>
            </>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>Move a slider or pick another option to compare.</p>
          )}
        </div>
      </div>
      {whatIf && Math.abs(memberDelta) >= 1 && (
        <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14 }}>
          That means putting in about <strong>{nzd(Math.abs(memberDelta))} {memberDelta > 0 ? 'more' : 'less'}</strong> of your own money over the period.
          The rest of the difference, {signed(delta - memberDelta)}, comes from growth and government money.
        </p>
      )}
      {retAge < GOVT_MTC_MAX_AGE && (
        <p style={{ fontSize: 11, color: 'var(--amber)', lineHeight: 1.6, marginBottom: 14 }}>
          KiwiSaver savings generally can&apos;t be withdrawn until {GOVT_MTC_MAX_AGE}, apart from a few exceptions such as a first home. Stopping at {retAge} shows your balance then, not money you could spend.
        </p>
      )}

      {/* Where it comes from */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
          Where {whatIf ? 'the new' : 'your'} balance comes from {real ? '(today’s money)' : ''}
        </p>
        <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 10, background: 'var(--surface3)' }}>
          {parts.map(p => <div key={p.label} title={p.label} style={{ width: `${(p.value / partsTotal) * 100}%`, background: p.color }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '4px 16px' }}>
          {parts.map(p => (
            <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: 'var(--text2)' }}>{p.label}</span>
              <span style={{ fontFamily: 'DM Mono, monospace' }}>{nzd(p.value)}</span>
              <span style={{ width: 34, textAlign: 'right', color: 'var(--text3)' }}>{Math.round((p.value / partsTotal) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fund comparison */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Fund types compared, everything else unchanged</p>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {[{ key: 'now', label: 'Your plan', defaultReturn: base.expectedReturn, range: current }, ...funds].map((f, i) => {
            const diff = f.range ? f.range.expected.finalBalance - current.expected.finalBalance : 0
            return (
              <div key={f.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px,1fr) 70px minmax(90px,1fr) minmax(120px,1.4fr)', gap: 8, padding: '8px 12px', fontSize: 11, alignItems: 'center', background: i === 0 ? 'var(--surface2)' : 'transparent', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <span style={{ fontWeight: 700 }}>{f.label}</span>
                <span style={{ color: 'var(--text3)' }}>{f.defaultReturn}% a year</span>
                <span style={{ fontFamily: 'DM Mono, monospace' }}>
                  {f.range ? nzd(f.range.expected.finalBalance) : '—'}
                  {i > 0 && f.range && Math.abs(diff) >= 1 && <span style={{ color: diff >= 0 ? 'var(--green)' : 'var(--red)', marginLeft: 6 }}>{signed(diff)}</span>}
                </span>
                <span style={{ color: 'var(--text3)' }}>{f.range ? `${nzd(f.range.low.finalBalance)} – ${nzd(f.range.high.finalBalance)}` : ''}</span>
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.6, marginTop: 8 }}>
          The range shows the result if returns average {RANGE_SPREAD}% a year lower or higher than assumed. Higher-return funds tend to swing more from year to year, and fees matter too. Returns are rough long-run guides, not forecasts, and this isn&apos;t a recommendation to switch funds.
        </p>
      </div>
    </div>
  )
}
