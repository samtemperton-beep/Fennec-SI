'use client'

import { useState } from 'react'
import { KIND_LABEL, PROPERTY_KINDS, type Kind, type PolicyDraft, type Frequency, type Holder } from '@/lib/insurance'

// Check or edit a policy: what was read from the schedule, or typed in.

const LABEL: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }
const INPUT: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2, var(--surface))', color: 'var(--text)', fontSize: 14 }
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[$,\s]/g, '')))

export const EMPTY_POLICY: PolicyDraft = {
  kind: 'home', holder: 'me', insurer: '', label: null, rental_property_id: null, lives_there: null,
  premium_total: null, base_premium: null, levies: null, gst: null, pay_frequency: null, instalment: null,
  start_date: null, renewal_date: null, sum_insured: null, excess: null, details: {},
}

export function PolicyForm({ initial, rentals, onSave, onCancel, onDelete, saving }: {
  initial: PolicyDraft
  rentals: { id: string; name: string }[]
  onSave: (p: PolicyDraft) => void
  onCancel: () => void
  onDelete?: () => void
  saving?: boolean
}) {
  const [d, setD] = useState<PolicyDraft>(initial)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = <K extends keyof PolicyDraft>(k: K, v: PolicyDraft[K]) => setD(x => ({ ...x, [k]: v }))
  const setDetail = (k: 'occupancy' | 'floor_area' | 'outbuildings_area' | 'cover_level', v: any) => setD(x => ({ ...x, details: { ...x.details, [k]: v } }))
  const n = (k: 'premium_total' | 'base_premium' | 'levies' | 'gst' | 'instalment' | 'sum_insured' | 'excess', label: string, hint?: string) => (
    <div>
      <label style={LABEL}>{label}</label>
      <input inputMode="decimal" style={INPUT} defaultValue={d[k] ?? ''} onChange={e => set(k, num(e.target.value))} />
      {hint && <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>{hint}</p>}
    </div>
  )
  const property = PROPERTY_KINDS.includes(d.kind)
  const valid = d.insurer.trim().length > 0

  return (
    <form onSubmit={e => { e.preventDefault(); if (valid) onSave({ ...d, insurer: d.insurer.trim(), label: d.label?.trim() || null }) }}
      style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      <div>
        <label style={LABEL}>Insurer</label>
        <input style={INPUT} maxLength={60} value={d.insurer} onChange={e => set('insurer', e.target.value)} placeholder="e.g. AMI" />
      </div>
      <div>
        <label style={LABEL}>Type</label>
        <select style={INPUT} value={d.kind} onChange={e => set('kind', e.target.value as Kind)}>
          {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label style={LABEL}>Whose policy</label>
        <select style={INPUT} value={d.holder} onChange={e => set('holder', e.target.value as Holder)}>
          <option value="me">Mine</option>
          <option value="partner">My partner&apos;s</option>
          <option value="joint">Joint</option>
        </select>
      </div>
      <div>
        <label style={LABEL}>Name it</label>
        <input style={INPUT} maxLength={80} value={d.label ?? ''} onChange={e => set('label', e.target.value)} placeholder="e.g. Moorea rental" />
      </div>

      {property && (
        <>
          <div>
            <label style={LABEL}>Do you live there?</label>
            <select style={INPUT} value={d.lives_there === null ? '' : d.lives_there ? 'yes' : 'no'}
              onChange={e => set('lives_there', e.target.value === '' ? null : e.target.value === 'yes')}>
              <option value="">Choose</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
            <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>Checked against what the policy says</p>
          </div>
          {rentals.length > 0 && (
            <div>
              <label style={LABEL}>Rental property</label>
              <select style={INPUT} value={d.rental_property_id ?? ''} onChange={e => set('rental_property_id', e.target.value || null)}>
                <option value="">Not a rental</option>
                {rentals.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={LABEL}>What the policy says about who lives there</label>
            <input style={INPUT} maxLength={160} value={d.details.occupancy ?? ''} onChange={e => setDetail('occupancy', e.target.value || null)} placeholder='e.g. "I live in the home and also have tenants or flatmates"' />
          </div>
        </>
      )}

      {n('premium_total', 'Total premium a year', 'Including GST and levies')}
      {n('base_premium', "Insurer's premium", 'Before levies and GST')}
      {n('levies', 'Levies', 'Natural Hazards and Fire and Emergency')}
      {n('gst', 'GST')}
      <div>
        <label style={LABEL}>Paid</label>
        <select style={INPUT} value={d.pay_frequency ?? ''} onChange={e => set('pay_frequency', (e.target.value || null) as Frequency | null)}>
          <option value="">Choose</option>
          <option value="annual">Once a year</option>
          <option value="quarterly">Quarterly</option>
          <option value="monthly">Monthly</option>
          <option value="fortnightly">Fortnightly</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>
      {n('instalment', 'Each payment')}
      <div>
        <label style={LABEL}>Starts</label>
        <input type="date" style={INPUT} value={d.start_date ?? ''} onChange={e => set('start_date', e.target.value || null)} />
      </div>
      <div>
        <label style={LABEL}>Renews</label>
        <input type="date" style={INPUT} value={d.renewal_date ?? ''} onChange={e => set('renewal_date', e.target.value || null)} />
      </div>
      {n('sum_insured', 'Sum insured')}
      {n('excess', 'Standard excess')}
      {(d.kind === 'home' || d.kind === 'landlord') && (
        <>
          <div>
            <label style={LABEL}>Floor area (m²)</label>
            <input inputMode="decimal" style={INPUT} defaultValue={d.details.floor_area ?? ''} onChange={e => setDetail('floor_area', num(e.target.value))} />
            <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>Home and attached garage</p>
          </div>
          <div>
            <label style={LABEL}>Outbuildings (m²)</label>
            <input inputMode="decimal" style={INPUT} defaultValue={d.details.outbuildings_area ?? ''} onChange={e => setDetail('outbuildings_area', num(e.target.value))} />
          </div>
        </>
      )}

      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="submit" disabled={!valid || saving}
          style={{ padding: '9px 18px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: !valid || saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save policy'}
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '9px 14px', borderRadius: 8, background: 'none', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        {onDelete && (!confirmDelete
          ? <button type="button" onClick={() => setConfirmDelete(true)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--red)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Remove policy</button>
          : <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
              Remove it from Fennec?
              <button type="button" onClick={onDelete} style={{ background: 'var(--red)', color: 'white', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Remove</button>
              <button type="button" onClick={() => setConfirmDelete(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>Keep</button>
            </span>)}
      </div>
    </form>
  )
}
