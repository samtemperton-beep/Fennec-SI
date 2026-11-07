'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { timeAgo } from '@/lib/utils'
import { splitSymbol, priceIn, CURRENCY_OF, type Listing } from '@/lib/markets'
import { MarketBadge } from '@/components/shared/MarketBadge'
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
  watchlist_sell_alerts: boolean
  price_alerts: boolean
  earnings_alerts: boolean
}

type Tab = 'feed' | 'rules' | 'preferences'

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOTIF_ICON: Record<string, { icon: typeof IconBell; color: string; bg: string }> = {
  price_alert:       { icon: IconBell,      color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  stop_loss:         { icon: IconArrowDown, color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
  take_profit:       { icon: IconArrowUp,   color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  },
  watchlist_signal:  { icon: IconEye,       color: '#5b7cf0', bg: 'rgba(91,124,240,0.12)' },
  earnings_reminder: { icon: IconBell,      color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
}

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
  // Markets the typed code is listed on, and the one picked (see lib/markets.ts).
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [listing, setListing] = useState<Listing | null>(null)
  const [looking, setLooking] = useState(false)

  useEffect(() => {
    const code = form.ticker.trim()
    setListing(null)
    if (!code) { setListings(null); setLooking(false); return }
    let stale = false
    setLooking(true)
    const t = setTimeout(async () => {
      try {
        const found: Listing[] = await api.lookupCode(code)
        if (stale) return
        const list = Array.isArray(found) ? found : []
        setListings(list)
        if (list.length === 1) setListing(list[0]) // only one market: nothing to choose
      } catch { if (!stale) setListings([]) }
      if (!stale) setLooking(false)
    }, 450)
    return () => { stale = true; clearTimeout(t) }
  }, [form.ticker])

  // Preferences
  const [prefs, setPrefs] = useState<Prefs>({
    frequency: 'morning', stop_loss_pct: 10, take_profit_pct: 20,
    portfolio_sell_alerts: true, watchlist_buy_alerts: true, watchlist_sell_alerts: true, price_alerts: true, earnings_alerts: true,
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
    if (!listing) return toast.error(listings?.length ? 'Pick which market you mean.' : 'Enter a share code we can find.')
    // Saved with its market suffix (FPH.NZ), so it's priced on the right exchange.
    const { data, error } = await supabase.from('alerts').insert({
      user_id: userId, ticker: listing.symbol, type: form.type,
      price: form.price ? parseFloat(form.price) : null,
    }).select().single()
    if (error) return toast.error(error.message)
    setAlerts(prev => [data, ...prev])
    setAddOpen(false)
    setForm({ ticker: '', type: 'above', price: '' })
    toast.success(`Alert created for ${listing.code} (${listing.market})`)
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
                { label: 'BUY signals', desc: 'Alert when a watchlist stock gets a BUY signal', prefKey: 'watchlist_buy_alerts' as const },
                { label: 'SELL signals', desc: 'Alert when a watchlist stock gets a SELL signal', prefKey: 'watchlist_sell_alerts' as const },
              ].map(row => (
                <div key={row.prefKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>{row.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{row.desc}</div>
                  </div>
                  <Toggle checked={(prefs as any)[row.prefKey]} onChange={v => setPrefs(p => ({ ...p, [row.prefKey]: v }))} />
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
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Checked about every 15 minutes. You get an email when one is hit.</div>
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
                      <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, marginRight: 6 }}>{splitSymbol(a.ticker).code}</span>
                      <MarketBadge market={splitSymbol(a.ticker).market} />
                      <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 8, textTransform: 'capitalize' }}>{a.type}</span>
                      {a.price != null && <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#f59e0b', marginLeft: 8 }}>{priceIn(a.ticker, a.price)}</span>}
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
                          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, marginRight: 6 }}>{splitSymbol(a.ticker).code}</span>
                          <MarketBadge market={splitSymbol(a.ticker).market} />
                          <span style={{ color: 'var(--text2)', marginLeft: 8 }}>{a.type} {a.price != null ? priceIn(a.ticker, a.price) : ''}, triggered</span>
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
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>When Fennec checks</div>
            </div>
            {/* What backend/src/routes/alerts.ts startAlertChecks actually does. */}
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
              <li><strong style={{ color: 'var(--text)' }}>Price alerts:</strong> about every 15 minutes, and you get an email when one is hit.</li>
              <li><strong style={{ color: 'var(--text)' }}>Everything else</strong> (stop-loss, take-profit, watchlist signals, earnings reminders): every few hours, shown here in your feed.</li>
              <li>Prices can be delayed by up to 20 minutes, so an alert can arrive a little after the price is reached. Press <strong style={{ color: 'var(--text)' }}>Check now</strong> to check straight away.</li>
            </ul>
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
              { key: 'earnings_alerts',       label: 'Earnings reminders',               desc: 'Alert 1 day before a stock in your portfolio or watchlist reports earnings' },
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
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 6 }}>Share code</label>
            <input value={form.ticker} onChange={e => setForm(p => ({ ...p, ticker: e.target.value.toUpperCase() }))} placeholder="e.g. FPH or AAPL" required
              autoComplete="off" autoCapitalize="characters"
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
            />
            {/* Every market the code is on. Many NZX codes are also a different US company. */}
            {looking && <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>Looking up {form.ticker.trim()}…</p>}
            {!looking && listings && listings.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>We can&apos;t find {form.ticker.trim()} on the NZX, ASX or US markets. Check the code.</p>
            )}
            {!looking && listings && listings.length > 1 && (
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>{listings[0].code} is on more than one market. Pick the one you mean:</p>
            )}
            {!looking && listings && listings.length > 0 && (
              <div role="radiogroup" aria-label="Market" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {listings.map(l => {
                  const on = listing?.symbol === l.symbol
                  return (
                    <button key={l.symbol} type="button" role="radio" aria-checked={on} onClick={() => setListing(l)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 8, textAlign: 'left', cursor: 'pointer', background: on ? 'var(--primary-light)' : 'var(--surface2)', border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`, color: 'var(--text)' }}>
                      <MarketBadge market={l.market} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text2)' }}>{priceIn(l.symbol, l.price)}</span>
                    </button>
                  )
                })}
              </div>
            )}
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
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 6 }}>
              Target price {listing ? `(${CURRENCY_OF[listing.market]})` : '($)'}
            </label>
            <input type="number" step="any" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="150.00" required
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
            />
          </div>
          <button type="submit" disabled={!listing} style={{ width: '100%', background: 'var(--primary)', color: 'white', padding: '11px', borderRadius: 8, fontFamily: 'Syne, sans-serif', fontWeight: 700, border: 'none', cursor: listing ? 'pointer' : 'not-allowed', opacity: listing ? 1 : 0.5 }}>
            Create alert
          </button>
        </form>
      </Modal>
    </div>
  )
}
