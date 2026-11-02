'use client'
import { useState } from 'react'
import { IconTrash } from '@tabler/icons-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase'

// Danger zone for Settings. Deleting can't be undone, so the button opens a
// panel that spells out what goes and needs the word DELETE typed in.
export function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function remove() {
    setDeleting(true)
    try {
      await api.deleteAccount()
      await createClient().auth.signOut().catch(() => {})
      window.location.href = '/'
    } catch (e: any) {
      toast.error(e.message)
      setDeleting(false)
    }
  }

  return (
    <div className="card mt-6 mb-8" style={{ border: '1px solid rgba(240,84,84,0.3)' }}>
      <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--red)', marginBottom: 8 }}>Danger Zone</h2>
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>Permanently delete your account and all associated data.</p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg"
          style={{ background: 'rgba(240,84,84,0.1)', color: 'var(--red)', border: '1px solid rgba(240,84,84,0.3)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
          <IconTrash size={16} /> Delete Account
        </button>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 10 }}>
            This removes your login, portfolio, bank data, Akahu and Gmail connections, posts and everything else in your account. It can&apos;t be undone. If you're linked with a partner, shared bills and goals stay with them.
          </p>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Type DELETE to confirm</label>
          <input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off"
            style={{ width: '100%', maxWidth: 240, padding: '9px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', marginBottom: 12, display: 'block' }} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={remove} disabled={typed !== 'DELETE' || deleting} className="flex items-center gap-2 px-4 py-2 rounded-lg"
              style={{ background: 'var(--red)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, opacity: typed !== 'DELETE' || deleting ? 0.5 : 1 }}>
              <IconTrash size={16} /> {deleting ? 'Deleting…' : 'Delete my account'}
            </button>
            <button onClick={() => { setOpen(false); setTyped('') }} disabled={deleting}
              style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
