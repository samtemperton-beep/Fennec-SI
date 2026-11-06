'use client'
import { useState, type ReactNode } from 'react'
import { IconShieldLock, IconLock } from '@tabler/icons-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { IDLE_CHOICES, AWAY_MINUTES, type SecurityPrefs } from '@/lib/security'
import { setSecurityPrefs, useSecurityPrefs } from '@/components/shared/PrivacyMode'

// Settings → Security & privacy. Everything starts on; people can ease off the
// parts that get in their way. Encryption and per-person data rules are always
// on and listed here so people know they're there.
export function SecurityCard({ userId, twoFactorOn }: { userId: string | null; twoFactorOn: boolean }) {
  const prefs = useSecurityPrefs()
  const [saving, setSaving] = useState(false)

  async function save(change: Partial<SecurityPrefs>) {
    if (!userId) return
    const next: SecurityPrefs = { ...prefs, ...change, reviewedAt: new Date().toISOString() }
    const before = prefs
    setSecurityPrefs(next)
    setSaving(true)
    const { error } = await createClient().from('profiles').update({ security_prefs: next }).eq('id', userId)
    setSaving(false)
    if (error) { setSecurityPrefs(before); toast.error(`Not saved: ${error.message}`); return }
    toast.success('Security setting saved')
  }

  return (
    <div className="card mt-6" id="security" style={{ scrollMarginTop: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <IconShieldLock size={16} style={{ color: 'var(--primary)' }} />
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16 }}>Security &amp; privacy</h2>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
        Everything starts switched on. If something gets in your way you can turn it down here, but we recommend leaving these on, especially on a shared or work device.
      </p>

      <Toggle label="Hide amounts when Fennec opens" checked={prefs.hideAmountsOnOpen} disabled={saving}
        onChange={v => save({ hideAmountsOnOpen: v })}>
        Dollar amounts show as ••••• until you tap the eye in the top bar. Handy when people can see your screen.
      </Toggle>
      <Toggle label={`Hide amounts again after ${AWAY_MINUTES} minutes away`} checked={prefs.rehideAfterAway} disabled={saving}
        onChange={v => save({ rehideAfterAway: v })}>
        If you&apos;ve shown your amounts and then switch to another app or tab for a while, they&apos;re hidden again when you come back.
      </Toggle>
      <Toggle label="Hide personal details until tapped" checked={prefs.hideDetails} disabled={saving}
        onChange={v => save({ hideDetails: v })}>
        IRD, GST and bank account numbers, your home address and property title details. They stay encrypted either way; this only changes whether they show without a tap.
      </Toggle>

      <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <label htmlFor="idle-minutes" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Sign out when I&apos;m inactive</label>
        <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 8 }}>
          Signs you out on this device after this long with no activity. You&apos;ll get a minute&apos;s warning first.
        </p>
        <select id="idle-minutes" value={prefs.idleMinutes} disabled={saving} onChange={e => save({ idleMinutes: Number(e.target.value) })}
          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }}>
          {IDLE_CHOICES.map(c => <option key={c.minutes} value={c.minutes}>{c.label}</option>)}
        </select>
      </div>

      <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600 }}>Two-factor sign-in {twoFactorOn ? <span style={{ color: 'var(--green)' }}>· On</span> : <span style={{ color: 'var(--amber)' }}>· Off (recommended)</span>}</p>
          <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>A code from an authenticator app as well as your password. The strongest protection for your account.</p>
        </div>
        {!twoFactorOn && (
          <a href="#two-factor" style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Set it up ↓</a>
        )}
      </div>

      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface2)', marginTop: 4 }}>
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, marginBottom: 6 }}><IconLock size={13} /> Always on</p>
        <ul style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
          <li>Only you can see your data (plus what you share with a linked partner)</li>
          <li>Bank and Gmail connections, IRD, GST and bank account numbers and your home address are encrypted with a key kept apart from the database</li>
          <li>Bank access is read-only: Fennec can&apos;t move money</li>
          <li>KiwiSaver keeps only the month and year you were born</li>
        </ul>
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange, disabled, children }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: ReactNode
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, padding: '12px 0', borderTop: '1px solid var(--border)', cursor: disabled ? 'default' : 'pointer' }}>
      <span>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{children}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: 'var(--primary)', flexShrink: 0, marginTop: 2, cursor: 'inherit' }} />
    </label>
  )
}
