'use client'
export const dynamic = 'force-dynamic'
import { localDate } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconHome, IconEdit, IconCheck, IconX, IconSearch, IconRefresh } from '@tabler/icons-react'
import { toast } from 'sonner'
import { RatesNoticeUpload, type RatesNoticeValues } from '@/components/finance/RatesNoticeUpload'
import { detectRepayment, summariseInterest, projectPayoff, scheduledMonthly, type LoanTx } from '@/lib/homeloan'
import { api } from '@/lib/api'
import { Secret } from '@/components/shared/Secret'

const supabase = createClient()

async function apiGet(path: string) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}${path}`, {
    headers: { Authorization: `Bearer ${session?.access_token}` },
  })
  const result = await r.json()
  if (!r.ok) throw new Error(result.error || "Couldn't look up the property")
  return result
}

const savedOn = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : null
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
  /** When it was looked up (saved on the server). */
  saved_at?: string
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
  const [loanTxs, setLoanTxs] = useState<LoanTx[]>([])
  // The address is stored encrypted: the page gets only a hint, and the address
  // itself when the person taps the eye or edits it.
  const [addressHint, setAddressHint] = useState<string | null>(null)
  const [addressVersion, setAddressVersion] = useState(0) // remounts the hidden address after a save
  const [addressEdited, setAddressEdited] = useState(false)
  const [loadingAddress, setLoadingAddress] = useState(false)

  useEffect(() => { load() }, [])

  async function loadAddressHint() {
    try {
      const { fields } = await api.getPrivateFields()
      setAddressHint(fields.home_address.hint)
      setAddressVersion(v => v + 1)
    } catch { setAddressHint(null) }
  }

  // The last lookup and rates notice, saved by the server, so neither has to be redone each visit.
  async function loadSavedProperty() {
    try {
      const saved = await apiGet('/api/finance/property/saved')
      if (saved.property) setPropertyData({ ...saved.property, saved_at: saved.property_at })
      if (saved.notice) setNotice({ ...saved.notice, saved_at: saved.notice_at })
    } catch { /* nothing saved yet; the buttons still work */ }
  }

  async function showSavedAddress() {
    setLoadingAddress(true)
    try {
      const { values } = await api.revealPrivateFields(['home_address'])
      setDraft(d => ({ ...d, address: values.home_address ?? '' }))
      setAddressEdited(true)
    } catch (e: any) { toast.error(e.message) }
    setLoadingAddress(false)
  }

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
      .eq('is_rental', false)
      .order('current_balance')
      .limit(1)

    const loanAccount = loanAccounts?.[0]
    const liveBalance = loanAccount ? Math.abs(Number(loanAccount.current_balance)) : null

    // The loan account's own transactions: repayments (credits) and interest charges.
    if (loanAccount) {
      const { data: txs } = await supabase
        .from('fin_transactions')
        .select('amount, date, description')
        .eq('account_id', loanAccount.id)
        .order('date', { ascending: false })
        .limit(400)
      setLoanTxs((txs ?? []).map(t => ({ amount: Number(t.amount), date: t.date, description: t.description })))
    }

    if (data) {
      loadAddressHint()
      loadSavedProperty()
      const merged = { ...data, address: '', ...(liveBalance !== null ? { balance: liveBalance } : {}) }
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

    // The address goes to the server separately, to be encrypted.
    // property_details is the server's (encrypted) saved lookup; writing back the
    // copy loaded with the page would undo a newer lookup.
    const { address, property_details, ...rest } = draft as LoanDetails & { property_details?: unknown }
    const payload = { ...rest, user_id: user.id }
    const { data: row, error } = loan.id
      ? await supabase.from('home_loan').update(payload).eq('id', loan.id).select('id').single()
      : await supabase.from('home_loan').insert(payload).select('id').single()

    if (error) { toast.error(error.message); setSaving(false); return }
    if (addressEdited) {
      try {
        await api.savePrivateFields({ home_address: address })
        await loadAddressHint()
      } catch (e: any) { toast.error(`Loan saved, but not the address: ${e.message}`) }
    }
    setLoan({ ...draft, id: row?.id ?? loan.id, address: '' })
    // A new address: the saved lookup and notice were for the old one (the server clears them too).
    if (addressEdited) { setPropertyData(null); setNotice(null) }
    setAddressEdited(false)
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
    if (!addressHint) { toast.error('Add the property address in Edit first'); return }
    setFetchingProperty(true)
    setPropertyError('')
    try {
      // The server looks up the address saved on the loan, and saves the result.
      setPropertyData(await apiGet('/api/finance/property'))
    } catch (e: any) {
      setPropertyData(null)
      setPropertyError(e.message)
    }
    setFetchingProperty(false)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><LoadingSpinner size={32} /></div>

  // Repayments and interest from the loan account where there's enough history;
  // otherwise the scheduled repayment over the rest of the term.
  const repayment = detectRepayment(loanTxs)
  const interest = summariseInterest(loanTxs, loan.balance)
  const rate = interest.impliedRate ?? loan.interest_rate
  const rateNote = interest.impliedRate ? `${rate}% p.a. from your bank’s interest charges` : `${rate}% p.a. from your loan details`
  const now = new Date()
  const start = new Date(loan.start_date)
  const elapsedMonths = Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()))
  const remainingTermMonths = Math.max(1, loan.loan_term_years * 12 - elapsedMonths)
  const payment = repayment
    ? { amount: repayment.amount, perYear: repayment.perYear, label: `${repayment.frequency[0].toUpperCase()}${repayment.frequency.slice(1)} repayment`, sub: `≈ ${currency.format(repayment.monthly)} a month · from your transactions` }
    : { amount: loan.monthly_payment || scheduledMonthly(loan.balance, rate, remainingTermMonths), perYear: 12, label: 'Monthly repayment', sub: loan.monthly_payment ? 'from your loan details' : `estimated to clear the loan by the end of its term` }
  const projection = projectPayoff(loan.balance, rate, payment.amount, payment.perYear, now)

  // Progress: what's been repaid of the original loan.
  const principalPaid = loan.original_drawdown ? Math.max(0, loan.original_drawdown - loan.balance) : null
  const progressPct = loan.original_drawdown && principalPaid !== null ? Math.min(100, (principalPaid / loan.original_drawdown) * 100) : null

  // Equity and LVR against the market estimate, or the council valuation if there isn't one.
  const valueBasis = loan.market_estimate || loan.rv || null
  const valueNote = loan.market_estimate ? '' : loan.rv ? ' (using CV)' : ''
  const equity = valueBasis ? valueBasis - loan.balance : null
  const lvr = valueBasis ? (loan.balance / valueBasis) * 100 : null

  // The council valuation: from LINZ's open valuation roll where the council is
  // in it, otherwise read from a rates notice the person uploads.
  const rollValue = propertyData?.valuation?.capital_value ? propertyData.valuation : null
  const shown = rollValue
    ? { ...rollValue, source: 'your council’s valuation roll (via LINZ)' }
    : notice?.capital_value ? { ...notice, source: `your rates notice${notice.council ? ` (${notice.council})` : ''}` } : null
  // The server compares the notice's address with the saved one.
  const otherProperty = !rollValue && notice?.matches_home === false
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
      <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
        From {shown.source}{!rollValue && savedOn(notice?.saved_at) ? `, read ${savedOn(notice?.saved_at)}` : ''}
      </p>
      {otherProperty && (
        <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 6 }}>This notice doesn&apos;t look like it&apos;s for the address on your loan.</p>
      )}
      {loan.id && loan.rv !== shown.capital_value && (
        <button onClick={() => applyCouncilValue(shown.capital_value!)}
          style={{ marginTop: 8, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--primary)', background: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Use as rateable value
        </button>
      )}
      {!rollValue && (
        <div style={{ marginTop: 10 }}>
          <RatesNoticeUpload onRead={setNotice} label="Upload a newer notice" />
        </div>
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
      <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>PDF or photo. The file isn&apos;t kept, only the values read off it. Counts as one AI use.</p>
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
          {addressHint && <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}><Secret key={addressVersion} field="home_address" hint={addressHint} /></p>}
        </div>
        {!editing ? (
          <button onClick={() => { setDraft({ ...loan, address: '' }); setAddressEdited(false); setEditing(true) }}
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
            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
                Property Address
                {addressHint && !addressEdited && (
                  <button type="button" onClick={showSavedAddress} disabled={loadingAddress}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontSize: 12, cursor: 'pointer' }}>
                    {loadingAddress ? 'Opening…' : 'Show saved'}
                  </button>
                )}
              </label>
              <input
                value={draft.address}
                onChange={e => { setAddressEdited(true); setDraft(d => ({ ...d, address: e.target.value })) }}
                placeholder={addressHint && !addressEdited ? `Saved (${addressHint}). Type to replace.` : '12 Smith Street, Ponsonby'}
                autoComplete="off"
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Stored encrypted.</p>
            </div>
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
          { label: 'Current Balance', value: currency.format(loan.balance), sub: rateNote },
          { label: payment.label, value: currencyExact.format(payment.amount), sub: payment.sub },
          { label: 'Interest to Go', value: projection ? currency.format(projection.totalInterest) : '—', sub: projection ? 'if you keep repaying this much' : 'repayment doesn’t cover the interest' },
          { label: 'Payoff Date', value: projection ? projection.payoffDate.toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' }) : '—', sub: projection ? `${projection.years}y ${projection.months}m from now` : 'add your repayment in Edit' },
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
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{progressPct !== null ? `${progressPct.toFixed(1)}% paid off` : 'Add your original drawdown in Edit'}</span>
        </div>
        <div style={{ height: 10, background: 'var(--surface2)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct ?? 0}%`, background: 'var(--primary)', borderRadius: 6, transition: 'width 0.5s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {principalPaid !== null ? `Repaid: ${currency.format(principalPaid)} of ${currency.format(loan.original_drawdown!)}` : ''}
          </span>
          {interest.total > 0 && interest.since && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              Interest charged since {new Date(interest.since).toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' })}: {currency.format(interest.total)}
            </span>
          )}
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
              { label: `Equity${valueNote}`, value: equity },
              { label: `Loan-to-Value Ratio${valueNote}`, value: lvr !== null ? `${lvr.toFixed(1)}%` : null, raw: true },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{r.label}</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 14, color: r.value !== null && r.label.startsWith('Equity') ? 'var(--green)' : 'var(--text)' }}>
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
                { label: 'Address', value: [propertyData.full_address, propertyData.suburb, propertyData.town].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', '), secret: true },
                { label: 'Council', value: propertyData.territorial_authority },
                { label: 'Legal description', value: propertyData.legal_description, secret: true },
                { label: 'Title', value: propertyData.title_no, secret: true },
                { label: 'Land area', value: propertyData.area_sqm ? `${propertyData.area_sqm.toLocaleString('en-NZ')} m²` : null },
                ...(propertyData.valuation?.bedrooms || propertyData.valuation?.floor_area_sqm ? [{
                  label: 'Home',
                  value: [propertyData.valuation.bedrooms && `${propertyData.valuation.bedrooms} bedrooms`, propertyData.valuation.floor_area_sqm && `${propertyData.valuation.floor_area_sqm} m² floor area`].filter(Boolean).join(', '),
                }] : []),
                { label: 'Valuation reference', value: propertyData.valuation_reference, secret: true },
              ].map((r: { label: string; value: string | null; secret?: boolean }) => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)', flexShrink: 0 }}>{r.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: r.value ? 'var(--text)' : 'var(--text3)', textAlign: 'right', overflowWrap: 'anywhere' }}>{r.secret ? <Secret value={r.value} /> : r.value || '—'}</span>
                </div>
              ))}
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
                Property details from LINZ{savedOn(propertyData.saved_at) ? `, looked up ${savedOn(propertyData.saved_at)}` : ''}. A rating valuation is set by your council every three years and isn&apos;t a market valuation.
              </p>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <IconSearch size={24} style={{ color: 'var(--text3)', marginBottom: 8 }} />
              <p style={{ fontSize: 13, color: propertyError ? 'var(--red)' : 'var(--text2)' }}>
                {propertyError || (addressHint
                  ? 'Look up your property to see its legal description, title, land area and council valuation.'
                  : 'Add your property address in Edit, then look it up here.')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* The next five years at the current repayment */}
      {projection && <div className="card" style={{ padding: 20 }}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>The Next 5 Years</h2>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>If you keep repaying {currencyExact.format(payment.amount)} {repayment?.frequency ?? 'monthly'} at {rate}% p.a.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Year', 'Repaid', 'Principal', 'Interest', 'Balance'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'Syne, sans-serif', fontWeight: 600, color: 'var(--text2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projection.byYear.slice(0, 5).map(y => (
                <tr key={y.year} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>{now.getFullYear() + y.year - 1}–{String(now.getFullYear() + y.year).slice(2)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>{currency.format(y.paid)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', color: 'var(--green)' }}>{currency.format(y.principal)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', color: 'var(--red)' }}>{currency.format(y.interest)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{currency.format(y.endBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  )
}
