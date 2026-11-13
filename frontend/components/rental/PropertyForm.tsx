'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import type { RentalProperty, RentFrequency } from '@/lib/rental'

// Add or edit a rental property: the figures Fennec can't read from a bank.

export type PropertyDraft = Omit<RentalProperty, 'id' | 'interest_by_year'>

export const EMPTY_PROPERTY: PropertyDraft = {
  name: '', value: null, value_note: null, purchase_price: null, purchase_date: null,
  loan_balance: null, interest_rate: null, rent_amount: null, rent_frequency: 'weekly',
  ownership_pct: 100, new_build: false,
}

const LABEL: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }
const INPUT: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2, var(--surface))', color: 'var(--text)', fontSize: 14 }
/** The saved Home Loan (home_loan table), to fill a property in from. */
export interface HomeLoanFill {
  balance: number | null; interest_rate: number | null; start_date: string | null
  rv: number | null; market_estimate: number | null; purchase_price: number | null
}

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[$,\s]/g, '')))

export function PropertyForm({ initial, onSave, onCancel, onDelete, saving, homeLoan }: {
  initial: PropertyDraft
  homeLoan?: HomeLoanFill | null
  onSave: (p: PropertyDraft) => void
  onCancel?: () => void
  onDelete?: () => void
  saving?: boolean
}) {
  const [d, setD] = useState<PropertyDraft>(initial)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Bumped when fields are filled in for you, so the inputs show the new values.
  const [ver, setVer] = useState(0)

  // Only empty boxes are filled, so nothing typed is overwritten.
  const fills = (() => {
    if (!homeLoan) return null
    const f: Partial<PropertyDraft> = {}
    const gap = (k: keyof PropertyDraft) => d[k] === null || d[k] === undefined || d[k] === ''
    if (gap('loan_balance') && homeLoan.balance) f.loan_balance = Number(homeLoan.balance)
    if (gap('interest_rate') && homeLoan.interest_rate) f.interest_rate = Number(homeLoan.interest_rate)
    const v = homeLoan.market_estimate || homeLoan.rv
    if (gap('value') && v) { f.value = Number(v); if (gap('value_note')) f.value_note = homeLoan.market_estimate ? 'Market estimate (Home Loan)' : 'CV (Home Loan)' }
    if (gap('purchase_price') && homeLoan.purchase_price) f.purchase_price = Number(homeLoan.purchase_price)
    if (gap('purchase_date') && homeLoan.start_date) f.purchase_date = homeLoan.start_date.slice(0, 10)
    return Object.keys(f).length ? f : null
  })()
  function fillFromHomeLoan() {
    if (!fills) return
    setD(x => ({ ...x, ...fills }))
    setVer(v => v + 1)
    toast.success(fills.purchase_date ? "Filled in from Home Loan. The purchase date is the loan's start date; change it if you bought on a different day." : 'Filled in from Home Loan')
  }
  const set = <K extends keyof PropertyDraft>(k: K, v: PropertyDraft[K]) => setD(x => ({ ...x, [k]: v }))
  const numField = (k: 'value' | 'purchase_price' | 'loan_balance' | 'interest_rate' | 'rent_amount' | 'ownership_pct', label: string, placeholder?: string, hint?: string) => (
    <div>
      <label style={LABEL}>{label}</label>
      <input key={`${k}-${ver}`} inputMode="decimal" style={INPUT} placeholder={placeholder} defaultValue={d[k] ?? ''}
        onChange={e => set(k, num(e.target.value) as any)} />
      {hint && <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>{hint}</p>}
    </div>
  )
  const valid = d.name.trim().length > 0 && [d.value, d.purchase_price, d.loan_balance, d.interest_rate, d.rent_amount].every(v => v === null || Number.isFinite(v))
    && d.ownership_pct > 0 && d.ownership_pct <= 100

  return (
    <form onSubmit={e => { e.preventDefault(); if (valid) onSave({ ...d, name: d.name.trim() }) }}
      style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
      {fills && (
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--primary)', background: 'var(--primary-light, transparent)', fontSize: 13 }}>
          <span style={{ flex: '1 1 240px' }}>Is this the property on your Home Loan page? Fennec can fill in its {[
            fills.loan_balance !== undefined && 'loan balance', fills.interest_rate !== undefined && 'rate', fills.value !== undefined && 'value',
            fills.purchase_price !== undefined && 'purchase price', fills.purchase_date !== undefined && 'start date',
          ].filter(Boolean).join(', ')}.</span>
          <button type="button" onClick={fillFromHomeLoan}
            style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Fill in from Home Loan
          </button>
        </div>
      )}
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={LABEL}>Name</label>
        <input style={INPUT} maxLength={60} placeholder="e.g. Riccarton flat" value={d.name} onChange={e => set('name', e.target.value)} />
        <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>A nickname is enough; no address needed.</p>
      </div>
      <div>
        <label style={LABEL}>Expected rent</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input inputMode="decimal" style={{ ...INPUT, flex: 1, minWidth: 0 }} placeholder="650" defaultValue={d.rent_amount ?? ''} onChange={e => set('rent_amount', num(e.target.value))} />
          <select style={{ ...INPUT, width: 'auto' }} value={d.rent_frequency} onChange={e => set('rent_frequency', e.target.value as RentFrequency)}>
            <option value="weekly">a week</option>
            <option value="fortnightly">a fortnight</option>
            <option value="monthly">a month</option>
          </select>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>Used to spot rent and tell you if it&apos;s late.</p>
      </div>
      {numField('loan_balance', 'Loan balance', '450000', "From your bank. Repayments are read from this property's account.")}
      {numField('interest_rate', 'Interest rate (%)', '5.9', 'For the interest estimate at tax time')}
      <div>
        {numField('value', 'Property value', '720000')}
        <input key={`note-${ver}`} style={{ ...INPUT, marginTop: 6, fontSize: 12 }} maxLength={60} placeholder="Where from? e.g. 2025 CV" defaultValue={d.value_note ?? ''}
          onChange={e => set('value_note', e.target.value.trim() || null)} />
      </div>
      {numField('purchase_price', 'Purchase price', '650000')}
      <div>
        <label style={LABEL}>Purchase date</label>
        <input type="date" style={INPUT} value={d.purchase_date ?? ''} onChange={e => set('purchase_date', e.target.value || null)} />
      </div>
      {numField('ownership_pct', 'Your share (%)', '100', 'If you own it with someone, tax figures use your share')}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text)', gridColumn: '1 / -1', cursor: 'pointer' }}>
        <input type="checkbox" checked={d.new_build} onChange={e => set('new_build', e.target.checked)} style={{ marginTop: 3 }} />
        <span>It&apos;s a new build <span style={{ color: 'var(--text2)' }}>(code compliance from 27 March 2020; interest was fully deductible throughout)</span></span>
      </label>
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="submit" disabled={!valid || saving}
          style={{ padding: '9px 18px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: !valid || saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save property'}
        </button>
        {onCancel && <button type="button" onClick={onCancel} style={{ padding: '9px 14px', borderRadius: 8, background: 'none', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>}
        {onDelete && (!confirmDelete
          ? <button type="button" onClick={() => setConfirmDelete(true)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--red)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Remove property</button>
          : <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              Its accounts go back to household, and their rental categories are cleared.
              <button type="button" onClick={onDelete} style={{ background: 'var(--red)', color: 'white', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Remove</button>
              <button type="button" onClick={() => setConfirmDelete(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>Keep</button>
            </span>)}
      </div>
    </form>
  )
}
