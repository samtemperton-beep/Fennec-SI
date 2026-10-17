'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  IconAlertOctagon, IconAlertTriangle, IconCircleCheck, IconInfoCircle,
  IconX, IconChevronRight, IconBell,
} from '@tabler/icons-react'
import type { Insight, InsightSection, InsightSeverity } from '@/lib/insights'

const SEVERITY: Record<InsightSeverity, { icon: typeof IconInfoCircle; label: string; cls: string }> = {
  critical: { icon: IconAlertOctagon,  label: 'Needs action', cls: 'sev-critical' },
  warning:  { icon: IconAlertTriangle, label: 'Heads up',     cls: 'sev-warning' },
  info:     { icon: IconInfoCircle,    label: 'FYI',          cls: 'sev-info' },
  good:     { icon: IconCircleCheck,   label: 'On track',     cls: 'sev-good' },
}

const SECTION_LABEL: Record<InsightSection, string> = {
  finance: 'Finance',
  investing: 'Investing',
  business: 'Business',
  kiwisaver: 'KiwiSaver',
  home: 'Home',
  networth: 'Net worth',
  sync: 'Connections',
}

const DISMISSED_KEY = 'fennec:dismissed-insights'
const COLLAPSED_COUNT = 5

function readDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]') } catch { return [] }
}
function writeDismissed(ids: string[]) {
  // Keep the list bounded; old ids refer to situations that have since changed.
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-200))) } catch {}
}

export function InsightsFeed({ insights, loading }: { insights: Insight[]; loading: boolean }) {
  const [dismissed, setDismissed] = useState<string[]>([])
  const [filter, setFilter] = useState<InsightSection | 'all'>('all')
  const [expanded, setExpanded] = useState(false)
  const [showDismissed, setShowDismissed] = useState(false)

  useEffect(() => { setDismissed(readDismissed()) }, [])

  const live = useMemo(() => insights.filter(i => !dismissed.includes(i.id)), [insights, dismissed])
  const hiddenCount = insights.length - live.length
  const pool = showDismissed ? insights : live
  const sections = useMemo(() => [...new Set(pool.map(i => i.section))], [pool])
  const filtered = filter === 'all' ? pool : pool.filter(i => i.section === filter)
  const shown = expanded ? filtered : filtered.slice(0, COLLAPSED_COUNT)
  const attention = live.filter(i => i.severity === 'critical' || i.severity === 'warning').length

  useEffect(() => { if (filter !== 'all' && !sections.includes(filter)) setFilter('all') }, [sections, filter])

  function dismiss(id: string) {
    const next = [...dismissed, id]
    setDismissed(next)
    writeDismissed(next)
  }
  function restore(id: string) {
    const next = dismissed.filter(d => d !== id)
    setDismissed(next)
    writeDismissed(next)
  }

  return (
    <section className="ins-card">
      <div className="ins-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="ins-icon"><IconBell size={15} /></div>
          <h2 className="ins-title">How things are tracking</h2>
          {!loading && attention > 0 && <span className="ins-count">{attention} need{attention === 1 ? 's' : ''} attention</span>}
        </div>
      </div>

      {sections.length > 1 && (
        <div className="ins-filters" role="group" aria-label="Filter notifications">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>All</button>
          {sections.map(s => (
            <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)} aria-pressed={filter === s}>
              {SECTION_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 52 }} />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="ins-empty">
          <IconCircleCheck size={18} style={{ color: 'var(--green)' }} />
          All quiet. Nothing needs your attention right now.
        </div>
      ) : (
        <ul className="ins-list">
          {shown.map(i => {
            const sev = SEVERITY[i.severity]
            const Icon = sev.icon
            const isDismissed = dismissed.includes(i.id)
            return (
              <li key={i.id} className={`ins-item ${sev.cls} ${isDismissed ? 'dismissed' : ''}`}>
                <Link href={i.href} className="ins-link">
                  <span className="ins-sev" title={sev.label}><Icon size={17} /></span>
                  <span className="ins-body">
                    <span className="ins-item-title">{i.title}</span>
                    {i.detail && <span className="ins-item-detail">{i.detail}</span>}
                    <span className="ins-meta">
                      <span className="ins-sev-label">{sev.label}</span> · {SECTION_LABEL[i.section]}
                    </span>
                  </span>
                  <IconChevronRight size={15} className="ins-chevron" />
                </Link>
                <button
                  className="ins-dismiss"
                  onClick={() => (isDismissed ? restore(i.id) : dismiss(i.id))}
                  aria-label={isDismissed ? `Restore: ${i.title}` : `Dismiss: ${i.title}`}
                  title={isDismissed ? 'Restore' : 'Dismiss'}
                >
                  {isDismissed ? <span style={{ fontSize: 11, fontWeight: 700 }}>Undo</span> : <IconX size={14} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="ins-foot">
        {filtered.length > COLLAPSED_COUNT && (
          <button onClick={() => setExpanded(e => !e)}>
            {expanded ? 'Show less' : `Show ${filtered.length - COLLAPSED_COUNT} more`}
          </button>
        )}
        {hiddenCount > 0 && (
          <button onClick={() => setShowDismissed(s => !s)}>
            {showDismissed ? 'Hide dismissed' : `${hiddenCount} dismissed`}
          </button>
        )}
      </div>
    </section>
  )
}
