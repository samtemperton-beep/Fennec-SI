'use client'
import { useEffect, useState, type CSSProperties } from 'react'
import { IconEye, IconEyeOff } from '@tabler/icons-react'
import { toast } from 'sonner'
import { api, type PrivateField } from '@/lib/api'
import { LoadingSpinner } from './LoadingSpinner'
import { useSecurityPrefs } from './PrivacyMode'

// A detail that stays hidden until the eye is tapped, like a password field.
//
//   <Secret value={titleNo} />             a value the page already has
//   <Secret field="ird_number" hint="•••789" />   an encrypted detail, fetched
//                                          from the server only when revealed
//
// Hidden again when the page is left, unless the person has turned off
// "Hide personal details until tapped". Nothing revealed is kept anywhere.

type Props = { style?: CSSProperties; placeholder?: string } & (
  | { value: string | null | undefined; field?: never; hint?: never }
  | { field: PrivateField; hint?: string | null; value?: never }
)

export function Secret(props: Props) {
  // "Hide personal details until tapped" can be turned off in Settings → Security & privacy.
  const { hideDetails } = useSecurityPrefs()
  const [choice, setChoice] = useState<boolean | null>(null) // the eye, once tapped
  const [fetched, setFetched] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const remote = 'field' in props && !!props.field
  const value = remote ? fetched : props.value
  const saved = remote ? !!props.hint : !!props.value
  const wantShown = choice ?? !hideDetails
  const shown = wantShown && (!remote || fetched !== null)

  async function fetchValue(): Promise<boolean> {
    setLoading(true)
    try {
      const { values } = await api.revealPrivateFields([props.field!])
      setFetched(values[props.field!] ?? '')
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t show that just now')
      return false
    } finally {
      setLoading(false)
    }
  }

  // Shown by default: fetch an encrypted detail as soon as it's on screen.
  const field = remote ? props.field : null
  useEffect(() => {
    // Fetching from the server is the effect here; its loading state is set as it starts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (field && saved && wantShown && fetched === null && !loading) fetchValue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, saved, wantShown])

  if (!saved) return <span style={{ color: 'var(--text3)', ...props.style }}>{props.placeholder ?? '—'}</span>

  async function toggle() {
    if (shown) { setChoice(false); return }
    if (remote && fetched === null && !(await fetchValue())) return
    setChoice(true)
  }

  const masked = remote ? props.hint! : '•'.repeat(Math.min(12, Math.max(6, (props.value ?? '').length)))
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', ...props.style }}>
      <span style={{ overflowWrap: 'anywhere', letterSpacing: shown ? undefined : '0.05em' }}>{shown ? value : masked}</span>
      <button type="button" onClick={toggle} title={shown ? 'Hide' : 'Show'} aria-label={shown ? 'Hide' : 'Show'}
        style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text3)', lineHeight: 0, flexShrink: 0 }}>
        {loading ? <LoadingSpinner size={13} /> : shown ? <IconEyeOff size={14} /> : <IconEye size={14} />}
      </button>
    </span>
  )
}
