'use client'
import { useRef, useState } from 'react'
import { IconFileUpload } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

export interface RatesNoticeValues {
  council: string | null
  address: string | null
  valuation_reference: string | null
  capital_value: number | null
  land_value: number | null
  improvements_value: number | null
  valuation_date: string | null
  annual_rates: number | null
}

const MAX_BYTES = 6 * 1024 * 1024

// Upload a rates notice; the backend reads the council valuation off it
// (backend/src/services/ratesNotice.ts). The file isn't stored.
export function RatesNoticeUpload({ onRead, label = 'Upload rates notice' }: { onRead: (v: RatesNoticeValues) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')

  async function read(f: File | undefined) {
    if (!f) return
    setError('')
    if (f.type !== 'application/pdf' && !f.type.startsWith('image/')) return setError('Upload a PDF or a photo of your rates notice.')
    if (f.size > MAX_BYTES) return setError('That file is over 6 MB. Try a smaller photo or the PDF.')
    setReading(true)
    try {
      const buf = new Uint8Array(await f.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      const { data: { session } } = await createClient().auth.getSession()
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/finance/rates-notice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ file: { type: f.type, data: btoa(bin) } }),
      })
      const result = await r.json()
      if (!r.ok) throw new Error(result.error || "Couldn't read that document")
      onRead(result)
    } catch (e: any) {
      setError(e.message)
    }
    setReading(false)
    if (input.current) input.current.value = ''
  }

  return (
    <div>
      <input ref={input} type="file" accept="application/pdf,image/*" hidden onChange={e => read(e.target.files?.[0])} />
      <button type="button" onClick={() => input.current?.click()} disabled={reading}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--primary)', background: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: reading ? 'default' : 'pointer' }}>
        {reading ? <LoadingSpinner size={12} /> : <IconFileUpload size={14} />} {reading ? 'Reading…' : label}
      </button>
      {error && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{error}</p>}
    </div>
  )
}
