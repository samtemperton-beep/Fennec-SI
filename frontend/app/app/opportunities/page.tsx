'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner, SkeletonCard } from '@/components/shared/LoadingSpinner'
import { IconBrain, IconRefresh } from '@tabler/icons-react'
import { toast } from 'sonner'

interface Opp {
  ticker: string; name: string; theme: string; reason: string
  risk_level: number; upside_min_pct: number; upside_max_pct: number
}

const RISK_COLOR = (r: number) => r <= 3 ? 'var(--green)' : r <= 6 ? 'var(--amber)' : 'var(--red)'
const RISK_LABEL = (r: number) => r <= 3 ? 'Low' : r <= 6 ? 'Medium' : 'High'

export default function OpportunitiesPage() {
  const [opps, setOpps] = useState<Opp[]>([])
  const [loading, setLoading] = useState(false)
  const [riskLevel, setRiskLevel] = useState(7)
  const [holdings, setHoldings] = useState<string[]>([])
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const [{ data: profile }, { data: h }] = await Promise.all([
        supabase.from('profiles').select('risk_level').eq('id', user.id).single(),
        supabase.from('holdings').select('ticker').eq('user_id', user.id),
      ])
      if (profile) setRiskLevel(profile.risk_level || 7)
      if (h) setHoldings(h.map((x: any) => x.ticker))
    })
  }, [])

  async function generate() {
    setLoading(true)
    try {
      const { data } = await api.getOpportunities(riskLevel, holdings)
      setOpps(data || [])
    } catch (e: any) {
      toast.error(e.message)
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: 24 }}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Opportunities</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>AI-curated picks based on your risk profile (excludes your holdings)</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13, color: 'var(--text2)', fontFamily: 'Syne, sans-serif' }}>Risk</span>
            <input type="range" min={1} max={10} value={riskLevel} onChange={e => setRiskLevel(Number(e.target.value))} style={{ width: 80, accentColor: 'var(--accent)' }} />
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, width: 12, color: RISK_COLOR(riskLevel) }}>{riskLevel}</span>
          </div>
          <button onClick={generate} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg"
            style={{ background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}
          >
            {loading ? <LoadingSpinner size={16} /> : <IconRefresh size={16} />} Find Opportunities
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : opps.length === 0 ? (
        <div className="card text-center py-16">
          <IconBrain size={40} style={{ color: 'var(--text2)', margin: '0 auto 12px' }} />
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 18, marginBottom: 8 }}>No opportunities generated yet</p>
          <p style={{ color: 'var(--text2)' }}>Click Find Opportunities to get personalised AI picks</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {opps.map((o, i) => (
            <div key={i} className="card hover:border-accent transition-colors" style={{ transition: 'border-color 0.2s' }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 18 }}>{o.ticker}</span>
                  <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 8 }}>{o.name}</span>
                </div>
                <span style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: `${RISK_COLOR(o.risk_level)}20`, color: RISK_COLOR(o.risk_level) }}>
                  {RISK_LABEL(o.risk_level)} Risk
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--accent2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {o.theme}
              </div>
              <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16 }}>{o.reason}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>Upside range</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, color: 'var(--green)', fontSize: 14 }}>
                  +{o.upside_min_pct}% — +{o.upside_max_pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
