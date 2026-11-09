'use client'
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { WealthChart, type Series } from '@/components/savings/WealthChart'
import { RWT_RATES, afterTaxRate, toMonthly, type Frequency } from '@/lib/savings'
import {
  saveSavingsPrefs, buildPots, extraMonthlyGrowth,
  type SavingsData, type SavingsPrefs, type Pot,
} from '@/lib/savingsData'

const supabase = createClient()
const money = (n: number) => n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`
const COLORS: Record<Pot['key'], string> = { savings: '#14B8A6', investing: '#5B7CF0', kiwisaver: '#F59E0B' }

const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 5 }
const field: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }
const h2: React.CSSProperties = { fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 4 }
const sub: React.CSSProperties = { fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.5 }

function Stat({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <p style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>{title}</p>
      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 20, fontWeight: 600, marginTop: 4 }}>{value}</p>
      {note && <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, lineHeight: 1.4 }}>{note}</p>}
    </div>
  )
}

// The Savings page's content, given the data (app/app/finance/savings/page.tsx loads it).
export function SavingsView({ data, persist = true }: { data: SavingsData; persist?: boolean }) {
  const [inputs, setInputs] = useState<Required<SavingsPrefs> | null>(data.inputs)
  const [view, setView] = useState<'wealth' | 'income'>('wealth')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Saved a moment after the last change, so the page remembers your numbers.
  function change(patch: Partial<SavingsPrefs>) {
    setInputs(prev => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (persist) saveTimer.current = setTimeout(() => saveSavingsPrefs(supabase, next), 800)
      return next
    })
  }

  const pots = useMemo(() => (inputs ? buildPots(data, inputs) : []), [data, inputs])
  const extra = useMemo(() => (inputs ? extraMonthlyGrowth(data, inputs, 100) : []), [data, inputs])

  if (!inputs) return null

  const a = data.analysis
  const years = inputs.years
  const savings = pots.find(p => p.key === 'savings')!
  const end = savings.points[years]
  const startYear = new Date().getFullYear()
  const best = [...pots].sort((x, y) => y.rate - x.rate)[0]

  const series: Series[] = pots.map(p => ({
    label: p.label, color: COLORS[p.key],
    values: p.points.map(pt => (view === 'wealth' ? pt.balance : pt.earnedThisYear)),
  }))
  if (pots.length > 1) {
    series.push({
      label: view === 'wealth' ? 'All three together' : 'Together', color: 'var(--text2)', dashed: true,
      values: savings.points.map((_, i) => pots.reduce((s, p) => s + (view === 'wealth' ? p.points[i].balance : p.points[i].earnedThisYear), 0)),
    })
  }

  return (
    <div style={{ padding: '24px 16px', maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, sans-serif', margin: 0 }}>Savings</h1>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>What your savings earn, where they could be, and how they compare with investing and KiwiSaver.</p>
      </div>

      {/* Now */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Stat title="In savings accounts" value={money(a.balance)}
          note={a.accounts.length ? a.accounts.map(x => x.name).join(', ') : 'No savings or term deposit accounts connected yet'} />
        <Stat title="Interest, last 12 months" value={money(a.interestYear)}
          note={a.interestYear > 0 ? `${money(a.rwtYear)} withholding tax taken${a.months < 11 ? ` · from ${Math.round(a.months)} months, scaled to a year` : ''}` : 'None found yet. Tag interest payments as Interest on Transactions.'} />
        <Stat title="Your rate" value={a.grossRate != null ? `${a.grossRate}%` : '—'}
          note={a.grossRate != null ? `before tax · about ${afterTaxRate(a.grossRate, inputs.rwt)}% after RWT` : 'Shows once interest and a savings balance are found'} />
        <Stat title="Added each month" value={a.monthlySaving != null ? money(a.monthlySaving) : '—'}
          note="Money into your savings accounts, less withdrawals, over recent months" />
      </div>

      {/* Projection */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={h2}>Your savings in {years} years</h2>
            <p style={sub}>Interest is paid monthly and compounds, with RWT taken off each time.</p>
          </div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 8, padding: 3 }}>
            {([5, 10] as const).map(y => (
              <button key={y} onClick={() => change({ years: y })}
                style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: years === y ? 'var(--primary)' : 'transparent', color: years === y ? 'white' : 'var(--text2)' }}>
                {y} years
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={label} htmlFor="sv-amount">You add</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input id="sv-amount" type="number" min={0} step={10} value={inputs.amount} onChange={e => change({ amount: Math.max(0, Number(e.target.value) || 0) })} style={{ ...field, flex: 1, minWidth: 80 }} />
              <select aria-label="How often" value={inputs.freq} onChange={e => change({ freq: e.target.value as Frequency })} style={{ ...field, width: 'auto', flex: 'none' }}>
                <option value="weekly">a week</option><option value="fortnightly">a fortnight</option><option value="monthly">a month</option>
              </select>
            </div>
          </div>
          <div>
            <label style={label} htmlFor="sv-rate">Interest rate (% a year)</label>
            <input id="sv-rate" type="number" min={0} max={15} step={0.05} value={inputs.rate} onChange={e => change({ rate: Math.max(0, Number(e.target.value) || 0) })} style={field} />
          </div>
          <div>
            <label style={label} htmlFor="sv-rwt">Your RWT rate</label>
            <select id="sv-rwt" value={inputs.rwt} onChange={e => change({ rwt: Number(e.target.value) })} style={field}>
              {RWT_RATES.map(r => <option key={r} value={r}>{pct(r)}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Stat title={`Balance in ${startYear + years}`} value={money(end.balance)} />
          <Stat title="You put in" value={money(end.added)} note={`${money(toMonthly(inputs.amount, inputs.freq))} a month`} />
          <Stat title="Interest earned (after tax)" value={money(end.earned)} />
          <Stat title={`Interest a year by ${startYear + years}`} value={money(end.earnedThisYear)} note={`about ${money(end.earnedThisYear / 12)} a month, without touching the balance`} />
        </div>

        <WealthChart startYear={startYear} ariaLabel={`Savings balance over the next ${years} years`}
          series={[
            { label: 'Balance', color: COLORS.savings, values: savings.points.map(p => p.balance) },
            { label: 'What you put in', color: 'var(--text3)', dashed: true, values: savings.points.map(p => a.balance + p.added) },
          ]} />
        {inputs.rate > 0 && a.grossRate != null && Math.abs(inputs.rate - a.grossRate) > 0.25 && (
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Your accounts have paid about {a.grossRate}% over the last year; this uses the {inputs.rate}% you entered.</p>
        )}
      </div>

      {/* Compare */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={h2}>Savings, investing and KiwiSaver</h2>
            <p style={sub}>Each pot over the next {years} years at its own return, with what you add to it now.</p>
          </div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 8, padding: 3 }}>
            {([['wealth', 'Total wealth'], ['income', 'Earned each year']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setView(k)}
                style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: view === k ? 'var(--primary)' : 'transparent', color: view === k ? 'white' : 'var(--text2)' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <WealthChart series={series} startYear={startYear}
          ariaLabel={view === 'wealth' ? `Savings, investing and KiwiSaver balances over ${years} years` : `Interest and returns earned each year over ${years} years`} />
        {view === 'income' && <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Growth each pot earns in a year: interest for savings, expected returns for investing and KiwiSaver. Only savings interest is paid out to you; the others grow the balance.</p>}

        <div style={{ overflowX: 'auto', marginTop: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text2)', textAlign: 'right' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Pot</th>
                <th style={{ padding: '6px 8px' }}>Now</th>
                <th style={{ padding: '6px 8px' }}>Adding a month</th>
                <th style={{ padding: '6px 8px' }}>Return a year</th>
                <th style={{ padding: '6px 8px' }}>In {years} years</th>
              </tr>
            </thead>
            <tbody>
              {pots.map(p => (
                <tr key={p.key} style={{ borderBottom: '1px solid var(--border)', textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>
                  <td style={{ textAlign: 'left', padding: '8px', fontFamily: 'inherit' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: COLORS[p.key], marginRight: 6 }} />
                    <span style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700 }}>{p.label}</span>
                  </td>
                  <td style={{ padding: 8 }}>{money(p.today)}</td>
                  <td style={{ padding: 8 }}>{money(p.monthly)}</td>
                  <td style={{ padding: 8 }} title={p.rateNote}>{p.rate}%</td>
                  <td style={{ padding: 8, fontWeight: 700 }}>{money(p.points[years].balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul style={{ margin: '10px 0 0', paddingLeft: 16, fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
          {pots.map(p => <li key={p.key}><strong style={{ color: 'var(--text2)' }}>{p.label}:</strong> {p.rate}% is {p.rateNote}.</li>)}
          {!pots.some(p => p.key === 'kiwisaver') && <li>Add your KiwiSaver on the <Link href="/app/finance/kiwisaver" style={{ color: 'var(--primary)' }}>KiwiSaver page</Link> to include it.</li>}
          {!pots.some(p => p.key === 'investing') && <li>Add holdings on <Link href="/app/portfolio" style={{ color: 'var(--primary)' }}>My Portfolio</Link>, or an amount to invest below, to include investing.</li>}
        </ul>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 }}>
          <div>
            <label style={label} htmlFor="inv-monthly">You add to investments (a month)</label>
            <input id="inv-monthly" type="number" min={0} step={10} value={inputs.investMonthly} onChange={e => change({ investMonthly: Math.max(0, Number(e.target.value) || 0) })} style={field} />
          </div>
          <div>
            <label style={label} htmlFor="inv-return">Investing return to assume (% a year)</label>
            <input id="inv-return" type="number" min={-10} max={20} step={0.5} value={inputs.investReturn} onChange={e => change({ investReturn: Number(e.target.value) || 0 })} style={field} />
          </div>
        </div>

        {/* Which is doing best, and where an extra $100 goes furthest */}
        <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px', marginTop: 16, fontSize: 12, lineHeight: 1.6 }}>
          {pots.length > 1 && <p style={{ marginBottom: 8 }}><strong>Highest return right now:</strong> {best.label}, at {best.rate}% a year ({best.rateNote}).</p>}
          <p style={{ fontWeight: 700, marginBottom: 4 }}>An extra $100 a month for {years} years would grow to about:</p>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {extra.map(x => <li key={x.key}><strong>{money(x.total)}</strong> in {x.label}: {x.note}</li>)}
          </ul>
          <p style={{ color: 'var(--text3)', fontSize: 11, marginTop: 8 }}>
            Higher expected returns come with more ups and downs. Savings interest is close to certain and you can get at it any time; KiwiSaver adds employer and government money but is locked in; shares can fall in value, especially over shorter periods. Many people keep an emergency fund in savings before investing.
          </p>
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
        Estimates, not forecasts: rates and returns change, and these assume what you add stays the same. Investing returns are shown before tax (overseas shares may fall under the FIF rules). General information, not financial advice. Ask the fox to talk your numbers through, or a licensed financial adviser for advice on your situation.
      </p>
    </div>
  )
}
