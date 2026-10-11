'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

const supabase = createClient()
const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })

// NZ tax year: 1 Apr – 31 Mar
function taxYearRange(year: number) {
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` }
}
function currentTaxYear() {
  const now = new Date()
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
}

// NZ individual income tax brackets (2024-25 onwards)
function calcIncomeTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0
  const brackets = [
    { limit: 14000, rate: 0.105 },
    { limit: 48000, rate: 0.175 },
    { limit: 70000, rate: 0.30 },
    { limit: 180000, rate: 0.33 },
    { limit: Infinity, rate: 0.39 },
  ]
  let tax = 0
  let prev = 0
  for (const { limit, rate } of brackets) {
    if (taxableIncome <= prev) break
    tax += (Math.min(taxableIncome, limit) - prev) * rate
    prev = limit
  }
  return tax
}

// Effective rate breakdown for display
function bracketBreakdown(taxableIncome: number) {
  const brackets = [
    { label: '$0 – $14,000', limit: 14000, prev: 0, rate: 0.105 },
    { label: '$14,001 – $48,000', limit: 48000, prev: 14000, rate: 0.175 },
    { label: '$48,001 – $70,000', limit: 70000, prev: 48000, rate: 0.30 },
    { label: '$70,001 – $180,000', limit: 180000, prev: 70000, rate: 0.33 },
    { label: 'Over $180,000', limit: Infinity, prev: 180000, rate: 0.39 },
  ]
  return brackets
    .filter(b => taxableIncome > b.prev)
    .map(b => {
      const taxable = Math.min(taxableIncome, b.limit) - b.prev
      return { label: b.label, rate: b.rate, taxable, tax: taxable * b.rate }
    })
}

interface TxRow { date: string; amount: number }

async function fetchBizTotals(year: number) {
  const { from, to } = taxYearRange(year)
  const { data: accounts } = await supabase
    .from('fin_accounts').select('id').eq('is_business', true)
  if (!accounts?.length) return { income: 0, expenses: 0 }
  const ids = accounts.map((a: any) => a.id)
  const { data } = await supabase
    .from('fin_transactions')
    .select('amount')
    .in('account_id', ids)
    .gte('date', from).lte('date', to)
  const txs: TxRow[] = (data as any) || []
  return {
    income: txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    expenses: txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
  }
}

export default function BusinessTaxPage() {
  const [taxYear, setTaxYear] = useState(currentTaxYear())
  const [current, setCurrent] = useState<{ income: number; expenses: number } | null>(null)
  const [prior, setPrior] = useState<{ income: number; expenses: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [taxYear])

  async function load() {
    setLoading(true)
    const [cur, prv] = await Promise.all([
      fetchBizTotals(taxYear),
      fetchBizTotals(taxYear - 1),
    ])
    setCurrent(cur)
    setPrior(prv)
    setLoading(false)
  }

  const years = Array.from({ length: 5 }, (_, i) => currentTaxYear() - i + 1)

  const netProfit = (current?.income ?? 0) - (current?.expenses ?? 0)
  const priorNetProfit = (prior?.income ?? 0) - (prior?.expenses ?? 0)

  // Income tax estimate (sole trader / individual)
  const estimatedTax = calcIncomeTax(Math.max(netProfit, 0))
  const priorTax = calcIncomeTax(Math.max(priorNetProfit, 0))

  // Provisional tax: 105% of prior year's tax (standard uplift method)
  const provisionalTax = priorTax * 1.05

  // GST estimate (15%): if GST registered, collect 15% on income, claim 15% on expenses
  // GST component = amount × 3/23 (if amounts are GST-inclusive)
  const gstOnIncome = (current?.income ?? 0) * (3 / 23)
  const gstOnExpenses = (current?.expenses ?? 0) * (3 / 23)
  const gstOwing = gstOnIncome - gstOnExpenses

  const effectiveRate = netProfit > 0 ? ((estimatedTax / netProfit) * 100).toFixed(1) : '0.0'
  const breakdown = bracketBreakdown(Math.max(netProfit, 0))

  const isCurrentYear = taxYear === currentTaxYear()

  return (
    <div style={{ padding: 28, maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Tax Summary</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>NZ income tax estimates based on your business P&L</p>
        </div>
        <select value={taxYear} onChange={e => setTaxYear(Number(e.target.value))}
          style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer' }}>
          {years.map(y => <option key={y} value={y}>{y}–{y + 1} tax year</option>)}
        </select>
      </div>

      {isCurrentYear && (
        <div style={{ marginBottom: 20, padding: '10px 16px', borderRadius: 10, background: '#F59E0B22', border: '1px solid #F59E0B44', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          ⚠️ <strong>In-progress year</strong> — figures below are estimates based on transactions synced so far.
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><LoadingSpinner size={32} /></div>
      ) : (
        <>
          {/* P&L summary */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, marginBottom: 16 }}>P&L — {taxYear}–{taxYear + 1}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {[
                { label: 'Gross Income', v: current?.income ?? 0, c: 'var(--green)' },
                { label: 'Total Expenses', v: current?.expenses ?? 0, c: 'var(--red)' },
                { label: 'Net Profit', v: netProfit, c: netProfit >= 0 ? 'var(--text)' : 'var(--red)' },
              ].map(k => (
                <div key={k.label} style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--surface2)' }}>
                  <p style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>{k.label}</p>
                  <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 18, color: k.c }}>{currency.format(k.v)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Income tax estimate */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>Income Tax Estimate (Sole Trader)</p>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 22, color: 'var(--primary)' }}>{currency.format(estimatedTax)}</p>
                <p style={{ fontSize: 11, color: 'var(--text3)' }}>effective rate {effectiveRate}%</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {breakdown.map(b => (
                <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'var(--surface2)' }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600 }}>{b.label}</p>
                    <p style={{ fontSize: 11, color: 'var(--text3)' }}>{(b.rate * 100).toFixed(1)}% on {currency.format(b.taxable)}</p>
                  </div>
                  <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 13 }}>{currency.format(b.tax)}</p>
                </div>
              ))}
              {breakdown.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', padding: 16 }}>No taxable profit for this year.</p>
              )}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12, lineHeight: 1.6 }}>
              NZ individual tax brackets applied to net profit. Does not account for personal allowances, credits, losses carried forward, or company structure.
            </p>
          </div>

          {/* Provisional tax */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <div>
                <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>Provisional Tax</p>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>Standard uplift: 105% of {taxYear - 1}–{taxYear} tax</p>
              </div>
              <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 22, color: 'var(--primary)' }}>{currency.format(provisionalTax)}</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface2)' }}>
                <p style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Prior year tax</p>
                <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15 }}>{currency.format(priorTax)}</p>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface2)' }}>
                <p style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Uplift factor</p>
                <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15 }}>× 1.05</p>
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12, lineHeight: 1.6 }}>
              Three instalments due: 28 Aug, 15 Jan, 7 May. Use the estimation or ratio methods if your income has changed significantly.
            </p>
          </div>

          {/* GST estimate */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <div>
                <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>GST Estimate (15%)</p>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>GST-inclusive amounts assumed</p>
              </div>
              <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 22, color: gstOwing >= 0 ? 'var(--red)' : 'var(--green)' }}>
                {gstOwing >= 0 ? 'Owe ' : 'Refund '}{currency.format(Math.abs(gstOwing))}
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'GST collected (income)', v: gstOnIncome, c: 'var(--red)' },
                { label: 'GST claimed (expenses)', v: gstOnExpenses, c: 'var(--green)' },
              ].map(k => (
                <div key={k.label} style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface2)' }}>
                  <p style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{k.label}</p>
                  <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color: k.c }}>{currency.format(k.v)}</p>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12, lineHeight: 1.6 }}>
              Only applies if GST-registered. Verify your filing period with IRD and consult your accountant for actual returns.
            </p>
          </div>

          {/* Disclaimer */}
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text2)' }}>Disclaimer:</strong> These are estimates for planning purposes only. They are not tax advice. Consult a registered tax agent or accountant for your actual obligations. Ask Fennec for guidance on specific questions.
          </div>
        </>
      )}
    </div>
  )
}
