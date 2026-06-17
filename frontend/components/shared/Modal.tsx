'use client'
import { useEffect, useRef } from 'react'
import { IconX } from '@tabler/icons-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  wide?: boolean
}

export function Modal({ open, onClose, title, children, wide }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(9,12,17,0.85)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={ref}
        style={{
          background: 'var(--surface)', borderRadius: 12, padding: 24,
          width: '100%', maxWidth: wide ? 768 : 512,
          maxHeight: '90vh', overflowY: 'auto', position: 'relative',
          border: '1px solid var(--border)',
        }}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>{title}</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-surface2 transition-colors">
              <IconX size={18} style={{ color: 'var(--text2)' }} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
