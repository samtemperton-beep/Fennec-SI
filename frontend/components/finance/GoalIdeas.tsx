'use client'
import { useEffect, useMemo, useState } from 'react'
import { IconBulb, IconPlus, IconMessageCircle } from '@tabler/icons-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { localDate } from '@/lib/utils'
import { householdCashFlow } from '@/lib/spending'
import { AGE_BANDS, INTERESTS, loadAboutYou, saveAboutYou, type AboutYou, type InterestId } from '@/lib/aboutYou'
import { goalIdeas, type GoalIdea } from '@/lib/goalIdeas'
import { askFennec } from '@/lib/askFennec'

const supabase = createClient()
const money = (n: number) => n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })

const chip = (on: boolean): React.CSSProperties => ({
  padding: '5px 11px', borderRadius: 16, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-light)' : 'var(--surface2)', color: on ? 'var(--primary)' : 'var(--text2)',
})

// Goal ideas for someone starting out: from what they're working towards,
// their age range and their spending, each one a tap away from being a goal.
export function GoalIdeas({ existing, onAdded }: { existing: string[]; onAdded: () => void }) {
  const [about, setAbout] = useState<AboutYou | null>(null)
  const [monthlySpend, setMonthlySpend] = useState<number | null>(null)
  const [cardDebt, setCardDebt] = useState(0)
  const [adding, setAdding] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    const now = new Date()
    const from = localDate(new Date(now.getFullYear(), now.getMonth() - 3, 1))
    const to = localDate(new Date(now.getFullYear(), now.getMonth(), 0))
    Promise.all([
      loadAboutYou(supabase),
      householdCashFlow(supabase, from, to).catch(() => null),
      supabase.from('fin_accounts').select('current_balance').eq('type', 'CREDITCARD').eq('is_business', false),
    ]).then(([a, flow, { data: cards }]) => {
      setAbout(a)
      if (!a.ageBand && !a.interests?.length) setEditing(true)
      setMonthlySpend(flow && flow.spending > 0 ? flow.spending / 3 : null)
      setCardDebt((cards ?? []).reduce((s, c) => s + Math.max(0, -Number(c.current_balance) || 0), 0))
    })
  }, [])

  const ideas = useMemo(() => (about ? goalIdeas({ about, monthlySpend, cardDebt, existing }) : []), [about, monthlySpend, cardDebt, existing])

  function update(patch: AboutYou) {
    setAbout(a => ({ ...a, ...patch }))
    saveAboutYou(supabase, patch)
  }
  const toggleInterest = (id: InterestId) => {
    const now = new Set(about?.interests ?? [])
    now.has(id) ? now.delete(id) : now.add(id)
    update({ interests: [...now] })
  }

  async function add(g: GoalIdea) {
    setAdding(g.key)
    const d = new Date(); d.setMonth(d.getMonth() + g.months)
    const { error } = await supabase.from('fin_goals').insert({
      name: g.name, target_amount: g.target, monthly_contribution: g.monthly, target_date: localDate(d), owner: 'me',
    })
    setAdding(null)
    if (error) { toast.error(error.message); return }
    toast.success(`Added “${g.name}”. Change the amount or date any time.`)
    onAdded()
  }

  if (!about) return null

  return (
    <div className="card" style={{ padding: 20, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <IconBulb size={16} style={{ color: 'var(--accent)' }} />
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, flex: 1 }}>Goal ideas</h2>
        <button onClick={() => askFennec('Suggest some savings goals for me, with amounts and timeframes, based on my finances.')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--primary)', background: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <IconMessageCircle size={13} /> Ask Fennec for ideas
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
        Starting points based on what you’re working towards{monthlySpend ? ' and your spending' : ''}. Add one, then change the amount or date to suit.
      </p>

      {editing ? (
        <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>What are you working towards?</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {INTERESTS.map(i => <button key={i.id} onClick={() => toggleInterest(i.id)} style={chip(!!about.interests?.includes(i.id))} aria-pressed={!!about.interests?.includes(i.id)}>{i.label}</button>)}
          </div>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Your age <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span></p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {AGE_BANDS.map(b => <button key={b} onClick={() => update({ ageBand: about.ageBand === b ? undefined : b })} style={chip(about.ageBand === b)} aria-pressed={about.ageBand === b}>{b}</button>)}
          </div>
          <button onClick={() => setEditing(false)} style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Done</button>
        </div>
      ) : (
        <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>
          {[about.ageBand, ...(about.interests ?? []).map(i => INTERESTS.find(x => x.id === i)?.label)].filter(Boolean).join(' · ') || 'Nothing chosen yet.'}{' '}
          <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>Change</button>
        </p>
      )}

      {ideas.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text2)' }}>No new ideas: you already have goals for these. Pick more of what you’re working towards above, or ask Fennec.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {ideas.map(g => (
            <div key={g.key} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <strong style={{ fontSize: 13 }}>{g.name}</strong>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{money(g.target)} <span style={{ color: 'var(--text3)', fontFamily: 'inherit' }}>in {g.months} months · {money(g.monthly)}/mo</span></span>
              <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, flex: 1 }}>{g.why}</p>
              <button onClick={() => add(g)} disabled={adding === g.key}
                style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--primary)', background: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <IconPlus size={12} /> {adding === g.key ? 'Adding…' : 'Add goal'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
