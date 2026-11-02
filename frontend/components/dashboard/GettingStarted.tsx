'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconCircleCheckFilled, IconCircle, IconX, IconChevronRight } from '@tabler/icons-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { openFeedback } from '@/components/shared/Feedback'

const DISMISSED_KEY = 'fennec_getting_started_dismissed'
/** Set by the fox chat when a question is sent. */
export const ASKED_FOX_KEY = 'fennec_asked_fox'

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private window */ } }

interface Step { id: string; title: string; body: string; href?: string; action?: () => void; cta: string; done: boolean }

// First-run checklist on the dashboard. Each step ticks itself off from the
// account's own data, and the card goes away once everything is done or it's dismissed.
export function GettingStarted({ userId }: { userId: string | null }) {
  const [done, setDone] = useState<Record<string, boolean> | null>(null)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    setHidden(read(DISMISSED_KEY) === '1')
    if (!userId) return
    const supabase = createClient()
    const count = async (q: any) => ((await q).count ?? 0) > 0
    Promise.all([
      count(supabase.from('fin_accounts').select('id', { count: 'exact', head: true })),
      count(supabase.from('holdings').select('id', { count: 'exact', head: true }).eq('user_id', userId)),
      count(supabase.from('fin_categories').select('id', { count: 'exact', head: true }).gt('monthly_budget', 0)),
      count(supabase.from('fin_bills').select('id', { count: 'exact', head: true })),
      count(supabase.from('fin_goals').select('id', { count: 'exact', head: true })),
    ]).then(([bank, holding, budget, bill, goal]) => setDone({
      bank, holding, budget, billsGoals: bill || goal, fox: read(ASKED_FOX_KEY) === '1',
    })).catch(() => { /* leave it hidden */ })
  }, [userId])

  if (hidden || !done) return null

  const steps: Step[] = [
    { id: 'bank', title: 'Connect your bank', body: 'Akahu brings in balances and transactions, read-only.', href: '/app/settings', cta: 'Connect', done: done.bank },
    { id: 'holding', title: 'Add your investments', body: 'Shares from Sharesies, Hatch and others, synced or added by hand.', href: '/app/portfolio', cta: 'Add', done: done.holding },
    { id: 'budget', title: 'Set a monthly budget', body: 'Pick a few categories and a limit for each.', href: '/app/finance/budget', cta: 'Set', done: done.budget },
    { id: 'billsGoals', title: 'Add a bill or a savings goal', body: 'Fennec reminds you before bills are due.', href: '/app/finance/bills', cta: 'Add', done: done.billsGoals },
    { id: 'fox', title: 'Ask Fennec a question', body: 'Tap the fox in the bottom corner. It knows your numbers.', cta: 'How', done: done.fox,
      action: () => toast('Tap the fox in the bottom-right corner of any page and ask anything, like "Where am I overspending?"') },
  ]
  const finished = steps.filter(s => s.done).length
  if (finished === steps.length) return null

  function dismiss() { write(DISMISSED_KEY, '1'); setHidden(true) }

  return (
    <div className="dash-card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15 }}>Getting started</p>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            {finished} of {steps.length} done. Something not working?{' '}
            <button onClick={() => openFeedback('bug')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>Tell Sam</button>
          </p>
        </div>
        <button onClick={dismiss} aria-label="Hide getting started" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><IconX size={16} /></button>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--surface2)', marginBottom: 10, overflow: 'hidden' }}>
        <div style={{ width: `${(finished / steps.length) * 100}%`, height: '100%', background: 'var(--primary)', transition: 'width .3s' }} />
      </div>
      {steps.map(s => {
        const inner = (
          <>
            {s.done ? <IconCircleCheckFilled size={20} style={{ color: 'var(--green)', flexShrink: 0 }} /> : <IconCircle size={20} style={{ color: 'var(--text3)', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'var(--text3)' : 'var(--text)' }}>{s.title}</p>
              {!s.done && <p style={{ fontSize: 12, color: 'var(--text2)' }}>{s.body}</p>}
            </div>
            {!s.done && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center' }}>{s.cta}<IconChevronRight size={14} /></span>}
          </>
        )
        const style: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', textDecoration: 'none', color: 'inherit', width: '100%', background: 'none', border: 'none', borderTop: '1px solid var(--border)', textAlign: 'left', cursor: s.done ? 'default' : 'pointer' }
        return s.done || !s.href
          ? <button key={s.id} onClick={s.done ? undefined : s.action} style={style}>{inner}</button>
          : <Link key={s.id} href={s.href} style={style}>{inner}</Link>
      })}
    </div>
  )
}
