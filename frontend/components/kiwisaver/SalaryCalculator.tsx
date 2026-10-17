'use client'
import { useEffect, useMemo, useState } from 'react'
import { IconCalculator, IconChevronDown, IconCheck } from '@tabler/icons-react'
import {
  PERIODS, TAX_YEAR, payFromGross, grossFromNet, perPeriod, ietc,
  type Period, type PayOptions,
} from '@/lib/paye'
import { EMPLOYEE_RATES, esctRate } from '@/lib/kiwisaver'

// Works out an annual salary from whatever you know: an hourly rate, a pay
// amount before or after tax, or the salary itself. Nothing is saved unless you
// choose to use the result for your KiwiSaver projection.

type Mode = 'hourly' | 'pay' | 'annual'

const nzd = (n: number, cents = false) =>
  n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })

const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }
const field: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }

const STORE_KEY = 'fennec:salary-calculator'
const SHOWN_PERIODS: Period[] = ['weekly', 'fortnightly', 'monthly', 'annual']

export function SalaryCalculator({ defaultKiwiSaverRate, employerRate, currentSalary, onUseSalary }: {
  defaultKiwiSaverRate: number
  employerRate: number
  currentSalary: number | null
  /** Saves the salary to the KiwiSaver settings. Omit to hide the button. */
  onUseSalary?: (salary: number) => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('hourly')
  const [hourly, setHourly] = useState('')
  const [hours, setHours] = useState('40')
  const [payAmount, setPayAmount] = useState('')
  const [payPeriod, setPayPeriod] = useState<Period>('fortnightly')
  const [afterTax, setAfterTax] = useState(true)
  const [annual, setAnnual] = useState('')
  const [ksRate, setKsRate] = useState(defaultKiwiSaverRate)
  const [studentLoan, setStudentLoan] = useState(false)
  const [meCode, setMeCode] = useState(false)
  const [saved, setSaved] = useState(false)

  // Remember inputs on this device (a convenience only; nothing here is sensitive to lose).
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
      if (s) {
        setMode(s.mode ?? 'hourly'); setHourly(s.hourly ?? ''); setHours(s.hours ?? '40')
        setPayAmount(s.payAmount ?? ''); setPayPeriod(s.payPeriod ?? 'fortnightly'); setAfterTax(s.afterTax ?? true)
        setAnnual(s.annual ?? ''); setStudentLoan(!!s.studentLoan); setMeCode(!!s.meCode)
        if (typeof s.ksRate === 'number') setKsRate(s.ksRate)
      }
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ mode, hourly, hours, payAmount, payPeriod, afterTax, annual, ksRate, studentLoan, meCode }))
    } catch {}
  }, [mode, hourly, hours, payAmount, payPeriod, afterTax, annual, ksRate, studentLoan, meCode])

  const opts: PayOptions = { kiwisaverRate: ksRate, studentLoan, meCode }
  const hoursNum = Number(hours) > 0 ? Number(hours) : 40

  const grossAnnual = useMemo(() => {
    if (mode === 'hourly') {
      const h = Number(hourly)
      return h > 0 ? h * hoursNum * 52 : 0
    }
    if (mode === 'annual') return Math.max(0, Number(annual) || 0)
    const amt = Number(payAmount)
    if (!(amt > 0)) return 0
    const yearly = amt * PERIODS[payPeriod].perYear
    return afterTax ? grossFromNet(yearly, opts) : yearly
  }, [mode, hourly, hoursNum, annual, payAmount, payPeriod, afterTax, ksRate, studentLoan, meCode])

  const year = payFromGross(grossAnnual, opts)
  const hasResult = grossAnnual > 0
  const rounded = Math.round(grossAnnual)
  const effective = year.gross > 0 ? ((year.tax + year.acc) / year.gross) * 100 : 0
  const employerGross = grossAnnual * (employerRate / 100)
  const employerNet = employerGross * (1 - esctRate(grossAnnual, employerGross))
  const ietcEligible = ietc(grossAnnual) > 0

  useEffect(() => { setSaved(false) }, [rounded])

  const rows: { key: keyof ReturnType<typeof perPeriod>; label: string; show: boolean; minus?: boolean; plus?: boolean }[] = [
    { key: 'gross', label: 'Gross pay', show: true },
    { key: 'tax', label: meCode && year.ietcCredit > 0 ? 'Income tax (after IETC)' : 'Income tax (PAYE)', show: true, minus: true },
    { key: 'acc', label: 'ACC earners’ levy', show: true, minus: true },
    { key: 'studentLoan', label: 'Student loan', show: studentLoan, minus: true },
    { key: 'kiwisaver', label: `KiwiSaver (${ksRate}%)`, show: ksRate > 0, minus: true },
  ]

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 20 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IconCalculator size={16} style={{ color: 'var(--primary)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Salary calculator</div>
          <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>Work out your salary from an hourly rate or your take-home pay</div>
        </div>
        <IconChevronDown size={16} style={{ color: 'var(--text3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && (
        <div style={{ padding: '0 20px 18px' }}>
          {/* What do you know? */}
          <div role="group" aria-label="What do you know?" style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 10, padding: 3, marginBottom: 14 }}>
            {([['hourly', 'Hourly rate'], ['pay', 'Pay per period'], ['annual', 'Annual salary']] as [Mode, string][]).map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                style={{ flex: 1, padding: '7px 6px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: mode === m ? 'var(--surface)' : 'transparent', color: mode === m ? 'var(--primary)' : 'var(--text2)', boxShadow: mode === m ? 'var(--sh)' : 'none' }}>
                {l}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
            {mode === 'hourly' && (
              <div>
                <label style={label}>Hourly rate (before tax)</label>
                <input type="number" inputMode="decimal" min={0} step="0.01" value={hourly} onChange={e => setHourly(e.target.value)} placeholder="e.g. 32.50" style={field} />
              </div>
            )}
            {mode === 'pay' && (
              <>
                <div>
                  <label style={label}>Amount</label>
                  <input type="number" inputMode="decimal" min={0} step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="e.g. 2100" style={field} />
                </div>
                <div>
                  <label style={label}>Paid</label>
                  <select value={payPeriod} onChange={e => setPayPeriod(e.target.value as Period)} style={field}>
                    {(Object.keys(PERIODS) as Period[]).filter(p => p !== 'annual').map(p => <option key={p} value={p}>{PERIODS[p].label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>That amount is</label>
                  <select value={afterTax ? 'after' : 'before'} onChange={e => setAfterTax(e.target.value === 'after')} style={field}>
                    <option value="after">After tax (what hits my bank)</option>
                    <option value="before">Before tax (gross)</option>
                  </select>
                </div>
              </>
            )}
            {mode === 'annual' && (
              <div>
                <label style={label}>Annual salary (before tax)</label>
                <input type="number" inputMode="decimal" min={0} value={annual} onChange={e => setAnnual(e.target.value)} placeholder="e.g. 70000" style={field} />
              </div>
            )}
            <div>
              <label style={label}>Hours per week</label>
              <input type="number" inputMode="decimal" min={1} max={100} value={hours} onChange={e => setHours(e.target.value)} style={field} />
            </div>
          </div>

          {/* Deductions that change take-home */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, alignItems: 'end', marginBottom: 6 }}>
            <div>
              <label style={label}>Your KiwiSaver contribution</label>
              <select value={ksRate} onChange={e => setKsRate(Number(e.target.value))} style={field}>
                <option value={0}>Not contributing</option>
                {EMPLOYEE_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer', padding: '8px 0' }}>
              <input type="checkbox" checked={studentLoan} onChange={e => setStudentLoan(e.target.checked)} /> I have a student loan
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer', padding: '8px 0' }} title="Tax code ME gives the independent earner tax credit through your pay">
              <input type="checkbox" checked={meCode} onChange={e => setMeCode(e.target.checked)} /> Tax code ME
            </label>
          </div>
          {mode === 'pay' && afterTax && (
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 6px' }}>
              Your take-home has KiwiSaver and any student loan already taken out, so set those to match your payslip.
            </p>
          )}
          {!meCode && ietcEligible && (
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 6px' }}>
              At this income you may qualify for the independent earner tax credit (up to $520 a year). If your payslip shows tax code ME, tick it above.
            </p>
          )}

          {hasResult && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, margin: '14px 0 12px', padding: '14px 16px', borderRadius: 12, background: 'var(--primary-light)' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Annual salary (before tax)</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: 1.15 }}>{nzd(rounded)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                    ≈ {nzd(grossAnnual / 52 / hoursNum, true)}/hour at {hoursNum} hours a week · {effective.toFixed(1)}% average tax incl. ACC
                  </div>
                </div>
                {onUseSalary && (
                  <button
                    onClick={async () => { await onUseSalary(rounded); setSaved(true) }}
                    disabled={saved || currentSalary === rounded}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', cursor: saved || currentSalary === rounded ? 'default' : 'pointer', background: 'var(--primary)', color: '#fff', fontSize: 12.5, fontWeight: 700, opacity: saved || currentSalary === rounded ? 0.6 : 1 }}
                  >
                    {saved || currentSalary === rounded ? <><IconCheck size={14} /> Used for KiwiSaver</> : 'Use for my KiwiSaver projection'}
                  </button>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 420 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text2)', fontWeight: 700, fontSize: 11 }} />
                      {SHOWN_PERIODS.map(p => (
                        <th key={p} style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text2)', fontWeight: 700, fontSize: 11 }}>{PERIODS[p].label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter(r => r.show).map(r => (
                      <tr key={r.key} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '7px 8px', color: 'var(--text)' }}>{r.label}</td>
                        {SHOWN_PERIODS.map(p => (
                          <td key={p} style={{ padding: '7px 8px', textAlign: 'right', color: r.minus ? 'var(--text2)' : 'var(--text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {r.minus ? '−' : ''}{nzd(perPeriod(year, p)[r.key], p !== 'annual')}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td style={{ padding: '8px', fontWeight: 800, color: 'var(--text)' }}>Take-home pay</td>
                      {SHOWN_PERIODS.map(p => (
                        <td key={p} style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {nzd(perPeriod(year, p).net, p !== 'annual')}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {ksRate > 0 && employerRate > 0 && (
                <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
                  Your employer also adds {employerRate}% to KiwiSaver: {nzd(employerGross)} a year, about {nzd(employerNet)} after employer contribution tax (ESCT).
                </p>
              )}
            </>
          )}

          <p style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
            Estimate for one main job using {TAX_YEAR} IRD rates (income tax, ACC earners’ levy 1.75%, student loan 12% over $24,128). Payslips can differ by a few cents through rounding.
            Secondary jobs, other tax codes, overtime and allowances aren’t included.
          </p>
        </div>
      )}
    </div>
  )
}
