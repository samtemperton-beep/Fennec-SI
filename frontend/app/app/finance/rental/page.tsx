'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { IconBuildingCommunity, IconEdit, IconPlus, IconDownload, IconAlertTriangle } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { askFennec } from '@/lib/askFennec'
import { PropertyForm, EMPTY_PROPERTY, type PropertyDraft } from '@/components/rental/PropertyForm'
import { CoverageChart } from '@/components/rental/CoverageChart'
import { RentalTransactions } from '@/components/rental/RentalTransactions'
import {
  ensureRentalCategories, totals, months, rentStatus, interestFor, interestDeductiblePct, monthlyRent,
  taxYearOf, taxYearRange, taxYearLabel, todayNZ, nzd, roleOf, TAX_LINES,
  type RentalProperty, type RentalAccount, type RentalTx, type RentalCategory,
} from '@/lib/rental'

const supabase = createClient()
const pct = (n: number) => `${Math.round(n)}%`
const pct1 = (n: number) => `${n.toFixed(1)}%`
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const addYears = (d: string, n: number) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`

const H2: React.CSSProperties = { fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 4 }
const SUB: React.CSSProperties = { fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tone === 'good' ? 'var(--green)' : tone === 'bad' ? 'var(--red)' : 'var(--text)' }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{note}</div>}
    </div>
  )
}

export default function RentalPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [props, setProps] = useState<RentalProperty[]>([])
  const [accounts, setAccounts] = useState<RentalAccount[]>([])
  const [cats, setCats] = useState<RentalCategory[]>([])
  const [txs, setTxs] = useState<RentalTx[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit' | 'add'>('view')
  const [saving, setSaving] = useState(false)
  const [taxYear, setTaxYear] = useState<number>(() => taxYearOf(todayNZ()) - 1)
  const [interestDraft, setInterestDraft] = useState('')

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const [{ data: p, error }, { data: a }] = await Promise.all([
      supabase.from('rental_properties').select('*').order('created_at'),
      supabase.from('fin_accounts').select('id, name, type, rental_property_id, is_business').order('name'),
    ])
    if (error) { toast.error(/rental_properties/.test(error.message) ? 'Rental needs a database update first (rental_migration.sql).' : error.message); setLoading(false); return }
    const list = (p ?? []).map((x: any) => ({ ...x, interest_by_year: x.interest_by_year ?? {} })) as RentalProperty[]
    setProps(list)
    setAccounts((a ?? []) as RentalAccount[])
    setSelected(s => (s && list.some(x => x.id === s) ? s : list[0]?.id ?? null))
    if (!list.length) setMode('add')
    if (list.length) setCats(await ensureRentalCategories(supabase, user.id))
    const linked = (a ?? []).filter((x: any) => x.rental_property_id).map((x: any) => x.id)
    if (linked.length) {
      const since = taxYearRange(taxYearOf(todayNZ()) - 3).from
      const { data: t } = await supabase.from('fin_transactions')
        .select('id, date, description, amount, category_id, account_id')
        .in('account_id', linked).gte('date', since).order('date', { ascending: false }).limit(5000)
      setTxs(((t ?? []) as any[]).map(x => ({ ...x, amount: Number(x.amount) })))
    } else setTxs([])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const property = props.find(p => p.id === selected) ?? null
  const catMap = useMemo(() => new Map(cats.map(c => [c.id, c])), [cats])
  const propAccounts = accounts.filter(a => a.rental_property_id === property?.id)
  const propTxs = useMemo(() => {
    const ids = new Set(propAccounts.map(a => a.id))
    return txs.filter(t => ids.has(t.account_id))
  }, [txs, propAccounts])

  // ── Saving ───────────────────────────────────────────────────────────────

  async function saveProperty(draft: PropertyDraft) {
    if (!userId) return
    const { name, value, value_note, purchase_price, purchase_date, loan_balance, interest_rate, rent_amount, rent_frequency, ownership_pct, new_build } = draft
    const d = { name, value, value_note, purchase_price, purchase_date, loan_balance, interest_rate, rent_amount, rent_frequency, ownership_pct, new_build }
    setSaving(true)
    if (mode === 'add') {
      const { data, error } = await supabase.from('rental_properties').insert({ ...d, user_id: userId }).select('id').single()
      if (error) toast.error(error.message)
      else { toast.success(`${d.name} added. Now link the account you use for it.`); setSelected((data as any).id); setMode('view'); await load() }
    } else if (property) {
      const { error } = await supabase.from('rental_properties').update({ ...d, updated_at: new Date().toISOString() }).eq('id', property.id)
      if (error) toast.error(error.message)
      else { toast.success('Saved'); setMode('view'); await load() }
    }
    setSaving(false)
  }

  /** Clears categories from the other kind of account, so the right ones can be picked. */
  async function clearCategories(accountId: string, toRental: boolean) {
    const rentalIds = cats.map(c => c.id)
    let q = supabase.from('fin_transactions').update({ category_id: null, category_source: null, shared_match_id: null }).eq('account_id', accountId)
    q = toRental
      ? (rentalIds.length ? q.not('category_id', 'is', null).not('category_id', 'in', `(${rentalIds.join(',')})`) : q.not('category_id', 'is', null))
      : q.in('category_id', rentalIds.length ? rentalIds : ['00000000-0000-0000-0000-000000000000'])
    const { error } = await q
    if (error) toast.error(error.message)
  }

  async function linkAccount(a: RentalAccount, on: boolean) {
    if (!property) return
    const { error } = await supabase.from('fin_accounts').update({ rental_property_id: on ? property.id : null }).eq('id', a.id)
    if (error) { toast.error(error.message); return }
    await clearCategories(a.id, on)
    toast.success(on ? `${a.name} is now part of ${property.name}. Its transactions are out of your household budget.` : `${a.name} is back in household.`)
    await load()
  }

  async function removeProperty() {
    if (!property) return
    for (const a of propAccounts) {
      await clearCategories(a.id, false)
      await supabase.from('fin_accounts').update({ rental_property_id: null }).eq('id', a.id)
    }
    const { error } = await supabase.from('rental_properties').delete().eq('id', property.id)
    if (error) { toast.error(error.message); return }
    toast.success(`${property.name} removed`)
    setSelected(null); setMode('view')
    await load()
  }

  async function saveInterest(yearEnd: number) {
    if (!property) return
    const v = interestDraft.trim() === '' ? null : Number(interestDraft.replace(/[$,\s]/g, ''))
    if (v !== null && (!Number.isFinite(v) || v < 0)) { toast.error('Enter the interest as a number.'); return }
    const next = { ...property.interest_by_year }
    if (v === null) delete next[String(yearEnd)]; else next[String(yearEnd)] = v
    const { error } = await supabase.from('rental_properties').update({ interest_by_year: next }).eq('id', property.id)
    if (error) { toast.error(error.message); return }
    setProps(ps => ps.map(p => p.id === property.id ? { ...p, interest_by_year: next } : p))
    setInterestDraft('')
    toast.success('Interest saved')
  }

  function exportCsv(yearEnd: number) {
    if (!property) return
    const { from, to } = taxYearRange(yearEnd)
    const rows = propTxs.filter(t => t.date >= from && t.date <= to).sort((a, b) => a.date.localeCompare(b.date))
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = [['Date', 'Description', 'Amount', 'Category', 'IR3R group'].join(',')]
    for (const t of rows) {
      const c = t.category_id ? catMap.get(t.category_id) : undefined
      const { role, line } = roleOf(c)
      const group = !c ? 'Uncategorised' : role === 'rent' || role === 'other_income' ? 'Rental income' : role === 'mortgage' ? 'Not deductible (principal and interest; use the interest figure)' : role === 'capital' ? 'Not deductible (capital)' : role === 'transfer' ? 'Ignored (transfer)' : line ?? 'Other expenses'
      lines.push([t.date, q(t.description ?? ''), t.amount.toFixed(2), q(c?.name ?? ''), q(group)].join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${property.name.replace(/[^\w-]+/g, '_')}_${taxYearLabel(yearEnd)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Figures ──────────────────────────────────────────────────────────────

  const today = todayNZ()
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`
  const last12 = useMemo(() => totals(propTxs.filter(t => t.date >= yearAgo), catMap), [propTxs, catMap, yearAgo])
  const chart = useMemo(() => months(propTxs, catMap, 12, today), [propTxs, catMap, today])
  const status = property ? rentStatus(property, propTxs, catMap, today) : null
  const monthsOfData = propTxs.length ? Math.min(12, Math.max(1, Math.round((Date.parse(today) - Date.parse(propTxs[propTxs.length - 1].date)) / (30.4 * 86_400_000)))) : 0

  const rentIn = last12.rent + last12.otherIncome
  const mortgageOut = last12.mortgage + last12.interest
  const allOut = mortgageOut + last12.expenses
  const net = rentIn - allOut
  const perMonth = monthsOfData ? net / monthsOfData : 0

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><LoadingSpinner /></div>

  const linkable = accounts.filter(a => !a.is_business && (!a.rental_property_id || a.rental_property_id === property?.id))
  const years = (() => {
    const cur = taxYearOf(today)
    const oldest = propTxs.length ? taxYearOf(propTxs[propTxs.length - 1].date) : cur - 1
    const out: number[] = []
    for (let y = cur; y >= Math.max(oldest, cur - 3); y--) out.push(y)
    return out
  })()

  return (
    <div style={{ padding: 'clamp(16px, 4vw, 28px)', maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <IconBuildingCommunity size={24} style={{ color: 'var(--primary)' }} />
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Rental</h1>
      </div>
      <p style={{ ...SUB, marginBottom: 18, maxWidth: 680 }}>
        How your rental is doing: rent in against the mortgage and other costs, yield and equity, and a tax-year summary for your IR3.
        Accounts you link here are kept out of your household budget.
      </p>

      {/* Property tabs */}
      {props.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {props.map(p => (
            <button key={p.id} type="button" onClick={() => { setSelected(p.id); setMode('view') }}
              style={{ padding: '7px 14px', borderRadius: 999, border: '1px solid var(--border)', background: p.id === selected && mode !== 'add' ? 'var(--primary)' : 'transparent', color: p.id === selected && mode !== 'add' ? 'white' : 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              {p.name}
            </button>
          ))}
          <button type="button" onClick={() => setMode('add')}
            style={{ padding: '7px 12px', borderRadius: 999, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--primary)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconPlus size={14} /> Add property
          </button>
        </div>
      )}

      {mode === 'add' && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <h2 style={H2}>{props.length ? 'Add another property' : 'Add your rental property'}</h2>
          <p style={{ ...SUB, marginBottom: 14 }}>Only the name is needed now; the rest makes the figures more useful and can be filled in later.</p>
          <PropertyForm initial={EMPTY_PROPERTY} onSave={saveProperty} saving={saving} onCancel={props.length ? () => setMode('view') : undefined} />
        </div>
      )}

      {property && mode !== 'add' && (
        <>
          {mode === 'edit' ? (
            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
              <h2 style={{ ...H2, marginBottom: 12 }}>Edit {property.name}</h2>
              <PropertyForm initial={property} onSave={saveProperty} saving={saving} onCancel={() => setMode('view')} onDelete={removeProperty} />
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              <div style={SUB}>
                {property.rent_amount ? <>Expected rent {nzd.format(property.rent_amount)} {property.rent_frequency === 'weekly' ? 'a week' : property.rent_frequency === 'fortnightly' ? 'a fortnight' : 'a month'}</> : 'No expected rent set'}
                {property.ownership_pct < 100 ? ` · You own ${property.ownership_pct}%` : ''}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => askFennec(`How is ${property.name} doing? Is the rent covering the mortgage and costs, and what could improve it?`)}
                  style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Ask Fennec</button>
                <button type="button" onClick={() => setMode('edit')}
                  style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <IconEdit size={14} /> Edit details
                </button>
              </div>
            </div>
          )}

          {/* Accounts */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h2 style={H2}>Accounts for {property.name}</h2>
            <p style={{ ...SUB, marginBottom: 12 }}>
              Tick the account(s) you use for this property, like the one rent goes into and the mortgage comes out of. Their transactions move here, out of your household budget and spending.
            </p>
            {linkable.length === 0 ? (
              <p style={SUB}>No accounts yet. <Link href="/app/settings" style={{ color: 'var(--primary)' }}>Connect your bank</Link> or add one on <Link href="/app/finance/accounts" style={{ color: 'var(--primary)' }}>Accounts</Link>.</p>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {linkable.map(a => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', padding: '6px 0' }}>
                    <input type="checkbox" checked={a.rental_property_id === property.id} onChange={e => linkAccount(a, e.target.checked)} />
                    <span style={{ fontWeight: a.rental_property_id === property.id ? 600 : 400 }}>{a.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text2)' }}>{a.type}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {propAccounts.length > 0 && (
            <>
              {/* Coverage */}
              {status?.late && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(240,84,84,0.35)', background: 'rgba(240,84,84,0.08)', marginBottom: 16, fontSize: 13, lineHeight: 1.55 }}>
                  <IconAlertTriangle size={18} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
                  <span><strong>Rent looks {status.daysLate} day{status.daysLate === 1 ? '' : 's'} late.</strong> The last payment was {fmtDate(status.last!)} and the next was due about {fmtDate(status.due!)}. Banks can take a day or two to share it, so check with your tenant or property manager if it doesn&apos;t turn up.</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
                <Tile label="Rent in (12 months)" value={nzd.format(rentIn)} note={status?.last ? `Last rent ${fmtDate(status.last)}` : 'No rent found yet'} />
                <Tile label="Mortgage" value={nzd.format(mortgageOut)} note={mortgageOut > 0 ? `Rent covers ${pct(rentIn / mortgageOut * 100)}` : 'Categorise repayments'} />
                <Tile label="Other costs" value={nzd.format(last12.expenses)} note="Rates, insurance, repairs and more" />
                <Tile label={net >= 0 ? 'Left over' : 'You topped up'} value={nzd.format(Math.abs(net))}
                  note={monthsOfData ? `About ${nzd.format(Math.abs(perMonth))} a month` : undefined} tone={net >= 0 ? 'good' : 'bad'} />
              </div>

              <div className="card" style={{ padding: 20, marginBottom: 20 }}>
                <h2 style={H2}>Is the rent covering it?</h2>
                <p style={{ ...SUB, marginBottom: 10 }}>
                  {allOut > 0
                    ? <>Over the last {monthsOfData < 12 ? `${monthsOfData} month${monthsOfData === 1 ? '' : 's'}` : '12 months'}, rent covered <strong style={{ color: 'var(--text)' }}>{mortgageOut > 0 ? pct(rentIn / mortgageOut * 100) : '–'}</strong> of the mortgage and <strong style={{ color: 'var(--text)' }}>{pct(rentIn / allOut * 100)}</strong> of all costs.{net < 0 ? ` The gap came from you, about ${nzd.format(-perMonth)} a month.` : ` About ${nzd.format(perMonth)} a month was left over.`}</>
                    : 'Categorise the transactions below to see how the rent compares with the mortgage and costs.'}
                  {last12.uncategorisedCount > 0 && <> <strong style={{ color: 'var(--text)' }}>{last12.uncategorisedCount} transaction{last12.uncategorisedCount === 1 ? '' : 's'}</strong> still need{last12.uncategorisedCount === 1 ? 's' : ''} a category, so these figures aren&apos;t complete.</>}
                </p>
                <CoverageChart data={chart} />
              </div>

              {/* Yield and equity */}
              <YieldCard property={property} rentIn={rentIn} costs={last12.expenses} monthsOfData={monthsOfData} today={today} onEdit={() => setMode('edit')} />

              {/* Tax year */}
              <TaxCard property={property} txs={propTxs} catMap={catMap} years={years} year={taxYear} setYear={setTaxYear}
                interestDraft={interestDraft} setInterestDraft={setInterestDraft} saveInterest={saveInterest} exportCsv={exportCsv} />

              {/* Transactions */}
              <div className="card" style={{ padding: 20, marginBottom: 20 }}>
                <h2 style={H2}>Transactions</h2>
                <p style={{ ...SUB, marginBottom: 12 }}>Give each one a rental category. Suggestions are guesses from the description and your expected rent; check them before accepting.</p>
                <RentalTransactions property={property} txs={propTxs} cats={cats} accountIds={propAccounts.map(a => a.id)}
                  onChanged={u => setTxs(prev => prev.map(t => (t.id in u ? { ...t, category_id: u[t.id] } : t)))} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function YieldCard({ property: p, rentIn, costs, monthsOfData, today, onEdit }: { property: RentalProperty; rentIn: number; costs: number; monthsOfData: number; today: string; onEdit: () => void }) {
  // A full year of actual rent if there is one; otherwise the expected rent.
  const annualRent = monthsOfData >= 12 ? rentIn : monthsOfData >= 3 ? rentIn / monthsOfData * 12 : monthlyRent(p) * 12
  const annualCosts = monthsOfData >= 3 ? costs / Math.min(12, monthsOfData) * 12 : 0
  const value = p.value ?? 0
  const loan = p.loan_balance ?? 0
  const brightLineEnd = p.purchase_date ? addYears(p.purchase_date, 2) : null
  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <h2 style={H2}>Yield and equity</h2>
      {!value ? (
        <p style={SUB}>Add the property&apos;s value (a recent CV or estimate) to see yield, equity and LVR. <button type="button" onClick={onEdit} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>Add it</button></p>
      ) : (
        <>
          <p style={{ ...SUB, marginBottom: 12 }}>Value {nzd.format(value)}{p.value_note ? ` (${p.value_note})` : ''}. Rent is {monthsOfData >= 12 ? 'the last 12 months' : monthsOfData >= 3 ? `the last ${monthsOfData} months, scaled to a year` : 'your expected rent for a year'}.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <Stat label="Gross yield" value={annualRent ? pct1(annualRent / value * 100) : '–'} note="Rent ÷ value" />
            <Stat label="Net yield" value={annualRent && monthsOfData >= 3 ? pct1((annualRent - annualCosts) / value * 100) : '–'} note="After costs, before the mortgage" />
            <Stat label="Equity" value={loan ? nzd.format(value - loan) : '–'} note={loan ? `Loan ${nzd.format(loan)}` : 'Add the loan balance'} />
            <Stat label="LVR" value={loan ? pct((loan / value) * 100) : '–'} note="Loan ÷ value" />
            {p.purchase_price ? <Stat label="Since you bought" value={`${value >= p.purchase_price ? '+' : '−'}${nzd.format(Math.abs(value - p.purchase_price))}`} note={`Paid ${nzd.format(p.purchase_price)}`} /> : null}
          </div>
        </>
      )}
      {brightLineEnd && today < brightLineEnd && (
        <p style={{ ...SUB, marginTop: 12 }}>
          Bright-line: selling before {fmtDate(brightLineEnd)} (two years after you bought) can make the gain taxable. General information; check with an accountant before selling.
        </p>
      )}
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{note}</div>}
    </div>
  )
}

function TaxCard({ property: p, txs, catMap, years, year, setYear, interestDraft, setInterestDraft, saveInterest, exportCsv }: {
  property: RentalProperty; txs: RentalTx[]; catMap: Map<string, RentalCategory>; years: number[]; year: number; setYear: (y: number) => void
  interestDraft: string; setInterestDraft: (s: string) => void; saveInterest: (y: number) => void; exportCsv: (y: number) => void
}) {
  const { from, to } = taxYearRange(year)
  const inYear = txs.filter(t => t.date >= from && t.date <= to)
  const t = totals(inYear, catMap)
  const interest = interestFor(p, year, t)
  const deductPct = interestDeductiblePct(year, p.new_build)
  const share = p.ownership_pct / 100
  const income = t.rent + t.otherIncome
  const lines = TAX_LINES.map(l => {
    if (l !== 'Interest') return { line: l, amount: Math.max(0, t.byLine[l] ?? 0) }
    return { line: l, amount: Math.round(interest.amount * (deductPct ?? 100) / 100) }
  })
  const expenses = lines.reduce((s, l) => s + l.amount, 0)
  const net = income - expenses
  const inProgress = year === taxYearOf(todayNZ())
  const ROW: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{ ...H2, marginBottom: 0 }}>Tax year summary</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Tax year"
            style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2, var(--surface))', color: 'var(--text)', fontSize: 13 }}>
            {years.map(y => <option key={y} value={y}>{taxYearLabel(y)}{y === taxYearOf(todayNZ()) ? ' (so far)' : ''}</option>)}
          </select>
          <button type="button" onClick={() => exportCsv(year)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconDownload size={14} /> CSV
          </button>
        </div>
      </div>
      <p style={{ ...SUB, marginBottom: 12 }}>
        1 April {year - 1} to 31 March {year}, grouped like the IR3R rental schedule{share < 1 ? `, with your ${p.ownership_pct}% share at the bottom` : ''}.
        {inProgress ? ' This year is still going.' : ''} {t.uncategorisedCount > 0 && <strong style={{ color: 'var(--text)' }}>{t.uncategorisedCount} uncategorised transaction{t.uncategorisedCount === 1 ? '' : 's'} aren&apos;t counted.</strong>}
      </p>

      <div style={{ ...ROW, fontWeight: 600 }}><span>Rental income</span><span>{nzd.format(income)}</span></div>
      {lines.map(l => (
        <div key={l.line} style={ROW}>
          <span style={{ color: 'var(--text2)' }}>
            {l.line}
            {l.line === 'Interest' && <> ({interest.source === 'entered' ? 'from your bank' : interest.source === 'transactions' ? 'from transactions' : interest.source === 'estimate' ? 'estimate' : 'not entered'}{deductPct !== null && deductPct < 100 ? `, ${deductPct}% deductible` : ''}{deductPct === null ? ', mixed rules this year' : ''})</>}
          </span>
          <span>{nzd.format(l.amount)}</span>
        </div>
      ))}
      <div style={{ ...ROW, fontWeight: 600 }}><span>Total expenses</span><span>{nzd.format(expenses)}</span></div>
      <div style={{ ...ROW, fontWeight: 700, borderBottom: 'none' }}>
        <span>{net >= 0 ? 'Net rental income' : 'Rental loss'}</span><span style={{ color: net >= 0 ? 'var(--text)' : 'var(--red)' }}>{nzd.format(Math.abs(net))}</span>
      </div>
      {share < 1 && <div style={{ ...ROW, borderBottom: 'none', color: 'var(--text2)' }}><span>Your {p.ownership_pct}% share</span><span>{net < 0 ? '−' : ''}{nzd.format(Math.abs(net * share))}</span></div>}

      <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--surface2, transparent)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Mortgage interest for {taxYearLabel(year)}</div>
        <p style={{ ...SUB, marginBottom: 8 }}>
          Your repayments mix interest and principal, and only interest can be claimed. Your bank&apos;s annual interest statement has the exact figure.
          {interest.source === 'estimate' && <> Until you enter it, Fennec estimates {nzd.format(interest.amount)} from your loan balance and rate.</>}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input inputMode="decimal" value={interestDraft} onChange={e => setInterestDraft(e.target.value)}
            placeholder={interest.source === 'entered' ? `Saved: ${interest.amount}` : 'Interest charged, e.g. 26400'}
            style={{ flex: '1 1 160px', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
          <button type="button" onClick={() => saveInterest(year)} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save</button>
        </div>
      </div>

      <p style={{ ...SUB, marginTop: 12 }}>
        Not included: mortgage repayments ({nzd.format(t.mortgage)}, which are principal plus interest) and improvements ({nzd.format(t.capital)}, capital rather than an expense).
        {net < 0 && ' A rental loss can\'t reduce tax on your other income; it carries forward to future rental income.'}
        {' '}Interest: {deductPct === null ? 'the rules changed during this year, so ask your accountant.' : deductPct === 100 ? 'fully deductible this year.' : `${deductPct}% deductible this year for loans from before 27 March 2021.`}
        {' '}General information to help you or your accountant with the IR3, not tax advice.
      </p>
    </div>
  )
}
