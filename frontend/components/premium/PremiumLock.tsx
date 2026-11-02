'use client'
import Link from 'next/link'
import { IconLock } from '@tabler/icons-react'

// Shown in place of a page or panel the account's plan doesn't include.
export function PremiumLock({ title, blurb, compact = false }: { title: string; blurb: string; compact?: boolean }) {
  return (
    <div style={{
      margin: compact ? 0 : '48px auto', maxWidth: 520, padding: compact ? '18px 20px' : '32px 28px', borderRadius: 14, textAlign: 'center',
      background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(44,110,106,0.08))', border: '1px solid rgba(251,191,36,0.3)',
    }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(251,191,36,0.15)' }}>
        <IconLock size={22} color="#d97706" />
      </div>
      <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{title} is part of Premium</p>
      <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>{blurb}</p>
      <Link href="/app/settings" style={{ display: 'inline-block', padding: '9px 20px', borderRadius: 8, background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#1a1a1a', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
        ✦ About Premium
      </Link>
    </div>
  )
}
