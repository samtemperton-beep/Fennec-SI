// Which of the user's holdings Akahu doesn't know about.
//
// After a sync, every position Akahu reports is stored with source = 'akahu'
// (manual rows with a matching ticker are converted in place). So any holding
// that is NOT source = 'akahu' is, by construction, not in the connected
// accounts: added by hand, imported from a CSV, or held at another broker.
//
// This only means something once Akahu has actually supplied positions. If it
// supplied none (connection down, empty response), every holding would look
// "unmatched", so the list is withheld entirely rather than invite the user to
// delete their whole portfolio.

export interface HoldingLike {
  id: number
  ticker: string
  source?: string | null
}

export interface UnmatchedResult<T> {
  /** Not in any connected Akahu account. */
  unmatched: T[]
  /** Same ticker as a synced position: almost certainly a leftover duplicate. */
  duplicates: T[]
}

export function findUnmatched<T extends HoldingLike>(holdings: T[], opts: { connected: boolean; kept: string[] }): UnmatchedResult<T> {
  const none = { unmatched: [] as T[], duplicates: [] as T[] }
  if (!opts.connected) return none

  const synced = new Set(holdings.filter(h => h.source === 'akahu').map(h => h.ticker.toUpperCase()))
  if (synced.size === 0) return none

  const kept = new Set(opts.kept.map(t => t.toUpperCase()))
  const out = { unmatched: [] as T[], duplicates: [] as T[] }
  for (const h of holdings) {
    if (h.source === 'akahu') continue
    const t = h.ticker.toUpperCase()
    if (kept.has(t)) continue
    ;(synced.has(t) ? out.duplicates : out.unmatched).push(h)
  }
  return out
}

const KEPT_KEY = 'fennec_keep_unmatched'

/** Tickers the user chose to keep. Browser storage can be unavailable, so never throw. */
export function loadKept(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEPT_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function saveKept(tickers: string[]): void {
  try {
    localStorage.setItem(KEPT_KEY, JSON.stringify([...new Set(tickers.map(t => t.toUpperCase()))]))
  } catch { /* ignore */ }
}
