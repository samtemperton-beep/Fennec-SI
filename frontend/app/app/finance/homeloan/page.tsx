'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconHome, IconEdit, IconCheck, IconX, IconSearch, IconRefresh, IconExternalLink } from '@tabler/icons-react'
import { toast } from 'sonner'

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
}

const DEFAULT: LoanDetails = {
  address: '', balance: 0, interest_rate: 6.5, loan_term_years: 30,
  start_date: new Date().toISOString().split('T')[0], monthly_payment: null,
  rv: null, market_estimate: null,
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

interface PropertyData {
  rv: number | null
  land_value: number | null
  improvement_value: number | null
  legal_description: string | null
  area_sqm: number | null
  recent_sales: { address: string; price: number; date: string }[]
  source: string
}

export default function HomeLoanPage() {
  const [loan, setLoan] = useState<LoanDetails>(DEFAULT)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<LoanDetails>(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [propertyData, setPropertyData] = useState<PropertyData | null>(null)
  const [fetchingProperty, setFetchingProperty] = useState(false)
  const [hasLinzKey, setHasLinzKey] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    setHasLinzKey(!!user.user_metadata?.linz_key)

    // Load saved home loan details
    const { data } = await supabase.from('home_loan').select('*').eq('user_id', user.id).maybeSingle()

    // Pull live balance from fin_accounts (type LOAN, not business)
    const { data: loanAccounts } = await supabase
      .from('fin_accounts')
      .select('id, name, current_balance')
      .eq('type', 'LOAN')
      .eq('is_business', false)
      .order('current_balance')
      .limit(1)

    const liveBalance = loanAccounts?.[0] ? Math.abs(Number(loanAccounts[0].current_balance)) : null

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

  async function fetchPropertyData() {
    if (!loan.address) { toast.error('Enter a property address first'); return }
    setFetchingProperty(true)
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || ''
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`${API}/api/finance/property?address=${encodeURIComponent(loan.address)}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const result = await r.json()
      if (!r.ok) throw new Error(result.error || 'Failed to fetch property data')
      setPropertyData(result)
      if (result.rv) {
        const updated = { ...loan, rv: result.rv }
        setLoan(updated)
        setDraft(updated)
      }
      toast.success('Property data loaded')
    } catch (e: any) {
      toast.error(e.message)
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
            {inp('Rateable Value (RV)', 'rv', 'number', '$')}
            {inp('Market Estimate', 'market_estimate', 'number', '$')}
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Current Balance', value: currency.format(loan.balance), sub: 'Outstanding principal' },
          { label: 'Monthly Payment', value: currencyExact.format(monthlyPayment), sub: `at ${loan.interest_rate}% p.a.` },
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Property value */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15 }}>Property Value</h2>
            {hasLinzKey ? (
              <button onClick={fetchPropertyData} disabled={fetchingProperty}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer' }}>
                {fetchingProperty ? <LoadingSpinner size={12} /> : <IconRefresh size={12} />} Refresh LINZ
              </button>
            ) : (
              <a href="/app/settings" style={{ fontSize: 11, color: 'var(--primary)', textDecoration: 'none' }}>Add LINZ key →</a>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
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

        {/* Area sales */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Recent Area Sales</h2>
          {propertyData?.recent_sales?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {propertyData.recent_sales.slice(0, 5).map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{s.address}</p>
                    <p style={{ fontSize: 11, color: 'var(--text3)' }}>{new Date(s.date).toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' })}</p>
                  </div>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 13, color: 'var(--text)', flexShrink: 0, marginLeft: 8 }}>{currency.format(s.price)}</span>
                </div>
              ))}
              {propertyData.source && <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>Source: {propertyData.source}</p>}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <IconSearch size={24} style={{ color: 'var(--text3)', marginBottom: 8 }} />
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>{hasLinzKey ? 'Click "Refresh LINZ" to load area sales' : 'Add your LINZ API key in Settings to see area sales'}</p>
              <a href="https://data.linz.govt.nz" target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 11, color: 'var(--primary)', textDecoration: 'none' }}>
                Get a LINZ API key <IconExternalLink size={11} />
              </a>
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
