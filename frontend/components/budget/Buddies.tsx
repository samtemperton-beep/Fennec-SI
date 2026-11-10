'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { IconUserPlus, IconTrash } from '@tabler/icons-react'
import { api, type BuddiesResponse, type MyBuddy } from '@/lib/api'
import { Avatar } from '@/components/shared/Avatar'
import { levelFor } from '@/lib/rewards'

const money = (n: number) => n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} /> {label}
    </label>
  )
}

// Accountability buddies (backend/src/routes/accountability.ts): invite
// someone by email; once they accept they see your pledges and slips, and
// whatever else you choose to share.
export function Buddies() {
  const [data, setData] = useState<BuddiesResponse | null>(null)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)

  const load = () => api.getBuddies().then(setData).catch(() => setData({ ready: false, mine: [], invites: [], following: [] }))
  useEffect(() => { load() }, [])

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    try {
      await api.inviteBuddy(email.trim())
      toast.success('Invite sent. They’ll see it once they accept.')
      setEmail('')
      load()
    } catch (err: any) { toast.error(err.message) }
    setSending(false)
  }

  async function act(fn: () => Promise<any>, ok: string) {
    try { await fn(); toast.success(ok); load() } catch (err: any) { toast.error(err.message) }
  }

  async function share(b: MyBuddy, patch: Partial<Pick<MyBuddy, 'shareAmounts' | 'shareBudgets' | 'shareGoals'>>) {
    setData(d => d && { ...d, mine: d.mine.map(x => x.id === b.id ? { ...x, ...patch } : x) })
    try { await api.updateBuddy(b.id, patch) } catch (err: any) { toast.error(err.message); load() }
  }

  if (!data) return null
  if (!data.ready) return <div className="card" style={{ padding: 20, fontSize: 13, color: 'var(--text2)' }}>Accountability buddies are being switched on. Check back soon.</div>

  return (
    <>
      {data.invites.map(i => (
        <div key={i.id} className="card" style={{ padding: 16, marginBottom: 16, border: '1.5px solid var(--primary)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 22 }} aria-hidden>🤝</span>
          <div style={{ flex: 1, minWidth: 200, fontSize: 13 }}>
            <strong>{i.from}</strong> asked you to be their accountability buddy. You’ll see their pledges and get a heads-up if they slip. You won’t see their accounts.
          </div>
          <button onClick={() => act(() => api.acceptBuddy(i.id), 'You’re their buddy now')} style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Accept</button>
          <button onClick={() => act(() => api.removeBuddy(i.id), 'Invite declined')} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', fontSize: 12, cursor: 'pointer' }}>Decline</button>
        </div>
      ))}

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Your accountability buddy</h2>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
          A friend who gets a heads-up when you slip on a pledge, so you’ve got someone in your corner. They don’t see your accounts, balances or other spending. Invite them by email; if they’re not on Fennec yet, they can sign up free with that email.
        </p>

        {data.mine.map(b => (
          <div key={b.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: b.status === 'active' ? 10 : 0 }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{b.name ?? b.email}</div>
                <div style={{ fontSize: 11, color: b.status === 'active' ? 'var(--green)' : 'var(--amber)' }}>{b.status === 'active' ? 'Your buddy' : `Invite sent to ${b.email}, waiting for them to accept`}</div>
              </div>
              <button onClick={() => { if (confirm(b.status === 'active' ? `Stop ${b.name ?? 'them'} being your buddy?` : 'Cancel this invite?')) act(() => api.removeBuddy(b.id), 'Removed') }}
                aria-label="Remove buddy" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><IconTrash size={15} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>They see your pledges and slips. Also share:</span>
              <Switch on={b.shareAmounts} label="How much each slip was" onChange={v => share(b, { shareAmounts: v })} />
              <Switch on={b.shareBudgets} label="When you go over a budget (category name only)" onChange={v => share(b, { shareBudgets: v })} />
              <Switch on={b.shareGoals} label="When a goal passes its date (goal name only)" onChange={v => share(b, { shareGoals: v })} />
            </div>
          </div>
        ))}

        {data.mine.length < 3 && (
          <form onSubmit={invite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Their email address" required
              style={{ flex: 1, minWidth: 200, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }} />
            <button type="submit" disabled={sending} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
              <IconUserPlus size={14} /> {sending ? 'Sending…' : 'Invite'}
            </button>
          </form>
        )}
      </div>

      {data.following.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>People you’re keeping on track</h2>
          {data.following.map(f => {
            const lvl = levelFor(f.points)
            return (
              <div key={f.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <Avatar username={f.name} avatarColor={f.avatarColor ?? undefined} avatarEmoji={f.avatarEmoji ?? undefined} avatarUrl={f.avatarUrl ?? undefined} size={34} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }} data-amounts="show">Level {lvl.number} · {lvl.name} · {f.streakWeeks > 0 ? `🔥 ${f.streakWeeks}-week streak` : 'no streak yet'}</div>
                  </div>
                  <button onClick={() => { if (confirm(`Stop being ${f.name}'s buddy?`)) act(() => api.removeBuddy(f.id), 'Done') }}
                    style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Leave</button>
                </div>
                {f.pledges.length ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {f.pledges.map(p => (
                      <span key={p.name} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 14, background: 'var(--surface2)' }} data-amounts="show">
                        {p.name}: <strong>{p.keptDays} day{p.keptDays === 1 ? '' : 's'}</strong> kept
                      </span>
                    ))}
                  </div>
                ) : <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>No pledges right now.</p>}
                {f.slips.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                    <strong style={{ color: 'var(--text)' }}>Slips in the last 30 days:</strong>{' '}
                    {f.slips.map(s => `${s.pledge} on ${new Date(`${s.date}T12:00:00`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}${s.amount != null ? ` (${money(s.amount)})` : ''}`).join('; ')}
                  </div>
                )}
                {!!f.overBudget?.length && <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 6 }}>Over budget this month on {f.overBudget.join(', ')}</div>}
                {!!f.goalsMissed?.length && <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 4 }}>Goals past their date: {f.goalsMissed.join(', ')}</div>}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
