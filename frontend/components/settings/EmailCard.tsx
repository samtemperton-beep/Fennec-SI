'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { IconMail } from '@tabler/icons-react'
import { api } from '@/lib/api'

type Choice = 'off' | 'weekly' | 'daily' | 'immediate'
const OPTIONS: { id: Choice; label: string; desc: string }[] = [
  { id: 'off', label: 'No emails', desc: 'Only the bell and the Notifications page' },
  { id: 'weekly', label: 'Weekly round-up', desc: 'Monday morning: budget so far, bills coming up and goal progress' },
  { id: 'daily', label: 'Daily morning summary', desc: 'One email at about 7am with anything new' },
  { id: 'immediate', label: 'As things happen', desc: 'An email for each notification, checked every 15 minutes' },
]

// Settings → Email updates. The same settings as Notifications → Preferences,
// in the place people look for them. Off unless chosen.
export function EmailCard() {
  const [choice, setChoice] = useState<Choice | null>(null)
  const [weeklyToo, setWeeklyToo] = useState(false)

  useEffect(() => {
    api.getNotificationPrefs().then((p: any) => {
      const mode = p?.email_mode ?? 'off'
      setChoice(mode === 'off' ? (p?.weekly_summary ? 'weekly' : 'off') : mode)
      setWeeklyToo(mode !== 'off' && !!p?.weekly_summary)
    }).catch(() => setChoice('off'))
  }, [])

  async function save(next: Choice, weekly: boolean) {
    setChoice(next); setWeeklyToo(weekly)
    try {
      await api.saveNotificationPrefs({
        email_mode: next === 'weekly' ? 'off' : next,
        weekly_summary: next === 'weekly' || (next !== 'off' && weekly),
      })
      toast.success('Email updates saved')
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="card">
      <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
        <IconMail size={16} style={{ display: 'inline', marginRight: 6, color: 'var(--primary)' }} />
        Email updates
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
        Sent to the email you sign in with, and can include amounts, such as what a bill is for.
      </p>
      {choice === null ? null : (
        <>
          <div role="radiogroup" aria-label="Email updates" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {OPTIONS.map(o => {
              const on = choice === o.id
              return (
                <button key={o.id} role="radio" aria-checked={on} onClick={() => save(o.id, weeklyToo)}
                  style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 9, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-light)' : 'transparent', color: 'var(--text)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{o.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{o.desc}</div>
                </button>
              )
            })}
          </div>
          {(choice === 'daily' || choice === 'immediate') && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', marginTop: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={weeklyToo} onChange={e => save(choice, e.target.checked)} /> Also send the Monday round-up
            </label>
          )}
          <p style={{ fontSize: 12, marginTop: 12 }}>
            <Link href="/app/alerts?tab=preferences" style={{ color: 'var(--primary)' }}>Choose which notifications you get</Link>
          </p>
        </>
      )}
    </div>
  )
}
