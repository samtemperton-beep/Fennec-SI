'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { IconWand, IconSend } from '@tabler/icons-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Avatar } from '@/components/shared/Avatar'
import { POST_TYPES, VIEWS, POST_MAX, NOT_ADVICE } from '@/lib/community'

interface Props {
  username: string
  avatarColor?: string
  avatarEmoji?: string
  avatarUrl?: string
  /** Resolves true once posted, so the draft is only cleared then. */
  onPost: (post: { type: string; ticker?: string; signal?: string; body: string }) => Promise<boolean>
}

export function PostComposer({ username, avatarColor, avatarEmoji, avatarUrl, onPost }: Props) {
  const [type, setType] = useState('discussion')
  const [ticker, setTicker] = useState('')
  const [signal, setSignal] = useState('')
  const [body, setBody] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [posting, setPosting] = useState(false)
  const withShare = type === 'pick' || type === 'news'

  async function draftWithAI() {
    if (!ticker) return
    setDrafting(true)
    try {
      const { text } = await api.draftPost(ticker, signal || 'neutral', `Type: ${type}`)
      setBody(String(text).slice(0, POST_MAX))
    } catch {}
    setDrafting(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || posting) return
    setPosting(true)
    const ok = await onPost({ type, ticker: withShare && ticker ? ticker : undefined, signal: withShare && signal ? signal : undefined, body: body.trim() })
    setPosting(false)
    if (ok) { setBody(''); setTicker(''); setSignal(''); setType('discussion') }
  }

  const field: React.CSSProperties = { padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }

  return (
    <div className="card mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Avatar username={username} avatarColor={avatarColor} avatarEmoji={avatarEmoji} avatarUrl={avatarUrl} size={32} />
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14 }}>{username}</span>
      </div>

      <form onSubmit={submit}>
        <div className="flex gap-2 mb-3 flex-wrap">
          {POST_TYPES.map(t => (
            <button key={t.id} type="button" onClick={() => setType(t.id)} aria-pressed={type === t.id}
              style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12,
                fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer',
                background: type === t.id ? 'var(--accent)' : 'var(--surface2)',
                color: type === t.id ? 'white' : 'var(--text2)',
                border: type === t.id ? 'none' : '1px solid var(--border)',
              }}
            >{t.label}</button>
          ))}
        </div>

        {withShare && (
          <div className="flex gap-2 mb-3 flex-wrap">
            <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 12))}
              placeholder="Share code (FPH, AIR, AAPL)" aria-label="Share code"
              style={{ ...field, flex: 1, minWidth: 140, fontFamily: 'DM Mono, monospace' }} />
            <select value={signal} onChange={e => setSignal(e.target.value)} aria-label="Your view" style={{ ...field, color: 'var(--text2)' }}>
              <option value="">Your view (optional)</option>
              {VIEWS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
        )}

        <textarea value={body} onChange={e => setBody(e.target.value.slice(0, POST_MAX))}
          placeholder={type === 'milestone' ? 'Share a milestone (percentages, not dollar amounts, keep things private)' : 'What’s your take?'}
          rows={3} style={{ ...field, width: '100%', resize: 'vertical', marginBottom: 8, padding: '10px 12px' }} />

        <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.5 }}>
          {NOT_ADVICE} Don’t post personal details, or anything you’d be paid or benefit from promoting.
        </p>

        <div className="flex items-center justify-between">
          <span style={{ fontSize: 11, color: body.length > POST_MAX - 50 ? 'var(--amber)' : 'var(--text2)' }}>
            {body.length}/{POST_MAX}
          </span>
          <div className="flex gap-2">
            {withShare && ticker && (
              <button type="button" onClick={draftWithAI} disabled={drafting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'rgba(91,106,255,0.15)', color: 'var(--accent2)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}
              >
                {drafting ? <LoadingSpinner size={12} /> : <IconWand size={13} />} AI draft
              </button>
            )}
            <button type="submit" disabled={!body.trim() || posting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm"
              style={{ background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, opacity: !body.trim() || posting ? 0.5 : 1 }}
            >
              <IconSend size={14} /> {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
