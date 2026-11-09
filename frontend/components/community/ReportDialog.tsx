'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/shared/Modal'
import { api } from '@/lib/api'
import { REPORT_REASONS } from '@/lib/community'

// Reporting a post or comment. Reports are anonymous; the admin is emailed.
export function ReportDialog({ target, onClose }: { target: { postId?: number; commentId?: number } | null; onClose: (hidden?: boolean) => void }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    if (!target || !reason) return
    setSending(true)
    try {
      const r = await api.reportContent({ ...target, reason, note: note.trim() || undefined })
      toast.success(r.already ? 'You’ve already reported this. Thanks.' : 'Thanks. We’ll take a look.')
      setReason(''); setNote('')
      onClose(r.hidden)
    } catch (e: any) { toast.error(e.message) }
    setSending(false)
  }

  return (
    <Modal open={!!target} onClose={() => onClose()} title={`Report this ${target?.commentId ? 'comment' : 'post'}`}>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>The person won’t know who reported it.</p>
      <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {REPORT_REASONS.map(r => (
          <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, border: `1px solid ${reason === r.id ? 'var(--primary)' : 'var(--border)'}`, background: reason === r.id ? 'var(--primary-light)' : 'transparent' }}>
            <input type="radio" name="report-reason" checked={reason === r.id} onChange={() => setReason(r.id)} />
            {r.label}
          </label>
        ))}
      </div>
      <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 500))} rows={2} placeholder="Anything else we should know? (optional)"
        style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'none', marginBottom: 12 }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={() => onClose()} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        <button onClick={send} disabled={!reason || sending} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--red)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: !reason || sending ? 0.5 : 1 }}>
          {sending ? 'Sending…' : 'Report'}
        </button>
      </div>
    </Modal>
  )
}
