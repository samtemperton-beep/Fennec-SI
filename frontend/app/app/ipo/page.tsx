'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconCalendar } from '@tabler/icons-react'

const REC_COLOR: Record<string, string> = {
  STRONG_BUY: 'var(--green)', WATCH: 'var(--amber)', SKIP: 'var(--red)',
}

interface IPO {
  symbol?: string; name?: string; date?: string; price?: string
  shares?: string; exchange?: string; status?: string
}

export default function IPOPage() {
  const [ipos, setIpos] = useState<IPO[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<IPO | null>(null)
  const [analysis, setAnalysis] = useState<any>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [filter, setFilter] = useState('All')

  useEffect(() => {
    api.getIPOs().then(data => { setIpos(Array.isArray(data) ? data : []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  async function openAnalysis(ipo: IPO) {
    setSelected(ipo); setAnalysis(null); setAnalyzing(true)
    try {
      const { data } = await api.analyzeIPO(ipo)
      setAnalysis(data)
    } catch {}
    setAnalyzing(false)
  }

  function countdown(dateStr?: string) {
    if (!dateStr) return '—'
    const diff = new Date(dateStr).getTime() - Date.now()
    const days = Math.ceil(diff / 86400_000)
    if (days < 0) return 'Listed'
    if (days === 0) return 'Today'
    return `${days}d`
  }

  const filtered = filter === 'All' ? ipos : ipos.filter(i => {
    if (!analysis) return true
    return analysis.recommendation === filter.toUpperCase().replace(' ', '_')
  })

  return (
    <div style={{ padding: 24 }}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>
          <IconCalendar size={22} style={{ display: 'inline', color: 'var(--accent)', marginRight: 8 }} />
          IPO Calendar
        </h1>
        <div className="flex gap-2">
          {['All', 'Strong Buy', 'Watch', 'Skip'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', background: filter === f ? 'var(--accent)' : 'var(--surface)', color: filter === f ? 'white' : 'var(--text2)', border: filter === f ? 'none' : '1px solid var(--border)' }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size={32} /></div>
      ) : ipos.length === 0 ? (
        <div className="card text-center py-16">
          <IconCalendar size={40} style={{ color: 'var(--text2)', margin: '0 auto 12px' }} />
          <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 18, marginBottom: 8 }}>No upcoming IPOs</p>
          <p style={{ color: 'var(--text2)' }}>Check back later for new listings</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ipos.map((ipo, i) => (
            <div key={i} onClick={() => openAnalysis(ipo)} className="card cursor-pointer hover:border-accent transition-colors" style={{ transition: 'border-color 0.2s' }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16 }}>{ipo.symbol || ipo.name}</span>
                  {ipo.symbol && <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{ipo.name}</p>}
                </div>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{countdown(ipo.date)}</span>
              </div>
              <div className="flex items-center gap-4">
                {ipo.date && <div><p style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>DATE</p><p style={{ fontSize: 12, fontFamily: 'DM Mono, monospace' }}>{ipo.date}</p></div>}
                {ipo.price && <div><p style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>PRICE</p><p style={{ fontSize: 12, fontFamily: 'DM Mono, monospace' }}>{ipo.price}</p></div>}
                {ipo.exchange && <div><p style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>EXCHANGE</p><p style={{ fontSize: 12, fontFamily: 'DM Mono, monospace' }}>{ipo.exchange}</p></div>}
              </div>
              <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 12, fontFamily: 'Syne, sans-serif' }}>Click for AI analysis →</p>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.symbol || selected.name} — IPO Analysis` : ''} wide>
        {analyzing ? (
          <div className="flex justify-center py-8"><LoadingSpinner size={32} /></div>
        ) : analysis ? (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div style={{ padding: '6px 16px', borderRadius: 8, background: `${REC_COLOR[analysis.recommendation] || 'var(--text2)'}20`, color: REC_COLOR[analysis.recommendation] || 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16 }}>
                {analysis.recommendation?.replace('_', ' ')}
              </div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 20, fontWeight: 700 }}>{analysis.score}/10</div>
            </div>
            <div className="space-y-4">
              {[
                { label: 'Business Model', value: analysis.business_model },
                { label: 'Valuation', value: analysis.valuation_analysis },
                { label: 'Action', value: analysis.action },
              ].map(s => s.value && (
                <div key={s.label}>
                  <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</p>
                  <p style={{ fontSize: 14, lineHeight: 1.7 }}>{s.value}</p>
                </div>
              ))}
              {analysis.risks && (
                <div>
                  <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Risks</p>
                  <ul style={{ listStyle: 'disc', paddingLeft: 20 }}>
                    {analysis.risks.map((r: string, i: number) => <li key={i} style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--red)', marginBottom: 2 }}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
