'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { nzd, type Month } from '@/lib/rental'

// Rent in beside money out (mortgage, then other costs, stacked) for each
// month. Colours are the first three validated categorical slots; dark mode
// uses their dark steps.

const STYLE = `
.rental-chart { --s-rent: #2a78d6; --s-mortgage: #eb6834; --s-costs: #1baf7a; }
[data-theme="dark"] .rental-chart { --s-rent: #3987e5; --s-mortgage: #d95926; --s-costs: #199e70; }
`

const NAMES: Record<string, string> = { rent: 'Rent in', mortgage: 'Mortgage', costs: 'Other costs' }

export function CoverageChart({ data }: { data: Month[] }) {
  return (
    <div className="rental-chart" style={{ width: '100%', height: 240 }}>
      <style>{STYLE}</style>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text2)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false}
            interval="preserveStartEnd" tickFormatter={(v: string) => v.replace(' (so far)', '')} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text2)' }} axisLine={false} tickLine={false} width={52}
            tickFormatter={(v: number) => v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`} />
          <Tooltip
            cursor={{ fill: 'var(--text2)', fillOpacity: 0.08 }}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }}
            labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
            itemStyle={{ color: 'var(--text)' }}
            formatter={(v: any, k: any) => [nzd.format(Number(v)), NAMES[String(k)] ?? String(k)]}
          />
          <Legend formatter={(k: string) => <span style={{ color: 'var(--text2)', fontSize: 12 }}>{NAMES[k] ?? k}</span>} iconType="square" iconSize={10} />
          <Bar dataKey="rent" fill="var(--s-rent)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="mortgage" stackId="out" fill="var(--s-mortgage)" stroke="var(--surface)" strokeWidth={1} maxBarSize={18} />
          <Bar dataKey="costs" stackId="out" fill="var(--s-costs)" stroke="var(--surface)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
