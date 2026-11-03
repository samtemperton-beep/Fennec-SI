'use client'
import { useCallback, useEffect, useState } from 'react'
import { IconCircleCheckFilled, IconAlertTriangleFilled, IconPlayerPlay, IconRefresh } from '@tabler/icons-react'
import { toast } from 'sonner'
import { api, type HealthRun } from '@/lib/api'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// The admin page's Health tab: the nightly check's results, the last two weeks
// of runs, and a button to run it now.
export function HealthPanel() {
  const [runs, setRuns] = useState<HealthRun[] | null>(null)
  const [selected, setSelected] = useState(0)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setRuns((await api.adminGetHealth()).runs)
      setSelected(0)
      setError('')
    } catch (e: any) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function runNow() {
    setRunning(true)
    try {
      const r = await api.adminRunHealth()
      toast[r.ok ? 'success' : 'error'](r.ok ? 'Everything passed.' : `${r.failed} check${r.failed === 1 ? '' : 's'} failed.`)
      await load()
    } catch (e: any) {
      toast.error(e.message)
    }
    setRunning(false)
  }

  const run = runs?.[selected]
  const lastScheduled = runs?.find(r => r.trigger === 'scheduled')
  const nightlyLate = !lastScheduled || Date.now() - Date.parse(lastScheduled.ran_at) > 30 * 3_600_000
  const groups = run ? [...new Set(run.results.map(r => r.group))] : []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Health check</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', color: 'var(--text2)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
            <IconRefresh size={13} /> Refresh
          </button>
          <button onClick={runNow} disabled={running} style={{ border: 'none', borderRadius: 7, padding: '6px 14px', cursor: running ? 'default' : 'pointer', background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: running ? 0.7 : 1 }}>
            {running ? <LoadingSpinner size={12} /> : <IconPlayerPlay size={13} />} {running ? 'Checking… (about 20s)' : 'Run check now'}
          </button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 18px' }}>
        Runs every night at about 2am NZ time: website pages, the API, market data, each AI model, the database and bank sync.
        Problems are emailed to admin accounts.
      </p>

      {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
      {!runs && !error && <div style={{ color: 'var(--text2)', fontSize: 13 }}>Loading…</div>}

      {runs && nightlyLate && (
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--amber)', borderRadius: 10, padding: '10px 14px', fontSize: 12, marginBottom: 16 }}>
          {lastScheduled
            ? <>The nightly check last ran {when(lastScheduled.ran_at)}. It should run every night; check the server is up and ENABLE_SCHEDULED_SYNC is true on Railway.</>
            : <>The nightly check hasn&apos;t run yet. It runs on the live server when ENABLE_SCHEDULED_SYNC is true on Railway. Use Run check now to try it.</>}
        </div>
      )}

      {runs && runs.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {runs.map((r, i) => (
              <button key={r.id} onClick={() => setSelected(i)} title={`${when(r.ran_at)} (${r.trigger})`}
                style={{ padding: '4px 9px', borderRadius: 14, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  border: `1px solid ${i === selected ? 'var(--primary)' : 'var(--border)'}`, background: i === selected ? 'var(--surface)' : 'var(--surface2)', color: 'var(--text)' }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: r.ok ? 'var(--green)' : 'var(--red)' }} />
                {new Date(r.ran_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}{r.trigger === 'manual' ? ' ·' : ''}
              </button>
            ))}
          </div>

          {run && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, marginBottom: 16,
                background: 'var(--surface2)', border: `1px solid ${run.ok ? 'var(--green)' : 'var(--red)'}` }}>
                {run.ok ? <IconCircleCheckFilled size={20} style={{ color: 'var(--green)' }} /> : <IconAlertTriangleFilled size={20} style={{ color: 'var(--red)' }} />}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{run.ok ? 'All checks passed' : `${run.failed} of ${run.results.length} checks failed`}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{when(run.ran_at)} · {run.trigger === 'scheduled' ? 'nightly' : 'run by hand'}</div>
                </div>
              </div>

              {groups.map(g => (
                <div key={g} style={{ marginBottom: 14 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', margin: '0 0 6px' }}>{g}</h3>
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    {run.results.filter(r => r.group === g).sort((a, b) => Number(a.ok) - Number(b.ok)).map((r, i) => (
                      <div key={r.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', fontSize: 12, borderTop: i ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0, background: r.ok ? 'var(--green)' : 'var(--red)' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{r.name}</div>
                          <div style={{ color: r.ok ? 'var(--text2)' : 'var(--red)', overflowWrap: 'anywhere' }}>{r.detail}</div>
                        </div>
                        {r.ms > 0 && <span style={{ color: 'var(--text3)', whiteSpace: 'nowrap' }}>{(r.ms / 1000).toFixed(1)}s</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}
