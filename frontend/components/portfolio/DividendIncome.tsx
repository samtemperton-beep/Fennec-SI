'use client'
import { useEffect, useMemo, useState } from 'react'
import { IconCoins, IconRefresh } from '@tabler/icons-react'
import { api } from '@/lib/api'
import { estimateIncome, yahooSymbol, type HoldingIncome, type IncomeEstimate, type IncomeInput } from '@/lib/dividends'
import { fmtMoney } from '@/lib/utils'
import type { Holding } from '@/components/portfolio/HoldingsTable'

// Estimated dividend income from what each holding paid over the last year.
// The numbers come from lib/dividends.ts (tested). Nothing here is a promise:
// companies can change or stop dividends at any time.

const MARKET_CURRENCY: Record<string, string> = { US: 'USD', ASX: 'AUD', NZX: 'NZD', LSE: 'GBP' }
const marketCurrency = (m?: string | null) => MARKET_CURRENCY[(m || 'US').toUpperCase()] ?? 'USD'
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const BATCH = 40
const TAX_KEY = 'fennec_div_after_tax'
export const US_WITHHOLDING = 0.15

const money = (n: number, cur: string) => fmtMoney(n, cur, Math.abs(n) >= 100 ? 0 : 2)
const shortDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })

type Raw = Record<string, { status: 'ok' | 'unknown' | 'error'; currency: string | null; payments: { date: string; amount: number }[] }>
type Loaded = { raw: Raw; rates: Record<string, number | null> }

export interface IncomeView {
  estimate: IncomeEstimate
  currency: string // common currency the amounts are in
  nzdPerCommon: number | null // for an "≈ NZ$" line when the common currency isn't NZD
  total: number // holdings considered
  afterTax: boolean
  retry: boolean // some lookups failed
}

const trendLabel = (t: HoldingIncome['trend']) => (t === 'rising' ? 'Raised' : t === 'falling' ? 'Cut' : null)

export function IncomeCard({ view, onToggleTax, onRetry }: { view: IncomeView; onToggleTax?: () => void; onRetry?: () => void }) {
  const { estimate: e, currency, nzdPerCommon, total, afterTax } = view
  const peak = Math.max(...e.byMonth, 0.0001)
  const thisMonth = new Date().getMonth()
  const tile = (label: string, main: string, sub?: string | null) => (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{label}</p>
      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 17, fontWeight: 500 }}>{main}</p>
      {sub && <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>{sub}</p>}
    </div>
  )

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconCoins size={17} style={{ color: 'var(--primary)' }} />
          <div>
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 15 }}>Dividend income <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 12 }}>(estimate)</span></p>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Based on what your holdings paid over the last year, in {currency}</p>
          </div>
        </div>
        {onToggleTax && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={afterTax} onChange={onToggleTax} />
            After {US_WITHHOLDING * 100}% US tax
          </label>
        )}
      </div>

      {e.payers.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          None of your holdings paid a dividend that we can see in the last two years, so there&apos;s no income to estimate.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 10, marginBottom: 16 }}>
            {tile('Estimated a year', money(e.annual, currency), `${currency !== 'NZD' && nzdPerCommon ? `≈ ${fmtMoney(e.annual * nzdPerCommon, 'NZD', 0)} NZD · ` : ''}${afterTax ? 'after US tax' : 'before tax'}`)}
            {tile('Portfolio yield', e.yieldPct == null ? '—' : `${e.yieldPct.toFixed(2)}%`, 'income ÷ value')}
            {tile('Paying dividends', `${e.payers.length} of ${total}`, e.payers.length === 1 ? 'holding' : 'holdings')}
            {tile('Next expected', e.next ? shortDate(e.next.date) : '—', e.next ? `${e.next.ticker} · ${money(e.next.amount, currency)}` : null)}
          </div>

          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Expected by month, in a typical year</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4, alignItems: 'end', height: 78, marginBottom: 4 }}>
            {e.byMonth.map((v, i) => (
              <div key={i} title={`${MONTH_NAMES[i]}: ${money(v, currency)}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ height: `${v > 0 ? Math.max(6, (v / peak) * 100) : 2}%`, background: v > 0 ? 'var(--primary)' : 'var(--surface3)', borderRadius: 3, opacity: i === thisMonth ? 1 : 0.7 }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4, marginBottom: 16 }}>
            {MONTHS.map((m, i) => <span key={i} style={{ fontSize: 9, textAlign: 'center', color: i === thisMonth ? 'var(--text)' : 'var(--text3)', fontWeight: i === thisMonth ? 700 : 400 }}>{m}</span>)}
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
            {e.payers.map((p, i) => {
              const t = trendLabel(p.trend)
              return (
                <div key={p.ticker} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,1.3fr) minmax(70px,0.8fr) minmax(80px,1fr) 60px minmax(90px,1fr)', gap: 8, padding: '8px 12px', fontSize: 11, alignItems: 'center', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 700 }}>{p.ticker}</span>
                    {t && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: t === 'Raised' ? 'var(--green)' : 'var(--red)' }}>{t}</span>}
                    {p.hadSpecial && <span title="A one-off special dividend in the last two years was left out" style={{ marginLeft: 6, fontSize: 9, color: 'var(--text3)' }}>special excluded</span>}
                    {p.confidence === 'low' && <span title="Not much payment history, so this is a rough guess" style={{ marginLeft: 6, fontSize: 9, color: 'var(--amber)' }}>limited history</span>}
                  </span>
                  <span style={{ color: 'var(--text3)' }}>{p.frequency}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace' }}>{money(p.annual, currency)}/yr</span>
                  <span style={{ color: 'var(--text3)' }}>{p.yieldPct == null ? '' : `${p.yieldPct.toFixed(1)}%`}</span>
                  <span style={{ color: 'var(--text3)' }}>next {shortDate(p.next.date)}</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      <ul style={{ margin: '0 0 10px', paddingLeft: 16, fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
        {e.nonPayers.length > 0 && <li>No dividends in the last two years: {e.nonPayers.join(', ')}.</li>}
        {e.lapsed.length > 0 && <li>Paid in the past but not recently, so assumed to have stopped: {e.lapsed.join(', ')}.</li>}
        {e.noData.length > 0 && <li>No dividend data found for: {e.noData.join(', ')}.</li>}
        {e.noRate.length > 0 && <li>Left out because there&apos;s no exchange rate for them: {e.noRate.join(', ')}.</li>}
      </ul>
      {view.retry && onRetry && (
        <button onClick={onRetry} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', marginBottom: 10 }}>
          <IconRefresh size={12} /> Retry the ones that failed
        </button>
      )}
      <p style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.6 }}>
        An estimate from past payments, not a promise: companies can raise, cut or stop dividends at any time. US dividends are usually taxed at 15% at source for NZ investors who have filed a W-8BEN, and dividends can also be taxable in NZ. This isn&apos;t tax advice.
      </p>
    </div>
  )
}

export function DividendIncome({ holdings, nzdPerUsd }: { holdings: Holding[]; nzdPerUsd?: number | null }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [data, setData] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [afterTax, setAfterTax] = useState(false)

  useEffect(() => {
    try { setAfterTax(localStorage.getItem(TAX_KEY) === '1') } catch { /* storage unavailable */ }
  }, [])
  const toggleTax = () => setAfterTax(v => {
    try { localStorage.setItem(TAX_KEY, v ? '0' : '1') } catch { /* ignore */ }
    return !v
  })

  const priced = useMemo(() => holdings.filter(h => h.shares > 0 && h.shares * h.current_price > 0), [holdings])
  // Refetch only when the set of holdings changes, not on every price tick.
  const symbolKey = useMemo(() => [...new Set(priced.map(h => yahooSymbol(h.ticker, h.market)))].sort().join(','), [priced])

  useEffect(() => {
    if (!symbolKey) return
    let cancelled = false
    setState('loading')
    ;(async () => {
      try {
        const symbols = symbolKey.split(',')
        const raw: Raw = {}
        for (let i = 0; i < symbols.length; i += BATCH) Object.assign(raw, (await api.getDividends(symbols.slice(i, i + BATCH))).dividends)
        const currencies = new Set<string>()
        for (const h of priced) currencies.add(raw[yahooSymbol(h.ticker, h.market)]?.currency || marketCurrency(h.market))
        const need = [...currencies].filter(c => c !== 'NZD')
        const rates: Record<string, number | null> = need.length ? (await api.getFxRates(need)).rates : {}
        if (cancelled) return
        setData({ raw, rates })
        setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => { cancelled = true }
  }, [symbolKey, attempt])

  const view = useMemo<IncomeView | null>(() => {
    if (!data) return null
    const cur = (h: Holding) => data.raw[yahooSymbol(h.ticker, h.market)]?.currency || marketCurrency(h.market)
    const common = priced.every(h => cur(h) === 'USD') ? 'USD' : 'NZD'
    const nzd = (c: string) => (c === 'NZD' ? 1 : data.rates[c] ?? null)
    const base = nzd(common)
    const inputs: IncomeInput[] = priced.map(h => {
      const r = data.raw[yahooSymbol(h.ticker, h.market)]
      return {
        ticker: h.ticker, name: h.name, market: h.market, shares: h.shares, value: h.shares * h.current_price, currency: cur(h),
        payments: r && r.status === 'ok' ? r.payments : null,
      }
    })
    const estimate = estimateIncome(inputs, {
      toCommon: c => { const n = nzd(c); return n != null && base ? n / base : null },
      usWithholding: afterTax ? US_WITHHOLDING : 0,
    })
    const failed = priced.some(h => data.raw[yahooSymbol(h.ticker, h.market)]?.status === 'error')
    return { estimate, currency: common, nzdPerCommon: common === 'NZD' ? 1 : common === 'USD' ? nzdPerUsd ?? base : base, total: priced.length, afterTax, retry: failed }
  }, [data, priced, afterTax, nzdPerUsd])

  if (!symbolKey) return null

  if (state === 'loading' && !view) {
    return <div className="card" style={{ marginBottom: 20 }}><p style={{ fontSize: 12, color: 'var(--text3)' }}>Checking dividends…</p></div>
  }
  if (state === 'error') {
    return (
      <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)' }}>
        <span>Dividend data couldn&apos;t be loaded just now.</span>
        <button onClick={() => setAttempt(a => a + 1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)' }}>
          <IconRefresh size={12} /> Retry
        </button>
      </div>
    )
  }
  if (!view) return null
  return <IncomeCard view={view} onToggleTax={toggleTax} onRetry={() => setAttempt(a => a + 1)} />
}
