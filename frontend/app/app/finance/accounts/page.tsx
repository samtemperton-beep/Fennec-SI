'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { IconRefresh, IconBuildingBank, IconChevronRight } from '@tabler/icons-react'
import { toast } from 'sonner'

const supabase = createClient()

const currency = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })

const TYPE_COLORS: Record<string, string> = {
  CHECKING: '#14B8A6', SAVINGS: '#22C55E', CREDIT: '#EF4444',
  LOAN: '#F59E0B', INVESTMENT: '#5B7CF0', OTHER: '#A855F7',
}
function typeColor(t: string) { return TYPE_COLORS[t?.toUpperCase()] ?? '#898781' }

interface Account {
  id: string; name: string; type: string; owner: string
  current_balance: number; last_synced: string | null
  is_business: boolean; akahu_account_id: string | null
}

export default function AccountsPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [isMember, setIsMember] = useState<boolean | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: member } = await supabase.from('household_members').select('role').eq('user_id', user.id).maybeSingle()
    setIsMember(!!member)

    if (member) {
      const { data, error } = await supabase.from('fin_accounts').select('*').order('owner').order('name')
      if (error) toast.error(error.message)
      else setAccounts(data || [])
    }
    setLoading(false)
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

  const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance), 0)
  const grouped = accounts.reduce<Record<string, Account[]>>((acc, a) => {
    const k = a.owner; (acc[k] = acc[k] || []).push(a); return acc
  }, {})

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><LoadingSpinner size={32} /></div>

  if (isMember === false) return (
    <div style={{ padding: 28 }}>
      <div className="card" style={{ maxWidth: 480, textAlign: 'center', padding: 40 }}>
        <IconBuildingBank size={36} style={{ color: 'var(--primary)', marginBottom: 16 }} />
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Finance not set up yet</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          Run the <strong>finance_migration.sql</strong> file in your Supabase SQL editor, then add yourself to <code>household_members</code>.
        </p>
      </div>
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

      {/* Net worth summary */}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {(['me', 'joint', 'partner'] as const).filter(o => grouped[o]?.length).map(owner => (
            <div key={owner}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10, fontFamily: 'Syne, sans-serif' }}>
                {owner === 'me' ? 'My Accounts' : owner === 'partner' ? "Partner's Accounts" : 'Joint Accounts'}
              </p>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {grouped[owner].map((a, i) => (
                  <div
                    key={a.id}
                    onClick={() => router.push(a.is_business ? '/app/finance/business' : `/app/finance/transactions?account=${a.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < grouped[owner].length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: typeColor(a.type), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <IconBuildingBank size={17} color="white" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>{a.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>{a.type}{a.is_business ? ' · Business' : ''}</p>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div>
                        <p style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color: Number(a.current_balance) >= 0 ? 'var(--text)' : 'var(--red)' }}>
                          {currency.format(Number(a.current_balance))}
                        </p>
                        {a.last_synced && <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                          {new Date(a.last_synced).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                        </p>}
                      </div>
                      <IconChevronRight size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
