'use client'
import Link from 'next/link'
import { IconShieldCheck, IconArrowRight } from '@tabler/icons-react'
import { Modal } from '@/components/shared/Modal'

// Verification happens in one place: the Akahu sync, where holdings come straight
// from the broker. Uploads can be edited, so there's nothing to submit here.
export function VerifyPortfolioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Verify your portfolio">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <IconShieldCheck size={22} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
          Portfolios are verified by connecting your broker through <strong style={{ color: 'var(--text)' }}>Akahu</strong>.
          Your holdings then come straight from the broker, so they can&apos;t be edited or made up.
          That&apos;s what keeps the leaderboard fair.
        </p>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 16 }}>
        CSV imports still work for tracking your holdings, but they don&apos;t count as verified. Verification is a Premium feature.
      </p>
      <Link href="/app/settings" onClick={onClose}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, background: 'var(--primary)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
        Connect Akahu in Settings <IconArrowRight size={14} />
      </Link>
    </Modal>
  )
}
