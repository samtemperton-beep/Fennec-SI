'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { api, type PartnerStatus } from '@/lib/api'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconRefresh, IconBuildingBank, IconChevronRight, IconChevronDown, IconHeartHandshake } from '@tabler/icons-react'
import { toast } from 'sonner'

const supabase = createClient()

const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })

const TYPE_COLORS: Record<string, string> = {
  CHECKING: '#14B8A6', SAVINGS: '#22C55E', CREDIT: '#EF4444',
  LOAN: '#F59E0B', INVESTMENT: '#5B7CF0', OTHER: '#A855F7',
}
function typeColor(t: string) { return TYPE_COLORS[t?.toUpperCase()] ?? '#898781' }

type ShareLevel = 'private' | 'balance' | 'full'
const SHARE_LABELS: Record<ShareLevel, string> = { private: 'Private', balance: 'Balance only', full: 'Balance + transactions' }

interface Account {
  id: string; name: string; type: string
  current_balance: number; last_synced: string | null
  is_business: boolean; akahu_account_id: string | null
  is_rental?: boolean
  share_level: ShareLevel
}
// An account a partner has shared (from shared_accounts() in partner_sharing_migration.sql)
interface SharedAccount {
  id: string; name: string; type: string
  current_balance: number; last_synced: string | null
  share_level: 'balance' | 'full'
}
interface SharedTx { id: string; date: string; description: string | null; amount: number; category: string | null }

const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10, fontFamily: 'Syne, sans-serif' }

export default function AccountsPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [partner, setPartner] = useState<PartnerStatus | null>(null)
  const [shared, setShared] = useState<SharedAccount[]>([])
  const [openShared, setOpenShared] = useState<string | null>(null)
  const [sharedTx, setSharedTx] = useState<Record<string, SharedTx[]>>({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data, error } = await supabase.from('fin_accounts').select('*').order('name')
    if (error) toast.error(error.message)
    else setAccounts(data || [])
    setLoading(false)

    // Sharing is an extra: if it can't load, your own accounts still work.
    try {
      const p = await api.partnerStatus()
      setPartner(p)
      if (p.status === 'linked') {
        const { data: s } = await supabase.rpc('shared_accounts')
        setShared(s || [])
      }
    } catch { /* leave sharing off */ }
  }

  async function syncAkahu() {
    setSyncing(true)
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || ''
      const { data: { session } } = await supabase.auth.getSession()

      // The server reads the (encrypted) tokens itself; they never reach the browser.
      const r = await fetch(`${API}/api/finance/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({}),
      })
      const result = await r.json()
      if (!r.ok) throw new Error(result.error || 'Sync failed')
      toast.success(`Synced ${result.accounts} accounts, ${result.transactions} new transactions`)
      await load()
    } catch (e: any) {
      toast.error(e.message)
    }
    setSyncing(false)
  }

  async function setShare(a: Account, level: ShareLevel) {
    const before = accounts
    setAccounts(prev => prev.map(x => x.id === a.id ? { ...x, share_level: level } : x))
    const { error } = await supabase.from('fin_accounts').update({ share_level: level }).eq('id', a.id)
    if (error) { setAccounts(before); toast.error(error.message) }
  }

  async function toggleShared(a: SharedAccount) {
    if (a.share_level !== 'full') return
    if (openShared === a.id) { setOpenShared(null); return }
    setOpenShared(a.id)
    if (!sharedTx[a.id]) {
      const { data, error } = await supabase.rpc('shared_transactions', { account: a.id, max_rows: 100 })
      if (error) toast.error(error.message)
      else setSharedTx(prev => ({ ...prev, [a.id]: data || [] }))
    }
  }

  const linked = partner?.status === 'linked' ? partner.partner : null
  const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance), 0)

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><LoadingSpinner size={32} /></div>

  const icon = (type: string) => (
    <div style={{ width: 38, height: 38, borderRadius: 10, background: typeColor(type), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <IconBuildingBank size={17} color="white" />
    </div>
  )
  const balance = (amount: number, synced: string | null) => (
    <div>
      <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color: Number(amount) >= 0 ? 'var(--text)' : 'var(--red)' }}>
        {currency.format(Number(amount))}
      </p>
      {synced && <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
        {new Date(synced).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
      </p>}
    </div>
  )

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24 }}>Accounts</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Synced via Akahu · live bank balances</p>
        </div>
        <button onClick={syncAkahu} disabled={syncing}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: 'var(--primary)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: syncing ? 0.7 : 1 }}>
          {syncing ? <LoadingSpinner size={14} /> : <IconRefresh size={14} />} Sync Akahu
        </button>
      </div>

      {/* Net worth summary: your own accounts only */}
      <div className="card" style={{ marginBottom: 24, padding: 24 }}>
        <p style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'Syne, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Total Balance</p>
        <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 32, color: totalBalance >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {currency.format(totalBalance)}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{accounts.length} accounts</p>
      </div>

      {accounts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <IconBuildingBank size={32} style={{ color: 'var(--text3)', marginBottom: 12 }} />
          <p style={{ color: 'var(--text2)', fontSize: 14 }}>No accounts synced yet. Click "Sync Akahu" to import your bank accounts.</p>
        </div>
      ) : (
        <div>
          <p style={sectionLabel}>My Accounts</p>
          {linked && (
            <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
              Choose what {linked.name} can see. Business accounts are never shared.
            </p>
          )}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {accounts.map((a, i) => (
              <div
                key={a.id}
                onClick={() => router.push(a.is_business ? '/app/finance/business' : a.is_rental ? '/app/finance/rental' : `/app/finance/transactions?account=${a.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < accounts.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.12s', flexWrap: 'wrap' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {icon(a.type)}
                <div style={{ flex: 1, minWidth: 120 }}>
                  <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>{a.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
                    {a.type}{a.is_business ? ' · Business' : a.is_rental ? ' · Rental' : ''}
                    {!linked && a.share_level !== 'private' && !a.is_business ? ` · Shared when you link a partner` : ''}
                  </p>
                </div>
                {linked && !a.is_business && (
                  <select
                    value={a.share_level}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setShare(a, e.target.value as ShareLevel)}
                    aria-label={`What ${linked.name} can see of ${a.name}`}
                    style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: a.share_level === 'private' ? 'var(--surface2)' : 'var(--primary-light, rgba(44,110,106,0.12))', color: 'var(--text)', fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
                    {(Object.keys(SHARE_LABELS) as ShareLevel[]).map(l => <option key={l} value={l}>{SHARE_LABELS[l]}</option>)}
                  </select>
                )}
                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {balance(a.current_balance, a.last_synced)}
                  <IconChevronRight size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What a partner has shared. Read-only, and not part of your totals. */}
      {linked && (
        <div style={{ marginTop: 24 }}>
          <p style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 6 }}><IconHeartHandshake size={13} /> Shared by {linked.name}</p>
          {shared.length === 0 ? (
            <div className="card" style={{ padding: 20, fontSize: 13, color: 'var(--text2)' }}>
              {linked.name} hasn&apos;t shared any accounts yet. They can choose what to share on their Accounts page.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {shared.map((a, i) => (
                <div key={a.id} style={{ borderBottom: i < shared.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div
                    onClick={() => toggleShared(a)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', cursor: a.share_level === 'full' ? 'pointer' : 'default' }}
                  >
                    {icon(a.type)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>{a.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>{a.type} · {SHARE_LABELS[a.share_level]}</p>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {balance(a.current_balance, a.last_synced)}
                      {a.share_level === 'full'
                        ? <IconChevronDown size={14} style={{ color: 'var(--text3)', flexShrink: 0, transform: openShared === a.id ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                        : <span style={{ width: 14 }} />}
                    </div>
                  </div>
                  {openShared === a.id && (
                    <div style={{ padding: '0 20px 14px' }}>
                      {!sharedTx[a.id] ? <LoadingSpinner size={16} /> : sharedTx[a.id].length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--text2)' }}>No transactions yet.</p>
                      ) : sharedTx[a.id].map(t => (
                        <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                          <span style={{ color: 'var(--text3)', width: 52, flexShrink: 0 }}>{new Date(t.date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}</span>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</span>
                          {t.category && <span style={{ color: 'var(--text2)', fontSize: 11 }}>{t.category}</span>}
                          <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: Number(t.amount) < 0 ? 'var(--text)' : 'var(--green)' }}>{currency.format(Number(t.amount))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {partner && partner.status !== 'linked' && accounts.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 16 }}>
          Share accounts with your partner: <Link href="/app/settings" style={{ color: 'var(--primary)', fontWeight: 600 }}>link in Settings</Link>.
        </p>
      )}
    </div>
  )
}
