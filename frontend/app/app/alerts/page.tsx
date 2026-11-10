'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { Modal } from '@/components/shared/Modal'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { NOTIFICATIONS_CHANGED } from '@/components/shared/NotificationBell'
import { timeAgo } from '@/lib/utils'
import { splitSymbol, priceIn, CURRENCY_OF, type Listing } from '@/lib/markets'
import { MarketBadge } from '@/components/shared/MarketBadge'
import {
  IconBell, IconPlus, IconTrash, IconRefresh, IconCheck,
  IconArrowDown, IconArrowUp, IconEye, IconMail,
  IconReceipt, IconChartPie, IconTarget, IconFileInvoice, IconPlugConnectedX, IconMessageCircle, IconCalendarEvent,
  IconWallet, IconBuildingStore, IconUsers, IconChartLine, IconMedal, IconHandStop, IconHeartHandshake,
} from '@tabler/icons-react'
import { toast } from 'sonner'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Alert { id: number; ticker: string; type: string; price?: number; triggered: boolean; created_at: string }
interface Notification { id: number; type: string; ticker: string | null; title: string; body: string; read: boolean; created_at: string; link?: string | null }
type EmailMode = 'immediate' | 'daily' | 'off'
interface Prefs {
  stop_loss_pct: number
  take_profit_pct: number
  portfolio_sell_alerts: boolean
  watchlist_buy_alerts: boolean
  watchlist_sell_alerts: boolean
  price_alerts: boolean
  earnings_alerts: boolean
  bill_alerts: boolean
  budget_alerts: boolean
  goal_alerts: boolean
  invoice_alerts: boolean
  sync_alerts: boolean
  community_alerts: boolean
  reward_alerts: boolean
  pledge_alerts: boolean
  buddy_alerts: boolean
  email_mode: EmailMode
  weekly_summary: boolean
}
type BoolPref = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs]

type Tab = 'feed' | 'rules' | 'preferences'
type Group = 'money' | 'business' | 'investing' | 'community'

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOTIF: Record<string, { icon: typeof IconBell; color: string; group: Group }> = {
  bill_due:          { icon: IconReceipt,         color: '#f59e0b', group: 'money' },
  budget_over:       { icon: IconChartPie,        color: '#ef4444', group: 'money' },
  budget_near:       { icon: IconChartPie,        color: '#f59e0b', group: 'money' },
  goal_reached:      { icon: IconTarget,          color: '#22c55e', group: 'money' },
  goal_late:         { icon: IconTarget,          color: '#f59e0b', group: 'money' },
  sync_problem:      { icon: IconPlugConnectedX,  color: '#ef4444', group: 'money' },
  invoice_overdue:   { icon: IconFileInvoice,     color: '#ef4444', group: 'business' },
  price_alert:       { icon: IconBell,            color: '#f59e0b', group: 'investing' },
  stop_loss:         { icon: IconArrowDown,       color: '#ef4444', group: 'investing' },
  take_profit:       { icon: IconArrowUp,         color: '#22c55e', group: 'investing' },
  watchlist_signal:  { icon: IconEye,             color: '#5b7cf0', group: 'investing' },
  earnings_reminder: { icon: IconCalendarEvent,   color: '#a855f7', group: 'investing' },
  community_reply:   { icon: IconMessageCircle,   color: '#5b7cf0', group: 'community' },
  badge_earned:      { icon: IconMedal,           color: '#22c55e', group: 'money' },
  pledge_slip:       { icon: IconHandStop,        color: '#f59e0b', group: 'money' },
  buddy_update:      { icon: IconHeartHandshake,  color: '#a855f7', group: 'money' },
  buddy_invite:      { icon: IconHeartHandshake,  color: '#a855f7', group: 'money' },
}
const metaOf = (type: string) => NOTIF[type] ?? { icon: IconBell, color: '#5b7cf0', group: 'investing' as Group }
const GROUPS: { id: Group | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'money', label: 'Money' }, { id: 'business', label: 'Business' },
  { id: 'investing', label: 'Investing' }, { id: 'community', label: 'Community' },
]
const DEFAULT_LINK: Record<Group, string> = { money: '/app/dashboard', business: '/app/finance/business/invoices', investing: '/app/portfolio', community: '/app/community' }

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch" aria-checked={checked} aria-label={label}
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

function Section({ icon: Icon, color, title, desc, children }: { icon: typeof IconBell; color: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `color-mix(in srgb, ${color} 14%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} style={{ color }} />
        </div>
        <div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>{title}</div>
          {desc && <div style={{ fontSize: 12, color: 'var(--text2)' }}>{desc}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('feed')
  const [group, setGroup] = useState<Group | 'all'>('all')
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
    stop_loss_pct: 10, take_profit_pct: 20,
    portfolio_sell_alerts: true, watchlist_buy_alerts: true, watchlist_sell_alerts: true, price_alerts: true, earnings_alerts: true,
    bill_alerts: true, budget_alerts: true, goal_alerts: true, invoice_alerts: true, sync_alerts: true, community_alerts: true,
    reward_alerts: true, pledge_alerts: true, buddy_alerts: true,
    email_mode: 'off', weekly_summary: false,
  })
  const [thresholds, setThresholds] = useState({ stop_loss_pct: '10', take_profit_pct: '20' })

  const supabase = createClient()

  useEffect(() => {
    // Emails link straight to Preferences (?tab=preferences).
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'preferences' || t === 'rules') setTab(t)
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      setUserId(data.user.id)
      loadNotifs()
      loadAlerts(data.user.id)
      loadPrefs()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadNotifs() {
    setLoadingNotifs(true)
    try {
      const data = await api.getNotifications()
      setNotifs(Array.isArray(data) ? data : [])
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
      if (data && !data.error) {
        setPrefs(prev => ({ ...prev, ...data }))
        setThresholds({ stop_loss_pct: String(data.stop_loss_pct ?? 10), take_profit_pct: String(data.take_profit_pct ?? 20) })
      }
    } catch {}
  }

  async function checkNow() {
    setChecking(true)
    try {
      const result = await api.checkAlerts()
      const count = result.count ?? result.triggered?.length ?? 0
      toast.success(count > 0 ? `${count} new notification${count !== 1 ? 's' : ''}` : 'All checked. Nothing new.')
      await loadNotifs()
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED))
      if (userId) await loadAlerts(userId)
    } catch (e: any) {
      toast.error(e.message)
    }
    setChecking(false)
  }

  async function markRead(ids?: number[]) {
    setNotifs(prev => prev.map(n => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)))
    await api.markNotificationsRead(ids).catch(() => {})
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED))
  }

  async function open(n: Notification) {
    if (!n.read) markRead([n.id])
    router.push(n.link || DEFAULT_LINK[metaOf(n.type).group])
  }

  async function clearRead() {
    if (!confirm('Remove all read notifications?')) return
    await api.clearReadNotifications().catch(() => {})
    setNotifs(prev => prev.filter(n => !n.read))
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

  // Switches save as they change.
  async function save(patch: Partial<Prefs>, quiet = false) {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    try {
      await api.saveNotificationPrefs(next)
      if (!quiet) toast.success('Saved')
    } catch (e: any) {
      toast.error(e.message)
      setPrefs(prefs)
    }
  }
  const toggle = (key: BoolPref) => (v: boolean) => save({ [key]: v } as Partial<Prefs>, true)

  function saveThresholds() {
    const sl = Number(thresholds.stop_loss_pct), tp = Number(thresholds.take_profit_pct)
    if (!(sl >= 1 && sl <= 99) || !(tp >= 1 && tp <= 1000)) return toast.error('Use 1–99% for the fall and 1–1000% for the rise.')
    save({ stop_loss_pct: Math.round(sl), take_profit_pct: Math.round(tp) })
  }

  const unreadCount = notifs.filter(n => !n.read).length
  const activeAlerts = alerts.filter(a => !a.triggered)
  const triggeredAlerts = alerts.filter(a => a.triggered)
  const shown = group === 'all' ? notifs : notifs.filter(n => metaOf(n.type).group === group)
  const unreadIn = (g: Group | 'all') => notifs.filter(n => !n.read && (g === 'all' || metaOf(n.type).group === g)).length

  const Row = ({ k, label, desc }: { k: BoolPref; label: string; desc: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderTop: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{desc}</div>
      </div>
      <Toggle checked={!!prefs[k]} onChange={toggle(k)} label={label} />
    </div>
  )

  return (
    <div style={{ padding: 28, maxWidth: 760 }} className="m-pad">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Notifications</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>Bills, budgets, goals, pledges, invoices, your shares and replies, in one place</p>
        </div>
        <button onClick={checkNow} disabled={checking}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 700, border: 'none', cursor: checking ? 'default' : 'pointer', opacity: checking ? 0.7 : 1 }}
        >
          {checking ? <LoadingSpinner size={13} /> : <IconRefresh size={13} />}
          {checking ? 'Checking…' : 'Check now'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: 'var(--surface)', borderRadius: 12, padding: 4, border: '1px solid var(--border)', width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
        {([
          { key: 'feed',        label: 'Feed',        badge: unreadCount },
          { key: 'rules',       label: 'Price alerts', badge: activeAlerts.length },
          { key: 'preferences', label: 'Preferences', badge: 0 },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '7px 16px', borderRadius: 9, fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 600, whiteSpace: 'nowrap',
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
                background: tab === t.key ? 'rgba(255,255,255,0.25)' : 'var(--primary)', color: 'white',
              }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Feed tab ── */}
      {tab === 'feed' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {GROUPS.map(g => {
              const on = group === g.id, n = unreadIn(g.id)
              return (
                <button key={g.id} onClick={() => setGroup(g.id)} aria-pressed={on}
                  style={{ padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--primary)' : 'var(--surface2)', color: on ? 'white' : 'var(--text2)' }}>
                  {g.label}{n > 0 ? ` · ${n}` : ''}
                </button>
              )
            })}
            <span style={{ flex: 1 }} />
            {unreadCount > 0 && (
              <button onClick={() => markRead()} style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <IconCheck size={13} /> Mark all read
              </button>
            )}
            {notifs.some(n => n.read) && (
              <button onClick={clearRead} style={{ fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear read</button>
            )}
          </div>

          {loadingNotifs ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><LoadingSpinner size={32} /></div>
          ) : shown.length === 0 ? (
            <div className="card text-center" style={{ padding: '40px 24px' }}>
              <IconBell size={36} style={{ color: 'var(--text3)', margin: '0 auto 12px' }} />
              <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 16, marginBottom: 8 }}>{notifs.length ? 'Nothing here' : 'No notifications yet'}</p>
              <p style={{ color: 'var(--text2)', fontSize: 13, maxWidth: 420, margin: '0 auto' }}>
                Fennec lets you know when a bill is due, a budget is nearly used, a goal is reached, an invoice is overdue, a share hits your target, or someone replies to your post. Choose what you get in Preferences.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shown.map(n => {
                const meta = metaOf(n.type)
                const Icon = meta.icon
                return (
                  <button key={n.id} onClick={() => open(n)} className="card" style={{
                    display: 'flex', gap: 14, padding: '14px 16px', opacity: n.read ? 0.7 : 1, textAlign: 'left', cursor: 'pointer', width: '100%', color: 'inherit', font: 'inherit',
                    borderLeft: n.read ? '3px solid transparent' : `3px solid ${meta.color}`,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={17} style={{ color: meta.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>{n.title}</span>
                        {!n.read && <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--primary)', color: 'white', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>New</span>}
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.55, overflowWrap: 'anywhere' }}>{n.body}</p>
                      <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Price alerts tab ── */}
      {tab === 'rules' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--text2)', flex: 1, minWidth: 220 }}>
              Get told when a share rises above or drops below a price. Checked about every 15 minutes{prefs.email_mode === 'off' ? '' : ', and emailed straight away'}.
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
              <p style={{ color: 'var(--text2)', fontSize: 13 }}>No price alerts yet. Add one to get started.</p>
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
                  <button onClick={() => removeAlert(a.id)} aria-label="Delete alert" style={{ color: 'var(--text3)', padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}><IconTrash size={15} /></button>
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
                      <button onClick={() => removeAlert(a.id)} aria-label="Delete alert" style={{ color: 'var(--text3)', padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}><IconTrash size={15} /></button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Preferences tab ── */}
      {tab === 'preferences' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>Changes save as you make them.</p>

          <Section icon={IconMail} color="#5b7cf0" title="Email" desc="Everything also shows in your feed and on the bell">
            <div role="radiogroup" aria-label="How to email you" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {([
                { id: 'immediate', label: 'Straight away', desc: 'An email as things happen (checked every 15 minutes)' },
                { id: 'daily', label: 'Morning summary', desc: 'One email at about 7am with anything new. Price alerts still come straight away.' },
                { id: 'off', label: 'Don’t email me', desc: 'Only the feed and the bell' },
              ] as const).map(o => {
                const on = prefs.email_mode === o.id
                return (
                  <button key={o.id} role="radio" aria-checked={on} onClick={() => save({ email_mode: o.id })}
                    style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 9, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-light)' : 'transparent', color: 'var(--text)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{o.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{o.desc}</div>
                  </button>
                )
              })}
            </div>
            <div style={{ marginTop: 10 }}>
              <Row k="weekly_summary" label="Weekly summary" desc="Monday morning: budget so far this month, bills in the next 7 days and progress on your goals" />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Emails include amounts, such as what a bill is for. They go to the email you sign in with.</p>
          </Section>

          <Section icon={IconWallet} color="#22c55e" title="Money">
            <Row k="bill_alerts" label="Bills due" desc="Once, up to two days before it’s due" />
            <Row k="budget_alerts" label="Budgets" desc="When a category is 90% used, and when it goes over" />
            <Row k="goal_alerts" label="Goals" desc="When you reach a goal, or one passes its date" />
            <Row k="sync_alerts" label="Bank connection" desc="When your accounts stop updating and need reconnecting" />
            <Row k="reward_alerts" label="Badges" desc="When you earn a new badge on Budget → Wins" />
            <Row k="pledge_alerts" label="Pledge slips" desc="When spending shows up somewhere you've pledged not to spend" />
            <Row k="buddy_alerts" label="Your buddies" desc="When someone you're an accountability buddy for slips, goes over budget or misses a goal" />
          </Section>

          <Section icon={IconBuildingStore} color="#f59e0b" title="Business">
            <Row k="invoice_alerts" label="Overdue invoices" desc="When an invoice you've sent passes its due date" />
          </Section>

          <Section icon={IconChartLine} color="#5b7cf0" title="Investing">
            <Row k="price_alerts" label="Price alerts" desc="When a share crosses a price you set on Price alerts" />
            <Row k="portfolio_sell_alerts" label="Big moves in your holdings" desc="When a holding is down or up by the percentages below, from your buy price" />
            <Row k="watchlist_buy_alerts" label="Watchlist BUY ratings" desc="When Fennec's AI analysis rates a watched share BUY" />
            <Row k="watchlist_sell_alerts" label="Watchlist SELL ratings" desc="When Fennec's AI analysis rates a watched share SELL" />
            <Row k="earnings_alerts" label="Earnings dates" desc="The day before a company you hold or watch reports results" />
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {([
                { k: 'stop_loss_pct', label: 'Tell me when down', color: '#ef4444', icon: IconArrowDown },
                { k: 'take_profit_pct', label: 'Tell me when up', color: '#22c55e', icon: IconArrowUp },
              ] as const).map(f => (
                <label key={f.k} style={{ flex: 1, minWidth: 130, fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}><f.icon size={13} style={{ color: f.color }} /> {f.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="number" min={1} max={f.k === 'stop_loss_pct' ? 99 : 1000} value={thresholds[f.k]}
                      onChange={e => setThresholds(t => ({ ...t, [f.k]: e.target.value }))}
                      style={{ flex: 1, minWidth: 0, padding: '9px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 700 }} />
                    <span style={{ fontWeight: 700, color: f.color }}>%</span>
                  </span>
                </label>
              ))}
              <button onClick={saveThresholds}
                disabled={Number(thresholds.stop_loss_pct) === prefs.stop_loss_pct && Number(thresholds.take_profit_pct) === prefs.take_profit_pct}
                style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', opacity: Number(thresholds.stop_loss_pct) === prefs.stop_loss_pct && Number(thresholds.take_profit_pct) === prefs.take_profit_pct ? 0.5 : 1 }}>
                Save
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
              Shares are checked every few hours; prices can be up to 20 minutes delayed. These are reminders you set, not advice to buy or sell.
            </p>
          </Section>

          <Section icon={IconUsers} color="#a855f7" title="Community">
            <Row k="community_alerts" label="Replies to your posts" desc="When someone replies to something you posted" />
          </Section>
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
