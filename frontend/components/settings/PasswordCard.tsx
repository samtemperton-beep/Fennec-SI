'use client'
import { useEffect, useState } from 'react'
import { IconKey, IconEye, IconEyeOff } from '@tabler/icons-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'

const supabase = createClient()
const MIN = 8

// Settings → Password. Works whether someone signed up with a password, an
// email link or Google: it sets a password, or replaces the one they have.
// Passwords are only stored hashed by the sign-in provider, so nobody (us
// included) can show the current one. If the sign-in provider wants proof
// it's really them, it emails a code first.
export function PasswordCard() {
  const [email, setEmail] = useState<string | null>(null)
  const [googleOnly, setGoogleOnly] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [code, setCode] = useState('')
  const [needsCode, setNeedsCode] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      setEmail(u.email ?? null)
      const providers: string[] = (u.app_metadata?.providers as string[]) ?? []
      setGoogleOnly(providers.length > 0 && !providers.includes('email'))
    })
  }, [])

  const problem = !pw ? null
    : pw.length < MIN ? `At least ${MIN} characters`
    : pw2 && pw !== pw2 ? 'The two passwords don’t match'
    : null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (problem || !pw || pw !== pw2) return
    setBusy(true)
    const { error } = await supabase.auth.updateUser(needsCode ? { password: pw, nonce: code.trim() } : { password: pw })
    if (error && /reauth/i.test(`${error.code ?? ''} ${error.message}`) && !needsCode) {
      // Secure password change is on: prove it's you with a code by email.
      const { error: e2 } = await supabase.auth.reauthenticate()
      setBusy(false)
      if (e2) { toast.error(e2.message); return }
      setNeedsCode(true)
      toast.message(`We’ve emailed a code to ${email ?? 'your email'}. Enter it below.`)
      return
    }
    setBusy(false)
    if (error) {
      toast.error(/same/i.test(error.message) ? 'That’s already your password.' : error.message)
      return
    }
    toast.success('Password saved. You can now sign in with your email and this password.')
    setPw(''); setPw2(''); setCode(''); setNeedsCode(false)
  }

  const input: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13 }

  return (
    <div className="card mt-6" id="password" style={{ scrollMarginTop: 80 }}>
      <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
        <IconKey size={16} style={{ display: 'inline', marginRight: 6, color: 'var(--primary)' }} />
        Password
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
        {googleOnly
          ? 'You sign in with Google. Add a password if you’d also like to sign in with your email.'
          : 'Set a password, or change the one you have. If you’ve been signing in with an email link, this adds a password too.'}
        {' '}For your security, passwords are stored scrambled, so nobody can show you your current one.
      </p>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
        {/* Lets password managers save it against the right account. */}
        <input type="email" name="email" autoComplete="username" value={email ?? ''} readOnly hidden />
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>New password
          <div style={{ position: 'relative', marginTop: 4 }}>
            <input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" minLength={MIN} style={{ ...input, paddingRight: 38 }} />
            <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', lineHeight: 0 }}>
              {show ? <IconEyeOff size={16} /> : <IconEye size={16} />}
            </button>
          </div>
        </label>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Type it again
          <input type={show ? 'text' : 'password'} value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" style={{ ...input, marginTop: 4 }} />
        </label>
        {needsCode && (
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Code from the email we just sent
            <input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" style={{ ...input, marginTop: 4, fontFamily: 'DM Mono, monospace' }} />
          </label>
        )}
        {problem && <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{problem}</p>}
        <button type="submit" disabled={busy || !!problem || !pw || pw !== pw2 || (needsCode && !code.trim())}
          style={{ alignSelf: 'flex-start', padding: '9px 18px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy || !!problem || !pw || pw !== pw2 ? 0.5 : 1 }}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </div>
  )
}
