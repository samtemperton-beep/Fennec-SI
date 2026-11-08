'use client'
import { useEffect, useMemo, useState } from 'react'
import { IconReceiptTax, IconRefresh } from '@tabler/icons-react'
import { api } from '@/lib/api'
import {
  estimateFdr, nzTaxYear, summariseFif, FDR_RATE, FIF_LIMIT_CURRENT, FIF_LIMIT_PROPOSED, MARGINAL_RATES,
  type FifInput, type FifSummary, type LimitStatus,
} from '@/lib/fif'
import { fmtMoney } from '@/lib/utils'
import type { Holding } from '@/components/portfolio/HoldingsTable'

// Awareness of NZ foreign investment fund (FIF) rules: how close the cost of
// overseas shares is to the de minimis limit. Numbers come from lib/fif.ts
// (tested). It is general information, not tax advice.

const MARKET_CURRENCY: Record<string, string> = { US: 'USD', ASX: 'AUD', NZX: 'NZD', LSE: 'GBP' }
const currencyOf = (m?: string | null) => MARKET_CURRENCY[(m || 'US').toUpperCase()] ?? 'USD'
const IRD_URL = 'https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-income/foreign-investment-funds-fifs'
const nz = (n: number) => `NZ${fmtMoney(n, 'NZD', 0)}` // "NZ$": the rest of this page is in US$
// The limits are public figures, so they stay shown when amounts are hidden.
const LIMIT_CURRENT = `NZ$${FIF_LIMIT_CURRENT.toLocaleString('en-NZ')}`
const LIMIT_PROPOSED = `NZ$${FIF_LIMIT_PROPOSED.toLocaleString('en-NZ')}`

const LEVEL_COLOR: Record<LimitStatus['level'], string> = {
  'well-under': 'var(--green)', 'getting-close': 'var(--amber)', close: 'var(--amber)', over: 'var(--red)',
}

function statusText(s: FifSummary): string {
  const cur = s.current, pro = s.proposed
  if (cur.level === 'well-under') return `Well under the current ${LIMIT_CURRENT} limit, with about ${nz(cur.headroom)} of room.`
  if (!cur.over) return `Getting close to the current ${LIMIT_CURRENT} limit, with about ${nz(cur.headroom)} of room left. If the cost of your overseas shares goes over it at any point in a tax year, the FIF rules apply for that year.`
  if (!pro.over) return `At or over the current ${LIMIT_CURRENT} limit, so unless the proposed ${LIMIT_PROPOSED} limit has become law, the FIF rules apply to you. You'd be under the proposed limit, with about ${nz(pro.headroom)} of room.`
  return `At or over both the current ${LIMIT_CURRENT} limit and the proposed ${LIMIT_PROPOSED} limit, so the FIF rules would apply to you either way.`
}

export interface FifView {
  summary: FifSummary
  asOf?: Date
}

export function FifCard({ view, marginalRate, onRate, onRetry }: { view: FifView; marginalRate: number; onRate?: (r: number) => void; onRetry?: () => void }) {
  const s = view.summary
  const year = nzTaxYear(view.asOf)
  const scale = Math.max(FIF_LIMIT_PROPOSED * 1.05, s.costNzd * 1.05)
  const fdr = estimateFdr(s.valueNzd, marginalRate)
  const tick = (limit: number, label: string, align: 'left' | 'right') => (
    <div style={{ position: 'absolute', left: `${(limit / scale) * 100}%`, top: -4, height: 16, borderLeft: '2px solid var(--text)' }}>
      <span style={{ position: 'absolute', top: 18, [align === 'left' ? 'left' : 'right']: 4, fontSize: 9, whiteSpace: 'nowrap', color: 'var(--text3)' }}>{label}</span>
    </div>
  )

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconReceiptTax size={17} style={{ color: 'var(--primary)' }} />
          <div>
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 15 }}>Overseas shares and NZ tax (FIF)</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Tax year {year.label} · {year.daysLeft} day{year.daysLeft !== 1 ? 's' : ''} left (it ends 31 March)</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 22, fontWeight: 500 }}>≈ {nz(s.costNzd)}</p>
        <p style={{ fontSize: 12, color: 'var(--text2)' }}>cost of your overseas shares, {Math.round(s.current.used * 100)}% of the current {LIMIT_CURRENT} limit</p>
      </div>

      <div style={{ position: 'relative', height: 8, background: 'var(--surface3)', borderRadius: 4, margin: '6px 0 30px' }}>
        <div style={{ height: '100%', width: `${Math.min(100, (s.costNzd / scale) * 100)}%`, background: LEVEL_COLOR[s.current.level], borderRadius: 4 }} />
        {tick(FIF_LIMIT_CURRENT, `${LIMIT_CURRENT} current rule`, 'right')}
        {tick(FIF_LIMIT_PROPOSED, `${LIMIT_PROPOSED} proposed`, 'right')}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, marginBottom: 10 }}>{statusText(s)}</p>

      <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 12 }}>
        <strong>The limit may be changing.</strong> Budget 2026 proposes raising it from {LIMIT_CURRENT} to {LIMIT_PROPOSED}, from 1 April 2026. Inland Revenue&apos;s information sheet of 28 May 2026 describes this as a proposal that could change in Parliament, so check{' '}
        <a href={IRD_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>ird.govt.nz</a> for whether it has passed.
      </p>

      {s.current.over && (
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>If the FIF rules apply (the usual &quot;fair dividend rate&quot; method)</p>
          <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>
            You&apos;re taxed on {FDR_RATE * 100}% of your shares&apos; market value at the <em>start</em> of the tax year (1 April), whether or not they paid anything. On today&apos;s value of {nz(s.valueNzd)} that&apos;s about <strong>{nz(fdr.incomeNzd)}</strong> of income.
          </p>
          <label style={{ fontSize: 11, color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            At a tax rate of
            <select value={marginalRate} onChange={e => onRate?.(Number(e.target.value))} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }}>
              {MARGINAL_RATES.map(r => <option key={r} value={r}>{(r * 100).toFixed(r === 0.105 || r === 0.175 ? 1 : 0)}%</option>)}
            </select>
            that&apos;s roughly <strong>{nz(fdr.taxNzd)}</strong> of tax. A rough guide: the real figure uses the 1 April value, not today&apos;s.
          </label>
        </div>
      )}

      <ul style={{ margin: '0 0 10px', paddingLeft: 16, fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
        {s.positions.length > 0 && <li>Biggest by cost: {s.positions.slice(0, 5).map(p => `${p.ticker} ${nz(p.costNzd)}`).join(', ')}.</li>}
        {s.nzx.length > 0 && <li>NZX-listed shares aren&apos;t foreign, so they&apos;re left out: {s.nzx.join(', ')}.</li>}
        {s.asx.positions.length > 0 && <li>ASX-listed shares ({s.asx.positions.map(p => p.ticker).join(', ')}, about {nz(s.asx.costNzd)}) are left out of the total because some Australian companies are exempt and some aren&apos;t. If none were exempt, your total would be about {nz(s.costWithAsxNzd)}.</li>}
        {s.noRate.length > 0 && <li>Left out because there&apos;s no exchange rate for them: {s.noRate.join(', ')}.</li>}
      </ul>
      {onRetry && s.noRate.length > 0 && (
        <button onClick={onRetry} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', marginBottom: 10 }}>
          <IconRefresh size={12} /> Retry exchange rates
        </button>
      )}

      <p style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.6 }}>
        Approximate. Inland Revenue counts the NZ dollars you actually paid when you bought, but we only have your cost in the share&apos;s own currency, so this uses today&apos;s exchange rate. Your broker&apos;s tax report has the exact figures. Funds and ETFs count as well as individual shares. This is general information, not tax advice; check with Inland Revenue or an accountant.
      </p>
    </div>
  )
}

export function FifTracker({ holdings }: { holdings: Holding[] }) {
  const [rates, setRates] = useState<Record<string, number | null> | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [rate, setRate] = useState(0.30)

  useEffect(() => {
    try { const v = Number(localStorage.getItem('fennec_fif_rate')); if (MARGINAL_RATES.includes(v)) setRate(v) } catch { /* storage unavailable */ }
  }, [])
  const chooseRate = (r: number) => { setRate(r); try { localStorage.setItem('fennec_fif_rate', String(r)) } catch { /* ignore */ } }

  const priced = useMemo(() => holdings.filter(h => h.shares > 0), [holdings])
  const currencyKey = useMemo(() => [...new Set(priced.map(h => currencyOf(h.market)))].filter(c => c !== 'NZD').sort().join(','), [priced])

  useEffect(() => {
    let cancelled = false
    if (!currencyKey) { setRates({}); setState('ready'); return }
    setState('loading')
    api.getFxRates(currencyKey.split(','))
      .then(r => { if (!cancelled) { setRates(r.rates); setState('ready') } })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [currencyKey, attempt])

  const summary = useMemo(() => {
    if (!rates) return null
    const inputs: FifInput[] = priced.map(h => ({ ticker: h.ticker, name: h.name, market: h.market, shares: h.shares, buyPrice: h.buy_price, currentPrice: h.current_price, currency: currencyOf(h.market) }))
    return summariseFif(inputs, c => rates[c] ?? null)
  }, [rates, priced])

  if (priced.length === 0) return null
  if (state === 'error') {
    return (
      <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)' }}>
        <span>Exchange rates couldn&apos;t be loaded just now, so the FIF check is paused.</span>
        <button onClick={() => setAttempt(a => a + 1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)' }}>
          <IconRefresh size={12} /> Retry
        </button>
      </div>
    )
  }
  if (!summary) return <div className="card" style={{ marginBottom: 20 }}><p style={{ fontSize: 12, color: 'var(--text3)' }}>Checking overseas share cost…</p></div>
  // Nothing foreign held: nothing to say.
  if (summary.positions.length === 0 && summary.asx.positions.length === 0) return null
  return <FifCard view={{ summary }} marginalRate={rate} onRate={chooseRate} onRetry={() => setAttempt(a => a + 1)} />
}
