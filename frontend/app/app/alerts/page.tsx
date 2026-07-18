'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { timeAgo } from '@/lib/utils'
import {
  IconBell, IconPlus, IconTrash, IconRefresh, IconCheck,
  IconChevronDown, IconArrowDown, IconArrowUp, IconEye,
  IconBriefcase, IconClock, IconAdjustments,
} from '@tabler/icons-react'
import { toast } from 'sonner'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Alert { id: number; ticker: string; type: string; price?: number; triggered: boolean; created_at: string }
interface Notification { id: number; type: string; ticker: string | null; title: string; body: string; read: boolean; created_at: string }
interface Prefs {
  frequency: 'morning' | 'hourly' | 'immediate'
  stop_loss_pct: number
  take_profit_pct: number
  portfolio_sell_alerts: boolean
  watchlist_buy_alerts: boolean
  price_alerts: boolean
}

type Tab = 'feed' | 'rules' | 'preferences'

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOTIF_ICON: Record<string, { icon: typeof IconBell; color: string; bg: string }> = {
  price_alert:      { icon: IconBell,      color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  stop_loss:        { icon: IconArrowDown, color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
  take_profit:      { icon: IconArrowUp,   color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  },
  watchlist_signal: { icon: IconEye,       color: '#5b7cf0', bg: 'rgba(91,124,240,0.12)' },
}

const FREQ_OPTIONS = [
  { value: 'morning',   label: 'Morning digest',  desc: 'One summary at 8 AM — great for casual traders' },
  { value: 'hourly',    label: 'Hourly updates',  desc: 'Batched every hour during market hours' },
  { value: 'immediate', label: 'Immediate',        desc: 'Notified as soon as a condition is met — for active traders' },
] as const

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: checked ? 'var(--primary)' : 'var(--border)',
        position: 'relative', transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16,
        borderRadius: '50%', background: 'white', transition: 'left 0.2s',
      }} />
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [tab, setTab] = useState<Tab>('feed')
  const [userId, setUserId] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  // Feed
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [loadingNotifs, setLoadingNotifs] = useState(true)

  // Alert rules
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ ticker: '', type: 'above', price: '' })

  // Preferences
  const [prefs, setPrefs] = useState<Prefs>({
    frequency: 'morning', stop_loss_pct: 10, take_profit_pct: 20,
    portfolio_sell_alerts: true, watchlist_buy_alerts: true, price_alerts: true,
  })
  const [savingPrefs, setSavingPrefs] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      setUserId(data.user.id)
      loadNotifs()
      loadAlerts(data.user.id)
      loadPrefs()
    })
  }, [])

  async function loadNotifs() {
    setLoadingNotifs(true)
    try {
      const data = await api.getNotifications()
      setNotifs(data || [])
    } catch {}
    setLoadingNotifs(false)
  }

  async function loadAlerts(uid: string) {
    setLoadingAlerts(true)
    const { data } = await supabase.from('alerts').select('*').eq('user_id', uid).order('created_at', { ascending: false })
    setAlerts(data || [])
    setLoadingAlerts(false)
  }

  async function loadPrefs() {
    try {
      const data = await api.getNotificationPrefs()
      if (data && !data.error) setPrefs(prev => ({ ...prev, ...data }))
    } catch {}
  }

  async function checkNow() {
    setChecking(true)
    try {
      const result = await api.checkAlerts()
      const count = result.count ?? result.triggered?.length ?? 0
      toast.success(count > 0 ? `${count} new notification${count !== 1 ? 's' : ''}` : 'All clear — no alerts triggered')
      await loadNotifs()
      if (userId) await loadAlerts(userId)
    } catch (e: any) {
      toast.error(e.message)
    }
    setChecking(false)
  }

  async function markAllRead() {
    await api.markNotificationsRead()
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function addAlert(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    const { data, error } = await supabase.from('alerts').insert({
      user_id: userId, ticker: form.ticker.toUpperCase(), type: form.type,
      price: form.price ? parseFloat(form.price) : null,
    }).select().single()
    if (error) return toast.error(error.message)
    setAlerts(prev => [data, ...prev])
    setAddOpen(false)
    setForm({ ticker: '', type: 'above', price: '' })
    toast.success('Alert created')
  }

  async function removeAlert(id: number) {
    await supabase.from('alerts').delete().eq('id', id)
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  async function savePrefs() {
    setSavingPrefs(true)
    try {
      await api.saveNotificationPrefs(prefs)
      toast.success('Preferences saved')
    } catch (e: any) {
      toast.error(e.message)
    }
    setSavingPrefs(false)
  }

  const unreadCount = notifs.filter(n => !n.read).length
  const activeAlerts = alerts.filter(a => !a.triggered)
  const triggeredAlerts = alerts.filter(a => a.triggered)

  return (
    <div style={{ padding: 28, maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Notifications</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>Stay informed on your portfolio, watchlist, and market signals</p>
        </div>
        <button onClick={checkNow} disabled={checking}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 700, border: 'none', cursor: checking ? 'default' : 'pointer', opacity: checking ? 0.7 : 1 }}
        >
          {checking ? <LoadingSpinner size={13} /> : <IconRefresh size={13} />}
          {checking ? 'Checking…' : 'Check now'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, background: 'var(--surface)', borderRadius: 12, padding: 4, border: '1px solid var(--border)', width: 'fit-content' }}>
        {([
          { key: 'feed',        label: 'Feed',        badge: unreadCount },
          { key: 'rules',       label: 'Alert Rules', badge: activeAlerts.length },
          { key: 'preferences', label: 'Preferences', badge: 0 },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '7px 18px', borderRadius: 9, fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 600,
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              background: tab === t.key ? 'var(--primary)' : 'transparent',
              color: tab === t.key ? 'white' : 'var(--text2)',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
            {t.badge > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                background: tab === t.key ? 'rgba(255,255,255,0.25)' : 'var(--primary)',
                color: tab === t.key ? 'white' : 'white',
              }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Feed tab ── */}
      {tab === 'feed' && (
        <div>
          {unreadCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button onClick={markAllRead} style={{ fontSize: 12, color: 'var(--primary)', fontFamily: 'Syne, sans-serif', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <IconCheck size={13} /> Mark all as read
              </button>
            </div>
          )}

          {loadingNotifs ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><LoadingSpinner size={32} /></div>
          ) : notifs.length === 0 ? (
            <div className="card text-center" style={{ padding: '48px 24px' }}>
              <IconBell size={36} style={{ color: 'var(--text3)', margin: '0 auto 12px' }} />
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 16, marginBottom: 8 }}>No notifications yet</p>
              <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>Click "Check now" to scan your portfolio and watchlist for signals</p>
              <button onClick={checkNow} disabled={checking}
                style={{ background: 'var(--primary)', color: 'white', padding: '10px 24px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600, border: 'none', cursor: 'pointer' }}
              >
                {checking ? 'Checking…' : 'Check now'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notifs.map(n => {
                const meta = NOTIF_ICON[n.type] || NOTIF_ICON.price_alert
                const Icon = meta.icon
                return (
                  <div key={n.id} className="card" style={{
                    display: 'flex', gap: 14, padding: '14px 16px', opacity: n.read ? 0.65 : 1,
                    borderLeft: n.read ? '3px solid transparent' : `3px solid ${meta.color}`,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={17} style={{ color: meta.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>{n.title}</span>
                        {!n.read && <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--primary)', color: 'white', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>New</span>}
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.55 }}>{n.body}</p>
                      <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Alert Rules tab ── */}
      {tab === 'rules' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* Portfolio alerts info */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconBriefcase size={16} style={{ color: '#22c55e' }} />
              </div>
              <div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>Portfolio alerts</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>Stop-loss and take-profit thresholds — configure in Preferences</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Stop loss</div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 22, fontWeight: 700, color: '#ef4444' }}>−{prefs.stop_loss_pct}%</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Alert when any holding falls this much from your buy price</div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Take profit</div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 22, fontWeight: 700, color: '#22c55e' }}>+{prefs.take_profit_pct}%</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Alert when any holding gains this much from your buy price</div>
              </div>
            </div>
          </div>

          {/* Watchlist signal alerts */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(91,124,240,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconEye size={16} style={{ color: '#5b7cf0' }} />
              </div>
              <div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>Watchlist signals</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>Alerts when AI signals change on stocks you're watching</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'BUY signals', desc: 'Alert when a watchlist stock gets a BUY signal', type: 'buy' },
                { label: 'SELL signals', desc: 'Alert when a watchlist stock gets a SELL signal', type: 'sell' },
              ].map(row => (
                <div key={row.type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>{row.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{row.desc}</div>
                  </div>
                  <Toggle checked={prefs.watchlist_buy_alerts} onChange={v => setPrefs(p => ({ ...p, watchlist_buy_alerts: v }))} />
                </div>
              ))}
            </div>
          </div>

          {/* Price alerts */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconBell size={16} style={{ color: '#f59e0b' }} />
                </div>
                <div>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>Price alerts</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Trigger when a stock crosses a specific price</div>
                </div>
              </div>
              <button onClick={() => setAddOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}
              >
                <IconPlus size={13} /> New alert
              </button>
            </div>

            {loadingAlerts ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><LoadingSpinner size={24} /></div>
            ) : activeAlerts.length === 0 && triggeredAlerts.length === 0 ? (
              <div className="card text-center" style={{ padding: '28px 20px' }}>
                <p style={{ color: 'var(--text2)', fontSize: 13 }}>No price alerts yet — add one to get started</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeAlerts.map(a => (
                  <div key={a.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <IconBell size={15} style={{ color: '#f59e0b' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>{a.ticker}</span>
                      <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 8, textTransform: 'capitalize' }}>{a.type}</span>
                      {a.price != null && <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#f59e0b', marginLeft: 8 }}>${a.price.toFixed(2)}</span>}
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Created {timeAgo(a.created_at)}</div>
                    </div>
                    <button onClick={() => removeAlert(a.id)} style={{ color: 'var(--text3)', padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}><IconTrash size={15} /></button>
                  </div>
                ))}
                {triggeredAlerts.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', padding: '10px 4px 4px' }}>
                      Triggered ({triggeredAlerts.length})
                    </div>
                    {triggeredAlerts.map(a => (
                      <div key={a.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', opacity: 0.55 }}>
                        <IconCheck size={15} style={{ color: '#22c55e', flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: 13 }}>
                          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>{a.ticker}</span>
                          <span style={{ color: 'var(--text2)', marginLeft: 8 }}>{a.type} {a.price != null ? `$${a.price.toFixed(2)}` : ''} — triggered</span>
                        </div>
                        <button onClick={() => removeAlert(a.id)} style={{ color: 'var(--text3)', padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}><IconTrash size={15} /></button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Preferences tab ── */}
      {tab === 'preferences' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Frequency */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(91,124,240,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconClock size={16} style={{ color: '#5b7cf0' }} />
              </div>
              <div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>Check frequency</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>How often your alerts are scanned and bundled</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {FREQ_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setPrefs(p => ({ ...p, frequency: opt.value }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                    border: `2px solid ${prefs.frequency === opt.value ? 'var(--primary)' : 'var(--border)'}`,
                    background: prefs.frequency === opt.value ? 'rgba(91,124,240,0.06)' : 'var(--surface2)',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${prefs.frequency === opt.value ? 'var(--primary)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {prefs.frequency === opt.value && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />}
                  </span>
                  <div>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Alert toggles */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconAdjustments size={16} style={{ color: '#f59e0b' }} />
              </div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>What to watch for</div>
            </div>
            {[
              { key: 'portfolio_sell_alerts', label: 'Portfolio stop-loss & take-profit', desc: 'Alert when holdings hit your % thresholds below' },
              { key: 'watchlist_buy_alerts',  label: 'Watchlist AI signals',              desc: 'Alert when a watched stock gets a BUY or SELL signal' },
              { key: 'price_alerts',          label: 'Custom price alerts',               desc: 'Alert when a stock crosses your set price' },
            ].map(row => (
              <div key={row.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>{row.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{row.desc}</div>
                </div>
                <Toggle
                  checked={(prefs as any)[row.key]}
                  onChange={v => setPrefs(p => ({ ...p, [row.key]: v }))}
                />
              </div>
            ))}
          </div>

          {/* Thresholds */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconArrowDown size={16} style={{ color: '#ef4444' }} />
              </div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>Portfolio thresholds</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 6 }}>
                  Stop loss — alert when down
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min={1} max={99} value={prefs.stop_loss_pct}
                    onChange={e => setPrefs(p => ({ ...p, stop_loss_pct: Number(e.target.value) }))}
                    style={{ flex: 1, padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 700, outline: 'none' }}
                  />
                  <span style={{ fontSize: 14, color: '#ef4444', fontWeight: 700 }}>%</span>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 6 }}>
                  Take profit — alert when up
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min={1} max={500} value={prefs.take_profit_pct}
                    onChange={e => setPrefs(p => ({ ...p, take_profit_pct: Number(e.target.value) }))}
                    style={{ flex: 1, padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 700, outline: 'none' }}
                  />
                  <span style={{ fontSize: 14, color: '#22c55e', fontWeight: 700 }}>%</span>
                </div>
              </div>
            </div>
          </div>

          <button onClick={savePrefs} disabled={savingPrefs}
            style={{ padding: '12px 28px', borderRadius: 10, background: 'var(--primary)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, border: 'none', cursor: savingPrefs ? 'default' : 'pointer', opacity: savingPrefs ? 0.7 : 1, alignSelf: 'flex-start' }}
          >
            {savingPrefs ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      )}

      {/* New price alert modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New Price Alert">
        <form onSubmit={addAlert} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 6 }}>Ticker</label>
            <input value={form.ticker} onChange={e => setForm(p => ({ ...p, ticker: e.target.value.toUpperCase() }))} placeholder="AAPL" required
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 6 }}>Condition</label>
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace' }}
            >
              <option value="above">Price rises above</option>
              <option value="below">Price drops below</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 6 }}>Target price ($)</label>
            <input type="number" step="any" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="150.00" required
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
            />
          </div>
          <button type="submit" style={{ width: '100%', background: 'var(--primary)', color: 'white', padding: '11px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            Create alert
          </button>
        </form>
      </Modal>
    </div>
  )
}
