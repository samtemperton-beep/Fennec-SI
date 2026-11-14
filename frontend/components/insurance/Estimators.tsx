'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { askFennec } from '@/lib/askFennec'
import { lifeNeed, loadLifeDefaults, healthCost, carCompare, type LifeInputs, type HealthInputs, type CarInputs } from '@/lib/insuranceTools'

// Finance → Insurance → Estimate tools: life cover, health cover, car cover.
// Health and car inputs stay in this browser (localStorage) so they're there
// next time; life figures (debts, savings, income) aren't stored, and are
// loaded fresh from Fennec instead.

const supabase = createClient()
const nzd = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
const SUB: React.CSSProperties = { fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }
const INPUT: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2, var(--surface))', color: 'var(--text)', fontSize: 14 }
const GRID: React.CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }

function useStored<T extends object>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    try { const s = localStorage.getItem(key); if (s) setV({ ...initial, ...JSON.parse(s) }) } catch {}
    setReady(true)
  }, [])
  useEffect(() => { if (ready) try { localStorage.setItem(key, JSON.stringify(v)) } catch {} }, [v, ready])
  return [v, setV, ready] as const
}

function Num({ label, value, onChange, hint, suffix }: { label: string; value: number; onChange: (n: number) => void; hint?: string; suffix?: string }) {
  return (
    <label style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>
      {label}{suffix ? ` (${suffix})` : ''}
      <input inputMode="decimal" style={{ ...INPUT, marginTop: 4 }} value={Number.isFinite(value) ? String(value) : ''}
        onChange={e => { const n = Number(e.target.value.replace(/[$,%\s]/g, '')); onChange(Number.isFinite(n) ? n : 0) }} />
      {hint && <span style={{ display: 'block', fontWeight: 400, fontSize: 11, marginTop: 2 }}>{hint}</span>}
    </label>
  )
}

function Result({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'good' | 'bad' }) {
  return (
    <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: tone === 'good' ? 'var(--green)' : tone === 'bad' ? 'var(--red)' : 'var(--text)' }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{note}</div>}
    </div>
  )
}

const ASK: React.CSSProperties = { marginTop: 12, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }

// ── Life ───────────────────────────────────────────────────────────────────

const LIFE0: LifeInputs = { mortgages: 0, otherDebts: 0, dependants: false, annualIncome: 0, incomeShare: 75, years: 5, children: 0, perChild: 0, finalCosts: 10000, savings: 0, kiwisaver: 0, existingCover: 0 }

function LifeTool() {
  const [i, setI] = useState<LifeInputs>(LIFE0)
  const [notes, setNotes] = useState<string[]>([])
  const [filled, setFilled] = useState(false)
  const set = (k: keyof LifeInputs) => (v: any) => setI(x => ({ ...x, [k]: v }))
  async function fill() {
    const d = await loadLifeDefaults(supabase)
    const { notes: n, ...rest } = d
    setI(x => ({ ...x, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) }))
    setNotes(n); setFilled(true)
  }
  useEffect(() => { if (!filled) fill() }, [])
  const r = lifeNeed(i)
  return (
    <div>
      <p style={{ ...SUB, marginBottom: 12 }}>
        How much life cover would leave the people who rely on you OK: clear the debts, replace some income for a while, and cover final costs, less what you already have.
        KiwiSaver is paid to your estate when you die, so it counts. {notes.length ? `Filled in from Fennec: ${notes.join(' ')}` : ''}
        {' '}<button type="button" onClick={fill} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>Refill from Fennec</button>
      </p>
      <div style={GRID}>
        <Num label="Mortgages" value={i.mortgages} onChange={set('mortgages')} hint="Home and rental loans" />
        <Num label="Other debts" value={i.otherDebts} onChange={set('otherDebts')} hint="Credit cards, car and personal loans" />
        <label style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>Does anyone rely on your income?
          <select style={{ ...INPUT, marginTop: 4 }} value={i.dependants ? 'yes' : 'no'} onChange={e => set('dependants')(e.target.value === 'yes')}>
            <option value="yes">Yes (partner, children)</option>
            <option value="no">No</option>
          </select>
        </label>
        {i.dependants && <>
          <Num label="Income a year" value={i.annualIncome} onChange={set('annualIncome')} hint="After tax, what the household lives on" />
          <Num label="Share to replace" suffix="%" value={i.incomeShare} onChange={set('incomeShare')} hint="Often 60 to 75%" />
          <Num label="For how many years" value={i.years} onChange={set('years')} hint="E.g. until the youngest is 18" />
        </>}
        <Num label="Children" value={i.children} onChange={set('children')} />
        {i.children > 0 && <Num label="Education, each" value={i.perChild} onChange={set('perChild')} hint="Optional" />}
        <Num label="Funeral and final costs" value={i.finalCosts} onChange={set('finalCosts')} />
        <Num label="Savings" value={i.savings} onChange={set('savings')} />
        <Num label="KiwiSaver" value={i.kiwisaver} onChange={set('kiwisaver')} />
        <Num label="Life cover you have" value={i.existingCover} onChange={set('existingCover')} hint="Including through work" />
      </div>
      <div style={{ ...GRID, marginTop: 14 }}>
        <Result label="Needed" value={nzd.format(r.needs)} note={`Debts ${nzd.format(i.mortgages + i.otherDebts)}${r.income ? ` + income ${nzd.format(r.income)}` : ''}${r.education ? ` + education ${nzd.format(r.education)}` : ''} + final ${nzd.format(i.finalCosts)}`} />
        <Result label="Already there" value={nzd.format(r.have)} note="Savings, KiwiSaver and cover you have" />
        <Result label="Cover to consider" value={nzd.format(r.gap)} tone={r.gap > 0 ? undefined : 'good'} note={r.gap > 0 ? 'Rough estimate' : 'What you have looks enough'} />
      </div>
      <p style={{ ...SUB, marginTop: 10 }}>
        If no one relies on your income and your debts aren&apos;t shared, you may need little or no life cover, though a lender can ask for it.
        Rental properties could be sold to clear their loans; leave them in if you&apos;d want them kept.
        Being unable to work is more likely than dying young: ACC covers accidents (about 80% of earnings), but not illness. Income protection usually pays up to about 75% of your income before tax; trauma cover pays a lump sum for serious illness.
      </p>
      <button type="button" style={ASK} onClick={() => askFennec(`Help me think about life insurance. Fennec's estimate: needed ${nzd.format(r.needs)} (mortgages ${nzd.format(i.mortgages)}, other debts ${nzd.format(i.otherDebts)}, income replacement ${nzd.format(r.income)}, education ${nzd.format(r.education)}, final costs ${nzd.format(i.finalCosts)}); already there ${nzd.format(r.have)} (savings ${nzd.format(i.savings)}, KiwiSaver ${nzd.format(i.kiwisaver)}, existing cover ${nzd.format(i.existingCover)}); gap ${nzd.format(r.gap)}. Someone relies on my income: ${i.dependants ? 'yes' : 'no'}; ${i.children} children. Do I need life cover, income protection or trauma cover, and what should I ask for?`)}>Ask Fennec about this</button>
    </div>
  )
}

// ── Health ─────────────────────────────────────────────────────────────────

const HEALTH0: HealthInputs = { monthly: 0, rise: 7, years: 10, growth: 4, procedure: 0 }

function HealthTool() {
  const [i, setI] = useStored<HealthInputs>('fennec.ins.health', HEALTH0)
  const set = (k: keyof HealthInputs) => (v: number) => setI(x => ({ ...x, [k]: v }))
  const r = healthCost(i)
  return (
    <div>
      <p style={{ ...SUB, marginBottom: 12 }}>
        What health cover costs over the years as premiums rise, against saving the same money yourself. Public healthcare covers you either way; private cover mainly buys faster treatment and more choice.
      </p>
      <div style={GRID}>
        <Num label="Premium a month" value={i.monthly} onChange={set('monthly')} hint="Your quote or current premium" />
        <Num label="Rise a year" suffix="%" value={i.rise} onChange={set('rise')} hint="Premiums go up with age and costs; your guess" />
        <Num label="Years" value={i.years} onChange={set('years')} />
        <Num label="Savings return" suffix="%" value={i.growth} onChange={set('growth')} hint="If you saved it instead" />
        <Num label="A private procedure's cost" value={i.procedure} onChange={set('procedure')} hint="Optional: a quote for something you might need" />
      </div>
      {i.monthly > 0 && (
        <>
          <div style={{ ...GRID, marginTop: 14 }}>
            <Result label={`Premiums over ${i.years} years`} value={nzd.format(r.paid)} note={`${nzd.format(i.monthly * 12)} this year, ${nzd.format(r.byYear[r.byYear.length - 1]?.premium ?? 0)} in year ${i.years}`} />
            <Result label="Saved and invested instead" value={nzd.format(r.fund)} note={`At ${i.growth}% a year`} />
            {i.procedure > 0 && <Result label="Savings would cover the procedure" value={r.coverYear ? `In year ${r.coverYear}` : `Not within ${i.years} years`} note="Insurance covers it from day one (after any stand-down)" />}
          </div>
          <p style={{ ...SUB, marginTop: 10 }}>
            Ways to pay less: a higher excess, surgical-only cover instead of comprehensive (day-to-day GP and specialist visits are the cheaper part to pay yourself), and checking your employer&apos;s group scheme.
            Before switching insurer, check how the new one treats conditions you already have: they&apos;re often excluded.
          </p>
        </>
      )}
      <button type="button" style={ASK} onClick={() => askFennec(`Help me decide about health insurance. Premium ${nzd.format(i.monthly)} a month, rising about ${i.rise}% a year: ${nzd.format(r.paid)} over ${i.years} years, or ${nzd.format(r.fund)} if saved at ${i.growth}%. What should I weigh up, and how could I pay less?`)}>Ask Fennec about this</button>
    </div>
  )
}

// ── Car ────────────────────────────────────────────────────────────────────

const CAR0: CarInputs = { value: 0, comprehensive: 0, excess: 500, thirdPartyFT: 0, thirdParty: 0 }

function CarTool() {
  const [i, setI] = useStored<CarInputs>('fennec.ins.car', CAR0)
  const set = (k: keyof CarInputs) => (v: number) => setI(x => ({ ...x, [k]: v }))
  const r = carCompare(i)
  return (
    <div>
      <p style={{ ...SUB, marginBottom: 12 }}>
        Is comprehensive cover worth it for your car? It pays to fix or replace your own car; third party pays for damage you do to other people&apos;s cars and property.
        Injuries are covered by ACC, not car insurance.
      </p>
      <div style={GRID}>
        <Num label="Car's value" value={i.value} onChange={set('value')} hint="What it would sell for now" />
        <Num label="Comprehensive a year" value={i.comprehensive} onChange={set('comprehensive')} />
        <Num label="Comprehensive excess" value={i.excess} onChange={set('excess')} />
        <Num label="Third party, fire & theft a year" value={i.thirdPartyFT} onChange={set('thirdPartyFT')} hint="Quote, if you have one" />
        <Num label="Third party only a year" value={i.thirdParty} onChange={set('thirdParty')} hint="Optional" />
      </div>
      {i.value > 0 && i.comprehensive > 0 && (
        <>
          <div style={{ ...GRID, marginTop: 14 }}>
            <Result label="Most comprehensive pays for your car" value={nzd.format(r.maxPayout)} note="Its value less the excess" />
            <Result label="Comprehensive costs" value={`${Math.round((r.premiumShare ?? 0) * 100)}% of the car a year`} note={`${nzd.format(i.comprehensive)} a year`} />
            {r.extra !== null && <Result label="Extra for comprehensive" value={`${nzd.format(r.extra)} a year`}
              note={r.yearsToSelfInsure ? `Saving that instead would replace the car in about ${r.yearsToSelfInsure} years` : undefined}
              tone={r.verdict === 'consider' ? 'bad' : 'good'} />}
          </div>
          <p style={{ ...SUB, marginTop: 10 }}>
            {r.verdict === 'consider'
              ? 'The extra for comprehensive is 10% or more of the most it would pay out each year. If you could replace or go without the car from savings, third party, fire & theft may be better value.'
              : r.verdict === 'keep'
                ? 'The extra for comprehensive is under 10% of what it would pay out, so it looks reasonable value, especially if losing the car would be hard to cover.'
                : 'Add a third party, fire & theft quote to compare.'}
            {' '}Always keep at least third party: damaging someone else&apos;s car can cost far more than your own. Check whether it&apos;s insured for market value or an agreed value.
          </p>
        </>
      )}
      <button type="button" style={ASK} onClick={() => askFennec(`Is comprehensive car insurance worth it for me? Car worth ${nzd.format(i.value)}, comprehensive ${nzd.format(i.comprehensive)} a year with a ${nzd.format(i.excess)} excess${i.thirdPartyFT ? `, third party fire & theft ${nzd.format(i.thirdPartyFT)}` : ''}${i.thirdParty ? `, third party only ${nzd.format(i.thirdParty)}` : ''}.`)}>Ask Fennec about this</button>
    </div>
  )
}

export function Estimators() {
  const [tab, setTab] = useState<'life' | 'health' | 'car'>('life')
  const TABS = [{ id: 'life', label: 'Life cover' }, { id: 'health', label: 'Health cover' }, { id: 'car', label: 'Car cover' }] as const
  return (
    <div className="card" style={{ padding: 20, marginTop: 8 }}>
      <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Estimate tools</h2>
      <p style={{ ...SUB, marginBottom: 12 }}>Rough estimates from your own figures, to help you know what to ask for. General information, not advice; an adviser or broker can tailor it.</p>
      <div role="tablist" style={{ display: 'inline-flex', gap: 4, background: 'var(--surface2)', borderRadius: 10, padding: 3, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: tab === t.id ? 'var(--primary)' : 'transparent', color: tab === t.id ? 'white' : 'var(--text2)' }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'life' ? <LifeTool /> : tab === 'health' ? <HealthTool /> : <CarTool />}
    </div>
  )
}
