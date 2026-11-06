'use client'
import { useState, type CSSProperties } from 'react'
import { IconCheck, IconEye, IconEyeOff, IconAlertCircle } from '@tabler/icons-react'

// A box for one of the two Akahu tokens. Shown as text while pasting, because a
// half-copied token is the most common reason connecting fails and a password
// box hides it; the eye hides it again. Checks the token as it's pasted, so a
// wrong box or a cut-off copy shows up before pressing Connect. The server still
// checks the tokens with Akahu.

export type TokenKind = 'app' | 'user'

const PREFIX: Record<TokenKind, string> = { app: 'app_token_', user: 'user_token_' }
const NAME: Record<TokenKind, string> = { app: 'App ID Token', user: 'User Access Token' }
const MIN_AFTER_PREFIX = 20 // Akahu tokens are well over this; shorter means a cut-off copy

export function checkToken(kind: TokenKind, raw: string): { ok: boolean; msg: string } | null {
  const t = raw.trim()
  if (!t) return null
  const other: TokenKind = kind === 'app' ? 'user' : 'app'
  if (t.startsWith(PREFIX[other])) return { ok: false, msg: `That's the ${NAME[other]}. It goes in the other box.` }
  if (!t.startsWith(PREFIX[kind])) return { ok: false, msg: `This should start with ${PREFIX[kind]}. Copy it again using Akahu's copy button.` }
  if (/\s/.test(t)) return { ok: false, msg: 'There’s a space or line break in it. Copy it again using Akahu’s copy button.' }
  if (t.length - PREFIX[kind].length < MIN_AFTER_PREFIX) return { ok: false, msg: 'This looks cut short. Copy the whole token again.' }
  return { ok: true, msg: 'Looks right' }
}

export function AkahuTokenInput({ kind, value, onChange, placeholder, label, labelStyle, inputStyle }: {
  kind: TokenKind
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label?: string
  labelStyle?: CSSProperties
  inputStyle?: CSSProperties
}) {
  const [hidden, setHidden] = useState(false)
  const check = checkToken(kind, value)
  const id = `akahu-${kind}-token`
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>{label ?? NAME[kind]}</label>
      <div style={{ position: 'relative' }}>
        <input id={id} type={hidden ? 'password' : 'text'} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? `${PREFIX[kind]}...`}
          autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} data-1p-ignore data-lpignore="true"
          aria-invalid={check ? !check.ok : undefined} aria-describedby={check ? `${id}-check` : undefined}
          style={{ ...inputStyle, paddingRight: 40, boxShadow: check ? `0 0 0 1.5px ${check.ok ? 'var(--green)' : 'var(--red)'}` : undefined }} />
        <button type="button" onClick={() => setHidden(h => !h)} aria-label={hidden ? 'Show token' : 'Hide token'} title={hidden ? 'Show' : 'Hide'}
          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: 'var(--text3)', lineHeight: 0 }}>
          {hidden ? <IconEye size={16} /> : <IconEyeOff size={16} />}
        </button>
      </div>
      {check && (
        <p id={`${id}-check`} role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 12, margin: '5px 0 0', lineHeight: 1.45, color: check.ok ? 'var(--green)' : 'var(--red)' }}>
          {check.ok ? <IconCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <IconAlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
          {check.msg}
        </p>
      )}
    </div>
  )
}
