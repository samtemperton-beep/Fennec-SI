'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { IconScale, IconAlertTriangle, IconCircleCheck, IconRefresh } from '@tabler/icons-react'
import { api } from '@/lib/api'
import { analyseBalance, type Balance, type BalanceInput, type Bucket, type Check, type ProfileInfo } from '@/lib/portfolioBalance'
import type { Holding } from '@/components/portfolio/HoldingsTable'

// How concentrated the portfolio is, against rule-of-thumb guidelines for the
// user's risk setting. The numbers come from lib/portfolioBalance.ts (tested).

const MARKET_CURRENCY: Record<string, string> = { US: 'USD', ASX: 'AUD', NZX: 'NZD', LSE: 'GBP' }
const currencyOf = (market?: string | null) => MARKET_CURRENCY[(market || 'US').toUpperCase()] ?? null
const PROFILE_BATCH = 40 // the API takes at most 40 tickers per request

type Loaded = { profiles: Record<string, ProfileInfo>; rates: Record<string, number | null> }

const pct = (w: number) => `${(w * 100).toFixed(w >= 0.1 ? 0 : 1)}%`

function BucketList({ title, buckets, maxRows = 6 }: { title: string; buckets: Bucket[]; maxRows?: number }) {
  const shown = buckets.slice(0, maxRows)
  const rest = buckets.slice(maxRows).reduce((s, b) => s + b.weight, 0)
  const rows = rest > 0.0005 ? [...shown, { label: 'Other', weight: rest }] : shown
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(b => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <span style={{ width: 130, flexShrink: 0, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.label}>{b.label}</span>
            <div style={{ flex: 1, height: 6, background: 'var(--surface3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, b.weight * 100)}%`, background: 'var(--primary)', borderRadius: 3, opacity: b.label === 'Other' ? 0.45 : 1 }} />
            </div>
            <span style={{ width: 38, textAlign: 'right', fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{pct(b.weight)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CheckRow({ c }: { c: Check }) {
  const watch = c.status === 'watch'
  const color = watch ? 'var(--amber)' : 'var(--green)'
  const pill = c.unit === 'count' ? (watch ? 'Fewer than guideline' : 'Within guideline') : watch ? 'Above guideline' : 'Within guideline'
  return (
    <div style={{ padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{c.title}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 20, padding: '1px 8px' }}>{pill}</span>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>{c.detail}</p>
      {c.unit === 'percent' ? (
        <>
          <div style={{ position: 'relative', height: 6, background: 'var(--surface3)', borderRadius: 3, margin: '8px 0 4px', overflow: 'visible' }}>
            <div style={{ height: '100%', width: `${Math.min(100, c.value * 100)}%`, background: color, borderRadius: 3 }} />
            <div title={`Guideline: ${pct(c.limit)}`} style={{ position: 'absolute', left: `${Math.min(100, c.limit * 100)}%`, top: -3, width: 2, height: 12, background: 'var(--text)', borderRadius: 1 }} />
          </div>
          <p style={{ fontSize: 10, color: 'var(--text3)' }}>Guideline for your risk setting: up to {pct(c.limit)}</p>
        </>
      ) : (
        <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>Guideline for your risk setting: at least {c.limit}</p>
      )}
    </div>
  )
}

function Header({ balance, riskLevel }: { balance: Balance | null; riskLevel: number }) {
  return (
  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconScale size={17} style={{ color: 'var(--primary)' }} />
          <div>
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 15 }}>Portfolio balance</p>
            {balance && (
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                Checked against rule-of-thumb guidelines for your risk setting ({riskLevel}/10, {balance.guidelines.label}){' '}
                <Link href="/app/settings" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>Change</Link>
              </p>
            )}
          </div>
        </div>
        {balance && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: balance.flags ? 'var(--amber)' : 'var(--green)' }}>
            {balance.flags ? <IconAlertTriangle size={14} /> : <IconCircleCheck size={14} />}
            {balance.flags ? `${balance.flags} thing${balance.flags !== 1 ? 's' : ''} worth a look` : 'Nothing stands out'}
          </span>
        )}
      </div>
  )
}

export function BalanceCard({ balance, leftOut, riskLevel }: { balance: Balance; leftOut: string[]; riskLevel: number }) {
  return (

    <div className="card" style={{ marginBottom: 20 }}>
      <Header balance={balance} riskLevel={riskLevel} />

      {balance.checks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 10, marginBottom: 16 }}>
          {balance.checks.map(c => <CheckRow key={c.id} c={c} />)}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.5 }}>
          Your portfolio is made up of funds and ETFs, which spread risk across many companies already, so there&apos;s no single-stock or sector concentration to check.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 20, marginBottom: 14 }}>
        <BucketList title="By sector" buckets={balance.sectors} />
        <BucketList title="Stocks vs funds" buckets={[{ label: 'Individual stocks', weight: balance.stockWeight }, { label: 'Funds & ETFs', weight: balance.fundWeight }].filter(b => b.weight > 0.0005)} />
        <BucketList title="Largest positions" buckets={balance.positions.slice(0, 5).map(p => ({ label: p.kind === 'fund' ? `${p.ticker} (fund)` : p.ticker, weight: p.weight }))} maxRows={5} />
      </div>

      {(balance.skipped.length > 0 || leftOut.length > 0) && (
        <ul style={{ margin: '0 0 10px', paddingLeft: 16, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
          {balance.skipped.map(s => <li key={s}>{s}</li>)}
          {leftOut.length > 0 && <li>Left out because there&apos;s no exchange rate for them: {leftOut.join(', ')}.</li>}
        </ul>
      )}

      <p style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.6 }}>
        These are common rules of thumb for spotting concentration, not advice and not a suggestion to buy or sell. Funds and ETFs are treated as already diversified. Sectors come from company data, grouped into broad sectors, and shares are weighted by current value.
      </p>
    </div>
  )
}

export function PortfolioBalance({ holdings, riskLevel }: { holdings: Holding[]; riskLevel: number }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [data, setData] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Re-fetch only when the set of tickers changes, not on every price tick.
  const tickerKey = useMemo(
    () => [...new Set(holdings.filter(h => h.shares * h.current_price > 0).map(h => h.ticker.toUpperCase()))].sort().join(','),
    [holdings]
  )

  useEffect(() => {
    if (!tickerKey) return
    let cancelled = false
    setState('loading')
    ;(async () => {
      try {
        const tickers = tickerKey.split(',')
        const profiles: Record<string, ProfileInfo> = {}
        for (let i = 0; i < tickers.length; i += PROFILE_BATCH) {
          const res = await api.getProfiles(tickers.slice(i, i + PROFILE_BATCH))
          Object.assign(profiles, res.profiles)
        }
        // If any lookup failed we can't tell ETFs from stocks, and guessing would
        // raise false concentration warnings, so treat that as "unavailable".
        if (tickers.some(t => !profiles[t] || profiles[t].status === 'error')) throw new Error('incomplete profiles')

        const currencies = new Set(holdings.map(h => currencyOf(h.market)))
        let rates: Record<string, number | null> = {}
        if (currencies.size > 1) {
          const need = [...currencies].filter((c): c is string => !!c && c !== 'NZD')
          if (need.length) rates = (await api.getFxRates(need)).rates
        }
        if (cancelled) return
        setData({ profiles, rates })
        setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => { cancelled = true }
  }, [tickerKey, attempt])

  const { balance, leftOut } = useMemo(() => {
    if (!data) return { balance: null, leftOut: [] as string[] }
    const mixed = new Set(holdings.map(h => currencyOf(h.market))).size > 1
    const left: string[] = []
    const inputs: BalanceInput[] = []
    for (const h of holdings) {
      let value = h.shares * h.current_price
      if (mixed) {
        const cur = currencyOf(h.market)
        const rate = cur === 'NZD' ? 1 : cur ? data.rates[cur] : null
        if (!rate) { if (value > 0) left.push(h.ticker); continue }
        value *= rate
      }
      inputs.push({ ticker: h.ticker, name: h.name, market: h.market, value, profile: data.profiles[h.ticker.toUpperCase()], sector: h.sector })
    }
    return { balance: analyseBalance(inputs, riskLevel), leftOut: left }
  }, [data, holdings, riskLevel])

  if (!tickerKey) return null

  if (state === 'loading' && !balance) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <Header balance={balance} riskLevel={riskLevel} />
        <p style={{ fontSize: 12, color: 'var(--text3)' }}>Checking sectors…</p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <Header balance={balance} riskLevel={riskLevel} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)' }}>
          <span>Sector data couldn&apos;t be loaded just now, so the balance check is paused rather than guess.</span>
          <button onClick={() => setAttempt(a => a + 1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)' }}>
            <IconRefresh size={12} /> Retry
          </button>
        </div>
      </div>
    )
  }

  if (!balance) return null

  return <BalanceCard balance={balance} leftOut={leftOut} riskLevel={riskLevel} />
}
