'use client'
import { signalClass } from '@/lib/utils'

export function SignalBadge({ signal }: { signal?: string | null }) {
  if (!signal) return null
  return (
    <span className={signalClass(signal)}>
      {signal.toUpperCase()}
    </span>
  )
}
