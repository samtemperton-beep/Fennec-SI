'use client'
import { useState, type CSSProperties } from 'react'

// Month and year only, stored as the first of the month (YYYY-MM-01). Used for
// date of birth: the KiwiSaver maths only needs your age, and a full birth date
// is worth more to an identity thief than to us.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function MonthYearInput({ value, onChange, style, minAge = 16, maxAge = 100 }: {
  value: string | null | undefined
  onChange: (v: string | null) => void
  style?: CSSProperties
  minAge?: number
  maxAge?: number
}) {
  const [savedY, savedM] = (value || '').split('-')
  // A month picked before a year is held here until the year is chosen.
  const [pending, setPending] = useState('')
  const y = savedY || ''
  const m = savedM || pending
  const thisYear = new Date().getFullYear()
  const years = Array.from({ length: maxAge - minAge + 1 }, (_, i) => thisYear - minAge - i)
  const set = (year: string, month: string) => { setPending(month); onChange(year && month ? `${year}-${month}-01` : null) }
  const select: CSSProperties = { flex: 1, minWidth: 0, ...style }
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <select aria-label="Month" value={m || ''} onChange={e => set(y, e.target.value)} style={select}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}
      </select>
      <select aria-label="Year" value={y || ''} onChange={e => set(e.target.value, m || '01')} style={select}>
        <option value="">Year</option>
        {years.map(yr => <option key={yr} value={yr}>{yr}</option>)}
      </select>
    </div>
  )
}
