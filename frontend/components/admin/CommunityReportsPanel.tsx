'use client'
import { useCallback, useEffect, useState } from 'react'
import { IconCheck, IconEyeOff, IconTrash, IconRefresh } from '@tabler/icons-react'
import { toast } from 'sonner'
import { api, type ReportGroup } from '@/lib/api'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { timeAgo } from '@/lib/utils'

const REASON: Record<string, string> = {
  spam: 'Spam or advertising',
  scam: 'Scam or share ramping',
  abuse: 'Abusive or harassing',
  personal: 'Personal information',
  other: 'Something else',
}
const STATUS: Record<string, string> = { hidden: 'Hidden', removed: 'Removed', dismissed: 'Kept' }

const btn = (bg: string, color: string, border = 'none'): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border, background: bg, color,
  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
})

// The admin page's Community tab: reported posts and comments
// (community_migration.sql). Three open reports hide something until it's reviewed here.
export function CommunityReportsPanel() {
  const [view, setView] = useState<'open' | 'closed'>('open')
  const [groups, setGroups] = useState<ReportGroup[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setGroups(null)
    try { setGroups((await api.adminGetReports(view)).groups) }
    catch (e: any) { toast.error(e.message); setGroups([]) }
  }, [view])
  useEffect(() => { load() }, [load])

  async function resolve(g: ReportGroup, action: 'keep' | 'hide' | 'remove') {
    if (action === 'remove' && !confirm(`Delete this ${g.kind} for good? This can't be undone.`)) return
    setBusy(g.key)
    try {
      await api.adminResolveReport(g.kind, g.id, action)
      toast.success(action === 'keep' ? 'Kept, and shown again' : action === 'hide' ? 'Hidden' : 'Deleted')
      setGroups(gs => (gs ?? []).filter(x => x.key !== g.key))
    } catch (e: any) { toast.error(e.message) }
    setBusy(null)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, flex: 1 }}>Community reports</h2>
        {(['open', 'closed'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={btn(view === v ? 'var(--primary)' : 'var(--surface2)', view === v ? 'white' : 'var(--text2)', view === v ? 'none' : '1px solid var(--border)')}>
            {v === 'open' ? 'To review' : 'Dealt with'}
          </button>
        ))}
        <button onClick={load} style={btn('var(--surface2)', 'var(--text2)', '1px solid var(--border)')} aria-label="Refresh"><IconRefresh size={13} /></button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
        You get an email for each report. Three reports hide a post or comment until you look. Keep shows it again; Hide keeps it from everyone but its author; Delete removes it.
      </p>

      {!groups ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><LoadingSpinner size={24} /></div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)', fontSize: 13 }}>{view === 'open' ? 'Nothing to review.' : 'Nothing dealt with yet.'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.map(g => (
            <div key={g.key} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface2)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6, fontSize: 12 }}>
                <strong>{g.item?.username ?? 'Deleted'}</strong>
                <span style={{ color: 'var(--text3)' }}>{g.kind}{g.item ? ` · ${timeAgo(g.item.created_at)}` : ''}</span>
                {g.item?.hidden && <span style={{ color: 'var(--amber)', fontWeight: 600 }}>Hidden now</span>}
                {view === 'closed' && <span style={{ marginLeft: 'auto', color: 'var(--text3)' }}>{STATUS[g.status] ?? g.status}</span>}
              </div>
              <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{g.item?.body ?? 'This has been deleted.'}</p>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: view === 'open' && g.item ? 10 : 0 }}>
                {g.reports.length} report{g.reports.length === 1 ? '' : 's'}: {[...new Set(g.reports.map(r => REASON[r.reason] ?? r.reason))].join(', ')}
                {g.reports.filter(r => r.note).map((r, i) => <div key={i} style={{ marginTop: 4, color: 'var(--text3)' }}>“{r.note}”</div>)}
              </div>
              {view === 'open' && g.item && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button disabled={busy === g.key} onClick={() => resolve(g, 'keep')} style={btn('none', 'var(--green)', '1px solid var(--green)')}><IconCheck size={13} /> Keep</button>
                  <button disabled={busy === g.key} onClick={() => resolve(g, 'hide')} style={btn('none', 'var(--amber)', '1px solid var(--amber)')}><IconEyeOff size={13} /> Hide</button>
                  <button disabled={busy === g.key} onClick={() => resolve(g, 'remove')} style={btn('none', 'var(--red)', '1px solid var(--red)')}><IconTrash size={13} /> Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
