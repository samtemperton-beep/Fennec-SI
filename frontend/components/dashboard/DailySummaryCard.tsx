'use client'
import { IconRefresh } from '@tabler/icons-react'
import { FoxIcon } from '@/components/shared/FoxIcon'

export function DailySummaryCard({ summary, generatedAt, loading, error, onRefresh, refreshing }: {
  summary: string | null
  generatedAt: string | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  refreshing: boolean
}) {
  const time = generatedAt
    ? new Date(generatedAt).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <section className="ds-card" aria-live="polite">
      <div className="ds-fox"><FoxIcon size={34} /></div>
      <div className="ds-body">
        <div className="ds-head">
          <span className="ds-title">Fennec&apos;s daily briefing</span>
          {!loading && (
            <button className="ds-refresh" onClick={onRefresh} disabled={refreshing} title="Write a fresh briefing">
              <IconRefresh size={13} className={refreshing ? 'ds-spin' : ''} />
              {refreshing ? 'Writing…' : 'Refresh'}
            </button>
          )}
        </div>
        {loading || (refreshing && !summary) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <div className="skeleton" style={{ height: 12, width: '95%' }} />
            <div className="skeleton" style={{ height: 12, width: '80%' }} />
            <div className="skeleton" style={{ height: 12, width: '60%' }} />
          </div>
        ) : error ? (
          <p className="ds-text" style={{ color: 'var(--text2)' }}>{error}</p>
        ) : (
          <>
            <p className="ds-text">{summary}</p>
            {time && <span className="ds-meta">Written at {time} · AI-generated from your data, not financial advice</span>}
          </>
        )}
      </div>
    </section>
  )
}
