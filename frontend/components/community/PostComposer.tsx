'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { IconWand, IconSend } from '@tabler/icons-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Avatar } from '@/components/shared/Avatar'

interface Props {
  username: string
  avatarColor?: string
  avatarEmoji?: string
  avatarUrl?: string
  onPost: (post: { type: string; ticker?: string; signal?: string; body: string }) => void
}

const TYPES = ['pick', 'milestone', 'news', 'discussion']
const SIGNALS = ['bullish', 'bearish', 'neutral']

export function PostComposer({ username, avatarColor, avatarEmoji, avatarUrl, onPost }: Props) {
  const [type, setType] = useState('discussion')
  const [ticker, setTicker] = useState('')
  const [signal, setSignal] = useState('')
  const [body, setBody] = useState('')
  const [drafting, setDrafting] = useState(false)

  async function draftWithAI() {
    if (!ticker) return
    setDrafting(true)
    try {
      const { text } = await api.draftPost(ticker, signal || 'neutral', `Type: ${type}`)
      setBody(text)
    } catch {}
    setDrafting(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    onPost({ type, ticker: ticker || undefined, signal: signal || undefined, body: body.trim() })
    setBody(''); setTicker(''); setSignal(''); setType('discussion')
  }

  return (
    <div className="card mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Avatar username={username} avatarColor={avatarColor} avatarEmoji={avatarEmoji} avatarUrl={avatarUrl} size={32} />
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14 }}>{username}</span>
      </div>

      <form onSubmit={submit}>
        <div className="flex gap-2 mb-3 flex-wrap">
          {TYPES.map(t => (
            <button key={t} type="button" onClick={() => setType(t)}
              style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12,
                fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer',
                background: type === t ? 'var(--accent)' : 'var(--surface2)',
                color: type === t ? 'white' : 'var(--text2)',
                border: type === t ? 'none' : '1px solid var(--border)',
              }}
            >{t}</button>
          ))}
        </div>

        {(type === 'pick' || type === 'news') && (
          <div className="flex gap-2 mb-3">
            <input
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="Ticker (AAPL)"
              style={{ flex: 1, padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 13, outline: 'none' }}
            />
            <select
              value={signal}
              onChange={e => setSignal(e.target.value)}
              style={{ padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)', fontFamily: 'DM Mono, monospace', fontSize: 13 }}
            >
              <option value="">Signal</option>
              {SIGNALS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        )}

        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="What's your take?"
          rows={3}
          style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 13, resize: 'none', outline: 'none', marginBottom: 10 }}
        />

        <div className="flex items-center justify-between">
          <span style={{ fontSize: 11, color: body.length > 500 ? 'var(--red)' : 'var(--text2)' }}>
            {body.length}/500
          </span>
          <div className="flex gap-2">
            {ticker && (
              <button type="button" onClick={draftWithAI} disabled={drafting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'rgba(91,106,255,0.15)', color: 'var(--accent2)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}
              >
                {drafting ? <LoadingSpinner size={12} /> : <IconWand size={13} />} AI Draft
              </button>
            )}
            <button type="submit" disabled={!body.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm"
              style={{ background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, opacity: !body.trim() ? 0.5 : 1 }}
            >
              <IconSend size={14} /> Post
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
