'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { IconHeartHandshake, IconCopy, IconShare, IconUnlink } from '@tabler/icons-react'
import { toast } from 'sonner'
import { api, type PartnerStatus } from '@/lib/api'
import { usePlan } from '@/lib/plan'
import { PremiumLock } from '@/components/premium/PremiumLock'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

const INVITE_PARAM = 'partner_invite'
const inviteUrl = (code: string) => `${window.location.origin}/app/settings?${INVITE_PARAM}=${code}`

const btn = (primary: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
  fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13,
  background: primary ? 'var(--primary)' : 'var(--surface2)', color: primary ? 'white' : 'var(--text)',
  border: primary ? 'none' : '1px solid var(--border)',
})

// Settings card for linking with a partner. The link itself lives on the
// backend; what each person shares is chosen per account on the Accounts page.
export function PartnerCard() {
  const { can } = usePlan()
  const [status, setStatus] = useState<PartnerStatus | null>(null)
  const [busy, setBusy] = useState(false)
  // An invite opened from a link: ?partner_invite=CODE
  const [incoming, setIncoming] = useState<{ code: string; name: string } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // The card sits low on Settings, so bring an invite into view.
  useEffect(() => { if (incoming) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [incoming])

  useEffect(() => {
    api.partnerStatus().then(setStatus).catch(() => setStatus({ status: 'none' }))
    const code = new URLSearchParams(window.location.search).get(INVITE_PARAM)
    if (code) {
      api.partnerInviteInfo(code)
        .then(r => { if (!r.own) setIncoming({ code, name: r.name! }) })
        .catch(e => { toast.error(e.message); clearParam() })
    }
  }, [])

  function clearParam() {
    const url = new URL(window.location.href)
    url.searchParams.delete(INVITE_PARAM)
    window.history.replaceState(null, '', url.toString())
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try { await fn() } catch (e: any) { toast.error(e.message) }
    setBusy(false)
  }

  const createInvite = () => run(async () => {
    const { code } = await api.partnerInvite()
    setStatus({ status: 'pending', code })
  })

  const accept = () => run(async () => {
    const r = await api.partnerAccept(incoming!.code)
    setIncoming(null); clearParam()
    setStatus({ status: 'linked', partner: r.partner })
    toast.success(`Linked with ${r.partner.name}`)
  })

  const unlink = (linked: boolean) => run(async () => {
    if (linked && !confirm('Unlink? You both stop seeing what the other shared, and all your accounts go back to private. Shared bills and goals stay with whoever added them.')) return
    await api.partnerUnlink()
    setStatus({ status: 'none' })
    toast.success(linked ? 'Unlinked' : 'Invite cancelled')
  })

  async function copy(code: string) {
    try { await navigator.clipboard.writeText(inviteUrl(code)); toast.success('Invite link copied') }
    catch { toast.error("Couldn't copy. Select the link and copy it instead.") }
  }
  async function share(code: string) {
    try { await navigator.share({ title: 'Link with me on Fennec', url: inviteUrl(code) }) } catch { /* closed */ }
  }

  const heading = (
    <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
      <IconHeartHandshake size={18} style={{ color: 'var(--primary)' }} /> Partner
    </h2>
  )

  return (
    <div ref={cardRef} className="card" style={incoming ? { border: '1px solid var(--primary)' } : undefined}>
      {heading}
      <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
        Link with your partner to see the bank accounts each of you chooses to share, and to keep bills and goals together.
        Every account starts private. Portfolio, KiwiSaver, Gmail and business data are never shared.
      </p>

      {incoming && status?.status !== 'linked' ? (
        <div>
          <p style={{ fontSize: 14, marginBottom: 14 }}><strong>{incoming.name}</strong> has invited you to link accounts.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={accept} style={btn(true)}>{busy ? <LoadingSpinner size={14} /> : null} Accept</button>
            <button type="button" disabled={busy} onClick={() => { setIncoming(null); clearParam() }} style={btn(false)}>Not now</button>
          </div>
        </div>
      ) : !status ? (
        <LoadingSpinner size={18} />
      ) : status.status === 'linked' ? (
        <div>
          <p style={{ fontSize: 14, marginBottom: 4 }}>Linked with <strong>{status.partner.name}</strong>{status.partner.email && status.partner.email !== status.partner.name ? ` (${status.partner.email})` : ''}</p>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
            Choose what each of your accounts shares on the <Link href="/app/finance/accounts" style={{ color: 'var(--primary)', fontWeight: 600 }}>Accounts</Link> page.
          </p>
          <button type="button" disabled={busy} onClick={() => unlink(true)} style={{ ...btn(false), color: 'var(--red)' }}><IconUnlink size={14} /> Unlink</button>
        </div>
      ) : !can('partner') ? (
        <PremiumLock compact title="Partner sharing" blurb="Link with your partner to share chosen accounts, bills and goals." />
      ) : status.status === 'pending' ? (
        <div>
          <p style={{ fontSize: 13, marginBottom: 8 }}>Send this link to your partner. They sign in to Fennec, open it and press Accept.</p>
          <input readOnly value={inviteUrl(status.code)} onFocus={e => e.currentTarget.select()}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 12, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => copy(status.code)} style={btn(true)}><IconCopy size={14} /> Copy link</button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button type="button" onClick={() => share(status.code)} style={btn(false)}><IconShare size={14} /> Share</button>
            )}
            <button type="button" disabled={busy} onClick={() => unlink(false)} style={btn(false)}>Cancel invite</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={createInvite} style={btn(true)}>
          {busy ? <LoadingSpinner size={14} /> : <IconHeartHandshake size={14} />} Create invite link
        </button>
      )}
    </div>
  )
}
