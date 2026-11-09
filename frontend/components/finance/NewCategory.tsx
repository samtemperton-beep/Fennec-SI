'use client'
import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { createCategory, CategoryError, type CategoryKind } from '@/lib/categories'

type Created = Awaited<ReturnType<typeof createCategory>>

// "+ New category": a name, and whether it's spending or income.
export function NewCategory({ onCreated, defaultKind = 'spending', compact = false }: {
  onCreated: (c: Created) => void; defaultKind?: CategoryKind; compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<CategoryKind>(defaultKind)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const c = await createCategory(createClient(), name, kind)
      toast.success(`Added “${c.name}”`)
      setName(''); setOpen(false)
      onCreated(c)
    } catch (e: any) {
      toast.error(e instanceof CategoryError ? e.message : 'Couldn’t add the category. Please try again.')
    }
    setSaving(false)
  }

  const pill = { fontSize: compact ? 10 : 12, padding: compact ? '2px 7px' : '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 600 } as const

  if (!open) {
    return (
      <button type="button" onClick={() => { setKind(defaultKind); setOpen(true) }}
        style={{ ...pill, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--surface2)', color: 'var(--primary)', border: '1px dashed var(--primary)' }}>
        <IconPlus size={compact ? 10 : 13} /> New category
      </button>
    )
  }
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
      <input autoFocus value={name} maxLength={40} placeholder="Name, e.g. Pets"
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false) }}
        aria-label="New category name"
        style={{ width: compact ? 130 : 170, padding: compact ? '2px 7px' : '6px 10px', borderRadius: 8, border: '1px solid var(--primary)', background: 'var(--surface)', color: 'var(--text)', fontSize: compact ? 11 : 13, outline: 'none' }} />
      <select value={kind} onChange={e => setKind(e.target.value as CategoryKind)} aria-label="Spending or income"
        style={{ padding: compact ? '2px 4px' : '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: compact ? 11 : 13 }}>
        <option value="spending">Spending</option>
        <option value="income">Income</option>
      </select>
      <button type="button" onClick={save} disabled={saving || name.trim().length < 2}
        style={{ ...pill, background: 'var(--primary)', color: 'white', border: 'none', opacity: saving || name.trim().length < 2 ? 0.5 : 1 }}>
        {saving ? 'Adding…' : 'Add'}
      </button>
      <button type="button" onClick={() => setOpen(false)} style={{ ...pill, background: 'none', color: 'var(--text2)', border: '1px solid var(--border)' }}>Cancel</button>
    </span>
  )
}
