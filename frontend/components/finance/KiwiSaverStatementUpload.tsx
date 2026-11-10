'use client'
import { useRef, useState } from 'react'
import { IconPhotoScan } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

export interface KiwiSaverStatementValues {
  provider: string | null
  fund_name: string | null
  fund_type: string | null
  balance: number | null
  as_at: string | null
  employee_rate: number | null
}

const MAX_BYTES = 6 * 1024 * 1024

// For providers Akahu can't connect (for example Generate with two-factor
// sign-in on): read the balance from a screenshot of the provider's app or a
// statement (backend/src/services/kiwisaverStatement.ts). The file isn't stored.
export function KiwiSaverStatementUpload({ onRead }: { onRead: (v: KiwiSaverStatementValues) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')

  async function read(f: File | undefined) {
    if (!f) return
    setError('')
    if (f.type !== 'application/pdf' && !f.type.startsWith('image/')) return setError('Upload a screenshot or a PDF statement.')
    if (f.size > MAX_BYTES) return setError('That file is over 6 MB. Try a smaller screenshot.')
    setReading(true)
    try {
      const buf = new Uint8Array(await f.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      const { data: { session } } = await createClient().auth.getSession()
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/finance/kiwisaver-statement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ file: { type: f.type, data: btoa(bin) } }),
      })
      const result = await r.json()
      if (!r.ok) throw new Error(result.error || "Couldn't read that")
      onRead(result)
    } catch (e: any) {
      setError(e.message)
    }
    setReading(false)
    if (input.current) input.current.value = ''
  }

  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p style={{ flex: 1, minWidth: 220, fontSize: 12, color: 'var(--text2)', margin: 0, lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text)' }}>Can’t connect your provider through Akahu?</strong> Upload a screenshot of your balance from your provider’s app or website, or a statement, and Fennec fills in the details for you to check. The image isn’t kept.
        </p>
        <input ref={input} type="file" accept="application/pdf,image/*" hidden onChange={e => read(e.target.files?.[0])} />
        <button type="button" onClick={() => input.current?.click()} disabled={reading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--primary)', background: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: reading ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
          {reading ? <LoadingSpinner size={12} /> : <IconPhotoScan size={14} />} {reading ? 'Reading…' : 'Read a screenshot'}
        </button>
      </div>
      {error && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{error}</p>}
    </div>
  )
}
