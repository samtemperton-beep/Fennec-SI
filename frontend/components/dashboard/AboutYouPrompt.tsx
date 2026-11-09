'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconX } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase'
import { AGE_BANDS, INTERESTS, saveAboutYou, type AboutYou, type AgeBand, type InterestId } from '@/lib/aboutYou'

const supabase = createClient()

const chip = (on: boolean): React.CSSProperties => ({
  padding: '4px 10px', borderRadius: 14, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-light)' : 'transparent', color: on ? 'var(--primary)' : 'var(--text2)',
})

// A one-off, low-key ask for people who signed up before onboarding asked what
// they're working towards. Shown once: answering or "Not now" hides it for good
// (saved on the profile, so on every device). The same questions stay on Goals.
export function AboutYouPrompt({ userId }: { userId: string | null }) {
  const [show, setShow] = useState(false)
  const [open, setOpen] = useState(false)
  const [interests, setInterests] = useState<Set<InterestId>>(new Set())
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!userId) return
    supabase.from('profiles').select('about').eq('id', userId).maybeSingle().then(({ data, error }) => {
      if (error) return // can't tell, so don't ask
      const a = ((data as any)?.about ?? {}) as AboutYou
      setShow(!a.asked && !a.ageBand && !a.interests?.length)
    })
  }, [userId])

  if (!show) return null

  function close(save: boolean) {
    saveAboutYou(supabase, {
      asked: true,
      ...(save && interests.size ? { interests: [...interests] } : {}),
      ...(save && ageBand ? { ageBand } : {}),
    })
    if (save) setDone(true)
    else setShow(false)
  }

  const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', marginBottom: 16, background: 'var(--surface)', fontSize: 13 }

  if (done) {
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, color: 'var(--text2)' }}>Thanks. <Link href="/app/finance/savings/goals" style={{ color: 'var(--primary)' }}>See goal ideas</Link> based on that, any time.</span>
        <button onClick={() => setShow(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', lineHeight: 0 }}><IconX size={15} /></button>
      </div>
    )
  }

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 200, color: 'var(--text2)' }}>
          New: tell Fennec what you&apos;re working towards, for goal and budget ideas that fit. Optional.
        </span>
        {!open && (
          <button onClick={() => setOpen(true)} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--primary)', background: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Choose</button>
        )}
        <button onClick={() => close(false)} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer' }}>Not now</button>
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {INTERESTS.map(i => {
              const on = interests.has(i.id)
              return <button key={i.id} aria-pressed={on} style={chip(on)} onClick={() => setInterests(p => { const n = new Set(p); on ? n.delete(i.id) : n.add(i.id); return n })}>{i.label}</button>
            })}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', marginRight: 2 }}>Age (optional):</span>
            {AGE_BANDS.map(b => <button key={b} aria-pressed={ageBand === b} style={chip(ageBand === b)} onClick={() => setAgeBand(a => (a === b ? null : b))}>{b}</button>)}
          </div>
          <button onClick={() => close(true)} disabled={!interests.size && !ageBand}
            style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: !interests.size && !ageBand ? 0.5 : 1 }}>Save</button>
        </div>
      )}
    </div>
  )
}
