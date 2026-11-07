// Share codes and their markets. A code alone is ambiguous: about 1 in 4 NZX
// codes is also a different US company (FPH is Fisher & Paykel Healthcare on
// the NZX but Five Point Holdings in the US), so prices are looked up by the
// full symbol: FPH.NZ (NZX), FPH.AX (ASX) or FPH (US).

export type Market = 'NZX' | 'ASX' | 'US'

export interface Listing { symbol: string; code: string; market: Market; name: string; price: number; currency: string }

export function splitSymbol(symbol: string): { code: string; market: Market } {
  const s = symbol.toUpperCase()
  if (s.endsWith('.NZ')) return { code: s.slice(0, -3), market: 'NZX' }
  if (s.endsWith('.AX')) return { code: s.slice(0, -3), market: 'ASX' }
  return { code: s, market: 'US' }
}

export const CURRENCY_OF: Record<Market, string> = { NZX: 'NZD', ASX: 'AUD', US: 'USD' }
const CURRENCY_SIGN: Record<Market, string> = { NZX: 'NZ$', ASX: 'A$', US: 'US$' }

/** 48.45 on FPH.NZ -> "NZ$48.45" */
export function priceIn(symbol: string, n: number): string {
  return `${CURRENCY_SIGN[splitSymbol(symbol).market]}${n.toFixed(2)}`
}
