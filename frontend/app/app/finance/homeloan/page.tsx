'use client'
export const dynamic = 'force-dynamic'
import { localDate } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconHome, IconEdit, IconCheck, IconX, IconSearch, IconRefresh } from '@tabler/icons-react'
import { toast } from 'sonner'
import { RatesNoticeUpload, type RatesNoticeValues } from '@/components/finance/RatesNoticeUpload'

const supabase = createClient()
const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
const currencyExact = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })

interface LoanDetails {
  id?: string
  address: string
  balance: number
  interest_rate: number
  loan_term_years: number
  start_date: string
  monthly_payment: number | null
  rv: number | null
  market_estimate: number | null
  original_drawdown: number | null
  purchase_price: number | null
}

const DEFAULT: LoanDetails = {
  address: '', balance: 0, interest_rate: 6.5, loan_term_years: 30,
  start_date: localDate(), monthly_payment: null,
  rv: null, market_estimate: null, original_drawdown: null, purchase_price: null,
}

function calcAmortisation(balance: number, annualRate: number, termYears: number, startDate: string) {
  const r = annualRate / 100 / 12
  const n = termYears * 12
  if (r === 0) return { monthlyPayment: balance / n, totalInterest: 0, payoffDate: new Date(), schedule: [] }

  const monthlyPayment = balance * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
  let remaining = balance
  let totalInterest = 0
  const schedule: { month: number; payment: number; principal: number; interest: number; remaining: number }[] = []
  const start = new Date(startDate)

  for (let i = 1; i <= n && remaining > 0.01; i++) {
    const interestPayment = remaining * r
    const principalPayment = Math.min(monthlyPayment - interestPayment, remaining)
    remaining -= principalPayment
    totalInterest += interestPayment
    if (i <= 360) schedule.push({ month: i, payment: monthlyPayment, principal: principalPayment, interest: interestPayment, remaining: Math.max(0, remaining) })
  }

  const payoffDate = new Date(start)
  payoffDate.setMonth(payoffDate.getMonth() + n)

  return { monthlyPayment, totalInterest, payoffDate, schedule }
}

function YearsToPayoff({ startDate, payoffDate }: { startDate: string; payoffDate: Date }) {
  const start = new Date(startDate)
  const months = (payoffDate.getFullYear() - start.getFullYear()) * 12 + (payoffDate.getMonth() - start.getMonth())
  const years = Math.floor(months / 12)
  const rem = months % 12
  return <>{years}y {rem}m</>
}

// From LINZ (backend/src/services/linz.ts). LINZ doesn't publish sales or values.
interface PropertyData {
  full_address: string
  suburb: string | null
  town: string | null
  territorial_authority: string | null
  legal_description: string | null
  title_no: string | null
  area_sqm: number | null
  valuation_reference: string | null
  valuation: {
    capital_value: number | null
    land_value: number | null
    improvements_value: number | null
    valuation_date: string | null
    bedrooms: number | null
    floor_area_sqm: number | null
  } | null
}

export default function HomeLoanPage() {
  const [loan, setLoan] = useState<LoanDetails>(DEFAULT)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<LoanDetails>(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [propertyData, setPropertyData] = useState<PropertyData | null>(null)
  const [fetchingProperty, setFetchingProperty] = useState(false)
  const [propertyError, setPropertyError] = useState('')
  const [notice, setNotice] = useState<RatesNoticeValues | null>(null)
  const [actualPayment, setActualPayment] = useState<{ amount: number; frequency: string } | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Load saved home loan details
    const { data } = await supabase.from('home_loan').select('*').eq('user_id', user.id).maybeSingle()

    // Pull live balance + account id from fin_accounts (type LOAN, not business)
    const { data: loanAccounts } = await supabase
      .from('fin_accounts')
      .select('id, name, current_balance')
      .eq('type', 'LOAN')
      .eq('is_business', false)
      .order('current_balance')
      .limit(1)

    const loanAccount = loanAccounts?.[0]
    const liveBalance = loanAccount ? Math.abs(Number(loanAccount.current_balance)) : null

    // Detect actual payment amount + frequency from recent transactions
    if (loanAccount) {
      const { data: txs } = await supabase
        .from('fin_transactions')
        .select('amount, date')
        .eq('account_id', loanAccount.id)
        .lt('amount', 0)
        .order('date', { ascending: false })
        .limit(20)

      if (txs && txs.length >= 2) {
        // Find the most common negative amount (the repayment)
        const amounts = txs.map(t => Math.abs(Number(t.amount)))
        const freq: Record<string, number> = {}
        amounts.forEach(a => { const k = a.toFixed(2); freq[k] = (freq[k] || 0) + 1 })
        const topAmount = parseFloat(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0])

        // Detect frequency from date gaps
        const dates = txs.filter(t => Math.abs(Number(t.amount)).toFixed(2) === topAmount.toFixed(2))
          .map(t => new Date(t.date).getTime()).sort((a, b) => b - a)
        const gaps = dates.slice(0, -1).map((d, i) => Math.round((d - dates[i + 1]) / 86400000))
        const avgGap = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 30
        const frequency = avgGap < 10 ? 'weekly' : avgGap < 20 ? 'fortnightly' : 'monthly'

        setActualPayment({ amount: topAmount, frequency })
      }
    }

    if (data) {
      const merged = { ...data, ...(liveBalance !== null ? { balance: liveBalance } : {}) }
      setLoan(merged)
      setDraft(merged)
    } else if (liveBalance !== null) {
      const merged = { ...DEFAULT, balance: liveBalance }
      setLoan(merged)
      setDraft(merged)
    }
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const payload = { ...draft, user_id: user.id }
    const { error } = loan.id
      ? await supabase.from('home_loan').update(payload).eq('id', loan.id)
      : await supabase.from('home_loan').insert(payload).select().single()

    if (error) { toast.error(error.message); setSaving(false); return }
    setLoan(draft)
    setEditing(false)
    toast.success('Loan details saved')
    setSaving(false)
  }

  // Saves the council's capital value as the loan's rateable value.
  async function applyCouncilValue(cv: number) {
    if (!loan.id) return
    const { error } = await supabase.from('home_loan').update({ rv: cv }).eq('id', loan.id)
    if (error) { toast.error(error.message); return }
    setLoan(l => ({ ...l, rv: cv }))
    setDraft(d => ({ ...d, rv: cv }))
    toast.success('Rateable value updated')
  }

  async function fetchPropertyData() {
    if (!loan.address) { toast.error('Add the property address in Edit first'); return }
    setFetchingProperty(true)
    setPropertyError('')
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || ''
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`${API}/api/finance/property?address=${encodeURIComponent(loan.address)}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const result = await r.json()
      if (!r.ok) throw new Error(result.error || "Couldn't look up the property")
      setPropertyData(result)
    } catch (e: any) {
      setPropertyData(null)
      setPropertyError(e.message)
    }
    setFetchingProperty(false)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><LoadingSpinner size={32} /></div>

  const { monthlyPayment, totalInterest, payoffDate, schedule } = calcAmortisation(
    loan.balance, loan.interest_rate, loan.loan_term_years, loan.start_date
  )

  const now = new Date()
  const elapsedMonths = Math.max(0, (now.getFullYear() - new Date(loan.start_date).getFullYear()) * 12 + (now.getMonth() - new Date(loan.start_date).getMonth()))
  const paidToDate = elapsedMonths > 0 && schedule.length > 0
    ? schedule.slice(0, Math.min(elapsedMonths, schedule.length))
    : []
  const interestPaidToDate = paidToDate.reduce((s, m) => s + m.interest, 0)
  const principalPaidToDate = paidToDate.reduce((s, m) => s + m.principal, 0)
  const progressPct = loan.balance > 0 ? Math.min(100, (principalPaidToDate / (loan.balance + principalPaidToDate)) * 100) : 0

  const equity = loan.market_estimate ? loan.market_estimate - loan.balance : null
  const lvr = loan.market_estimate ? (loan.balance / loan.market_estimate) * 100 : null

  // The council valuation: from LINZ's open valuation roll where the council is
  // in it, otherwise read from a rates notice the person uploads.
  const rollValue = propertyData?.valuation?.capital_value ? propertyData.valuation : null
  const shown = rollValue
    ? { ...rollValue, source: 'your council’s valuation roll (via LINZ)' }
    : notice?.capital_value ? { ...notice, source: `your rates notice${notice.council ? ` (${notice.council})` : ''}` } : null
  // "12 Smith" from "12 Smith Street, Ponsonby": enough to spot a notice for another property.
  const streetKey = (a: string | null) => (a || '').toLowerCase().match(/\d+[a-z]?\s+[a-z]+/)?.[0] ?? null
  const otherProperty = !rollValue && notice?.address && streetKey(loan.address) && streetKey(notice.address) !== streetKey(loan.address)
  const valuationBox = shown?.capital_value ? (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>Council rating valuation (CV)</span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 18 }}>{currency.format(shown.capital_value)}</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
        {[shown.land_value && `Land ${currency.format(shown.land_value)}`, shown.improvements_value && `Buildings ${currency.format(shown.improvements_value)}`,
          shown.valuation_date && `valued ${new Date(shown.valuation_date).toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' })}`].filter(Boolean).join(' · ')}
      </p>
      <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>From {shown.source}</p>
      {otherProperty && (
        <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 6 }}>This notice is for {notice!.address}, which doesn&apos;t look like the address on your loan.</p>
      )}
      {loan.id && loan.rv !== shown.capital_value && (
        <button onClick={() => applyCouncilValue(shown.capital_value!)}
          style={{ marginTop: 8, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--primary)', background: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Use as rateable value
        </button>
      )}
    </div>
  ) : (
    <div style={{ background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.5 }}>
        {propertyData
          ? 'Your council doesn’t publish its valuations as open data. Upload your latest rates notice or revaluation letter and Fennec will read the CV off it.'
          : 'Upload your latest rates notice or revaluation letter and Fennec will read your council valuation (CV) off it.'}
      </p>
      <RatesNoticeUpload onRead={setNotice} />
      <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>PDF or photo. It&apos;s read once and not kept, and counts as one AI use.</p>
    </div>
  )

  const inp = (label: string, field: keyof LoanDetails, type = 'text', prefix?: string) => (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        {prefix && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text2)', fontSize: 13 }}>{prefix}</span>}
        <input
          type={type}
          value={draft[field] as any ?? ''}
          onChange={e => setDraft(d => ({ ...d, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
          style={{ width: '100%', padding: `10px 12px 10px ${prefix ? '22px' : '12px'}`, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>
    </div>
  )

  return (
    <div style={{ padding: 28, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Home Loan</h1>
          {loan.address && <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>{loan.address}</p>}
        </div>
        {!editing ? (
          <button onClick={() => { setDraft(loan); setEditing(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <IconEdit size={14} /> Edit Details
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditing(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <IconX size={14} /> Cancel
            </button>
            <button onClick={save} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              {saving ? <LoadingSpinner size={14} /> : <IconCheck size={14} />} Save
            </button>
          </div>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="card" style={{ marginBottom: 24, padding: 24 }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Loan Details</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {inp('Property Address', 'address')}
            {inp('Current Balance', 'balance', 'number', '$')}
            {inp('Interest Rate (%)', 'interest_rate', 'number')}
            {inp('Loan Term (years)', 'loan_term_years', 'number')}
            {inp('Loan Start Date', 'start_date', 'date')}
            {inp('Original Drawdown', 'original_drawdown', 'number', '$')}
            {inp('Purchase Price', 'purchase_price', 'number', '$')}
            {inp('Rateable Value (RV)', 'rv', 'number', '$')}
            {inp('Market Estimate', 'market_estimate', 'number', '$')}
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Current Balance', value: currency.format(loan.balance), sub: 'Outstanding principal' },
          { label: actualPayment ? `${actualPayment.frequency.charAt(0).toUpperCase() + actualPayment.frequency.slice(1)} Payment` : 'Monthly Payment', value: actualPayment ? currencyExact.format(actualPayment.amount) : currencyExact.format(monthlyPayment), sub: actualPayment ? `actual from transactions` : `calculated at ${loan.interest_rate}% p.a.` },
          { label: 'Total Interest', value: currency.format(totalInterest), sub: 'Over full term' },
          { label: 'Payoff Date', value: payoffDate.toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' }), sub: <YearsToPayoff startDate={loan.start_date} payoffDate={payoffDate} /> },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: 18 }}>
            <p style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k.label}</p>
            <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 20, color: 'var(--text)' }}>{k.value}</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>Loan Progress</span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{progressPct.toFixed(1)}% paid off</span>
        </div>
        <div style={{ height: 10, background: 'var(--surface2)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--primary)', borderRadius: 6, transition: 'width 0.5s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Principal paid: {currency.format(principalPaidToDate)}</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Interest paid: {currency.format(interestPaidToDate)}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 24 }}>
        {/* Property value */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Property Value</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Purchase Price', value: loan.purchase_price },
              { label: 'Original Drawdown', value: loan.original_drawdown },
              { label: 'Rateable Value (RV)', value: loan.rv },
              { label: 'Market Estimate', value: loan.market_estimate },
              { label: 'Equity', value: equity },
              { label: 'Loan-to-Value Ratio', value: lvr !== null ? `${lvr.toFixed(1)}%` : null, raw: true },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{r.label}</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 14, color: r.value !== null && r.label === 'Equity' ? 'var(--green)' : 'var(--text)' }}>
                  {r.value !== null ? (r.raw ? r.value : currency.format(r.value as number)) : <span style={{ color: 'var(--text3)', fontFamily: 'inherit', fontWeight: 400 }}>—</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Property details from LINZ */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15 }}>Property Details</h2>
            <button onClick={fetchPropertyData} disabled={fetchingProperty}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {fetchingProperty ? <LoadingSpinner size={12} /> : propertyData ? <IconRefresh size={12} /> : <IconSearch size={12} />} {propertyData ? 'Refresh' : 'Look up property'}
            </button>
          </div>
          {valuationBox}
          {propertyData ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                { label: 'Address', value: [propertyData.full_address, propertyData.suburb, propertyData.town].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') },
                { label: 'Council', value: propertyData.territorial_authority },
                { label: 'Legal description', value: propertyData.legal_description },
                { label: 'Title', value: propertyData.title_no },
                { label: 'Land area', value: propertyData.area_sqm ? `${propertyData.area_sqm.toLocaleString('en-NZ')} m²` : null },
                ...(propertyData.valuation?.bedrooms || propertyData.valuation?.floor_area_sqm ? [{
                  label: 'Home',
                  value: [propertyData.valuation.bedrooms && `${propertyData.valuation.bedrooms} bedrooms`, propertyData.valuation.floor_area_sqm && `${propertyData.valuation.floor_area_sqm} m² floor area`].filter(Boolean).join(', '),
                }] : []),
                { label: 'Valuation reference', value: propertyData.valuation_reference },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)', flexShrink: 0 }}>{r.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: r.value ? 'var(--text)' : 'var(--text3)', textAlign: 'right', overflowWrap: 'anywhere' }}>{r.value || '—'}</span>
                </div>
              ))}
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
                Property details from LINZ. A rating valuation is set by your council every three years and isn&apos;t a market valuation.
              </p>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <IconSearch size={24} style={{ color: 'var(--text3)', marginBottom: 8 }} />
              <p style={{ fontSize: 13, color: propertyError ? 'var(--red)' : 'var(--text2)' }}>
                {propertyError || (loan.address
                  ? 'Look up your property to see its legal description, title, land area and council valuation.'
                  : 'Add your property address in Edit, then look it up here.')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Amortisation table — first 5 years */}
      <div className="card" style={{ padding: 20 }}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Amortisation Schedule (first 5 years)</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Year', 'Annual Payment', 'Principal', 'Interest', 'Balance'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'Syne, sans-serif', fontWeight: 600, color: 'var(--text2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.min(5, loan.loan_term_years) }, (_, yi) => {
                const monthsInYear = schedule.slice(yi * 12, yi * 12 + 12)
                if (!monthsInYear.length) return null
                const annualPrincipal = monthsInYear.reduce((s, m) => s + m.principal, 0)
                const annualInterest = monthsInYear.reduce((s, m) => s + m.interest, 0)
                const endBalance = monthsInYear[monthsInYear.length - 1].remaining
                return (
                  <tr key={yi} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>Year {yi + 1}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>{currency.format(annualPrincipal + annualInterest)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', color: 'var(--green)' }}>{currency.format(annualPrincipal)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', color: 'var(--red)' }}>{currency.format(annualInterest)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{currency.format(endBalance)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
