'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { IconPlus, IconCheck, IconBriefcase } from '@tabler/icons-react'
import { toast } from 'sonner'

interface Props {
  ticker: string
  market?: string
  userId: string | null
  inWatchlist: boolean
  inPortfolio: boolean
  onAdded?: (ticker: string) => void
  size?: 'sm' | 'md'
}

export function WatchlistButton({ ticker, market = 'US', userId, inWatchlist, inPortfolio, onAdded, size = 'sm' }: Props) {
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(inWatchlist)
  const supabase = createClient()

  if (inPortfolio) {
    return (
      <span title="In your portfolio" style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: size === 'sm' ? 10 : 12, padding: size === 'sm' ? '3px 7px' : '4px 10px',
        borderRadius: 6, background: 'rgba(16,185,129,0.12)', color: 'var(--green)',
        fontFamily: 'Syne, sans-serif', fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        <IconBriefcase size={size === 'sm' ? 10 : 12} /> Portfolio
      </span>
    )
  }

  if (added) {
    return (
      <span title="In your watchlist" style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: size === 'sm' ? 10 : 12, padding: size === 'sm' ? '3px 7px' : '4px 10px',
        borderRadius: 6, background: 'rgba(91,106,255,0.12)', color: 'var(--accent2)',
        fontFamily: 'Syne, sans-serif', fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        <IconCheck size={size === 'sm' ? 10 : 12} /> Watching
      </span>
    )
  }

  async function add(e: React.MouseEvent) {
    e.stopPropagation()
    if (!userId || adding) return
    setAdding(true)
    const { error } = await supabase.from('watchlist').insert({ user_id: userId, ticker: ticker.toUpperCase(), market })
    setAdding(false)
    if (error) { toast.error(error.message); return }
    setAdded(true)
    onAdded?.(ticker)
    toast.success(`${ticker} added to watchlist`)
  }

  return (
    <button onClick={add} disabled={adding} title="Add to watchlist" style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: size === 'sm' ? 10 : 12, padding: size === 'sm' ? '3px 7px' : '4px 10px',
      borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)',
      color: 'var(--text2)', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 600,
      whiteSpace: 'nowrap', opacity: adding ? 0.5 : 1,
    }}>
      <IconPlus size={size === 'sm' ? 10 : 12} /> Watch
    </button>
  )
}
