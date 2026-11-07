'use client'
import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconChevronDown, IconExternalLink } from '@tabler/icons-react'

// The Akahu personal app walkthrough, from https://developers.akahu.nz/docs/personal-apps
// This is where sign-ups are most likely to stall, so each step says what to do,
// what "done" looks like, and what to try if it doesn't work. One step opens at a
// time, ticks stay put, and Akahu opens in a new tab so this page stays where it is.

const PHONE_TIP = 'On a phone? Akahu opens in a new tab. To come back here, tap your browser’s tabs button and choose Fennec. Your ticks stay put.'

// Screenshots of Akahu's screens, one or two per step, in frontend/public/akahu/.
// A step shows a picture only once its file exists, so new ones can be dropped
// in without touching this code. Never include a real token or QR code: blur
// or cover them before saving.
type Shot = { file: string; alt: string }

const STEPS: { title: string; what: string[]; stuck: string[]; shots: Shot[] }[] = [
  {
    title: 'Create your free Akahu account',
    shots: [{ file: '1-sign-up.png', alt: 'Akahu’s sign-up page, with the email box and Continue button' }],
    what: [
      'Open my.akahu.nz using the button below. It opens in a new tab, so this page stays here.',
      'Enter your email address, press Continue and follow the prompts.',
      PHONE_TIP,
    ],
    stuck: [
      'Waiting on an email from Akahu? Check your spam folder.',
      'Already have an Akahu account? Sign in instead and go to step 2.',
    ],
  },
  {
    title: 'Connect your first bank',
    shots: [
      { file: '2-allow-access.png', alt: 'Akahu screen saying your Personal App is requesting ongoing access, with a Continue button' },
      { file: '2-connect-bank.png', alt: 'Akahu’s Select your provider screen, with a search box and bank logos' },
    ],
    what: [
      'Follow Akahu’s prompts to connect a bank account. You sign in to your bank through Akahu, and Fennec never sees your banking password.',
      'Akahu may first say your Personal App (with your name) is requesting ongoing access. That’s expected: press Continue, then pick your bank from the list.',
      'Akahu needs at least one bank connected before the next step works. You can add your broker and KiwiSaver at the same time.',
    ],
    stuck: [
      'Can’t find your bank? Check the list on the previous screen. It has to be one Akahu supports.',
      'Business account not showing? Some banks use a separate login for business accounts, and your bank may need to link it to your personal login.',
    ],
  },
  {
    title: 'Open the Developers page',
    shots: [{ file: '3-developers-menu.png', alt: 'Akahu’s menu, open, with Developers in it' }],
    what: [
      'While signed in to Akahu, open the menu (the three lines at the top left) and choose Developers. You can also go straight to my.akahu.nz/developers.',
      'Don’t let the name put you off: you don’t need to be a developer, and you won’t need to write any code.',
    ],
    stuck: [
      'Can’t see Developers? Make sure step 2 is finished and you’re signed in, then try my.akahu.nz/developers. The My apps page is different: it only lists apps you’ve approved, so it can look empty.',
    ],
  },
  {
    title: 'Agree to the terms and set up security',
    shots: [
      { file: '4-terms.png', alt: 'Akahu’s Developer Terms, with the button to agree' },
      { file: '4-security.png', alt: 'Akahu asking you to set up an authenticator app' },
    ],
    what: [
      'The first time, Akahu asks you to agree to its Developer Terms.',
      'It also requires multi-factor authentication, which means entering a code from an app on your phone when you sign in. Follow the prompts to set it up.',
      'If it asks for an app name, type My Finances.',
    ],
    stuck: [
      'No authenticator app? Google Authenticator and Microsoft Authenticator are both free in your phone’s app store.',
    ],
  },
  {
    title: 'Copy your two tokens into Fennec',
    shots: [{ file: '5-tokens.png', alt: 'Akahu’s Developers page, with the App ID Token and the User Access Token (hidden, with a Show link) under Configuration' }],
    what: [
      'Akahu now shows an App ID Token and a User Access Token under Configuration. These are like keys that let Fennec read your accounts.',
      'The User Access Token starts hidden as dots: press Show next to it first, then copy it.',
      'Copy each one into the matching box below, then press Connect Akahu. Each box shows a green tick when the token looks right.',
      'On a phone, do one token at a time: copy it, switch back to this tab, paste it, then go back to Akahu for the other.',
      'Keep them private, like a password.',
    ],
    stuck: [
      'If Fennec says the tokens don’t work, copy them again using Akahu’s copy button. Make sure the whole token is copied and each is in the right box.',
    ],
  },
]

const STORE_KEY = 'fennec:akahu-guide'

export function AkahuGuide() {
  const [done, setDone] = useState<number[]>([])
  const [open, setOpen] = useState(0)

  // Remember progress: people leave this page for Akahu and may reload it.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]')
      if (Array.isArray(saved) && saved.length) {
        setDone(saved)
        setOpen(STEPS.findIndex((_, i) => !saved.includes(i)))
      }
    } catch {}
  }, [])

  function toggleDone(i: number) {
    const finishing = !done.includes(i)
    const next = finishing ? [...done, i] : done.filter(d => d !== i)
    setDone(next)
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch {}
    if (finishing) setOpen(STEPS.findIndex((_, s) => s > i && !next.includes(s)))
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 8px' }}>
        {done.length} of {STEPS.length} done · about 10 minutes, and it&apos;s free
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STEPS.map((s, i) => {
          const isDone = done.includes(i)
          const isOpen = open === i
          return (
            <div key={s.title} style={{ background: 'var(--surface2)', borderRadius: 10, border: `1px solid ${isOpen ? 'var(--primary)' : 'transparent'}` }}>
              <button type="button" onClick={() => setOpen(isOpen ? -1 : i)} aria-expanded={isOpen}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? 'var(--green)' : 'var(--primary)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11 }}>
                  {isDone ? <IconCheck size={13} /> : i + 1}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, opacity: isDone ? 0.65 : 1 }}>{s.title}</span>
                <IconChevronDown size={15} style={{ color: 'var(--text3)', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </button>
              {isOpen && (
                <div style={{ padding: '0 12px 12px 44px' }}>
                  {s.what.map(t => <p key={t} style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, margin: '0 0 7px' }}>{t}</p>)}
                  {s.shots.map(shot => <Screenshot key={shot.file} shot={shot} />)}
                  {i === 0 && (
                    <a href="https://my.akahu.nz" target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--primary-light)', border: '1px solid var(--primary)', color: 'var(--primary)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, textDecoration: 'none', margin: '2px 0 8px' }}>
                      <IconExternalLink size={14} /> Open my.akahu.nz
                    </a>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginTop: 2 }}>
                    <strong style={{ color: 'var(--text2)' }}>Stuck?</strong> {s.stuck.join(' ')}
                  </div>
                  <button type="button" onClick={() => toggleDone(i)}
                    style={{ marginTop: 9, padding: '6px 12px', borderRadius: 8, border: 'none', background: isDone ? 'transparent' : 'var(--primary)', color: isDone ? 'var(--text2)' : 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                    {isDone ? 'Mark as not done' : 'Done, next step'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// One of Akahu's screens. Stays hidden until the image has loaded, so a step
// without its file yet just shows the words. Tap to open it full size.
function Screenshot({ shot }: { shot: Shot }) {
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')
  const img = useRef<HTMLImageElement>(null)
  // The image may finish before React is listening (server-rendered page).
  useEffect(() => {
    const el = img.current
    if (el?.complete) setState(el.naturalWidth > 0 ? 'ok' : 'missing')
  }, [])
  if (state === 'missing') return null
  const src = `/akahu/${shot.file}`
  return (
    <figure style={{ margin: '4px 0 10px', display: state === 'ok' ? 'block' : 'none' }}>
      <a href={src} target="_blank" rel="noopener noreferrer" title="Open full size">
        {/* Not loading="lazy": a lazy image inside a hidden box never loads. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={img} src={src} alt={shot.alt}
          onLoad={() => setState('ok')} onError={() => setState('missing')}
          style={{ display: 'block', width: '100%', maxWidth: 420, height: 'auto', borderRadius: 8, border: '1px solid var(--border)' }} />
      </a>
      <figcaption style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>What it looks like on Akahu. Tap to enlarge.</figcaption>
    </figure>
  )
}

// Shown before people start, so the time, the authenticator app and the
// tab-switching aren't a surprise halfway through.
export function AkahuBeforeYouStart() {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', marginBottom: 20 }}>
      <p style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--text)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Before you start</p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6 }}>
        <li>It takes about 10 minutes and it&apos;s free. We&apos;ll guide you one step at a time.</li>
        <li>Have your bank login handy, and an authenticator app on your phone (Google or Microsoft Authenticator, both free). Akahu asks you to set one up.</li>
        <li>It&apos;s easiest on a computer, because you&apos;ll copy two codes from Akahu into Fennec. On a phone it works too, with some switching between tabs.</li>
        <li>No time now? Skip it and connect later from Settings → Akahu Sync.</li>
      </ul>
    </div>
  )
}
