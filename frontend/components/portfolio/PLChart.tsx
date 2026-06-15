'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { Holding } from './HoldingsTable'
import { fmtCurrency } from '@/lib/utils'

export function PLChart({ holdings }: { holdings: Holding[] }) {
  const data = holdings.map(h => ({
    name: h.ticker,
    pl: parseFloat(((h.current_price - h.buy_price) * h.shares).toFixed(2)),
  })).sort((a, b) => b.pl - a.pl)

  return (
    <div className="card">
      <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 16, fontSize: 15 }}>P&amp;L by Stock</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text2)', fontFamily: 'DM Mono, monospace' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text2)', fontFamily: 'DM Mono, monospace' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
          <Tooltip
            formatter={(v: any) => [fmtCurrency(v), 'P&L']}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'DM Mono, monospace', fontSize: 12 }}
            labelStyle={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, color: 'var(--text)' }}
          />
          <Bar dataKey="pl" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.pl >= 0 ? 'var(--green)' : 'var(--red)'} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
