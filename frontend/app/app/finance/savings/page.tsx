'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { SavingsView } from '@/components/savings/SavingsView'
import { loadSavingsData, type SavingsData } from '@/lib/savingsData'

export default function SavingsPage() {
  const [data, setData] = useState<SavingsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSavingsData(createClient())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><LoadingSpinner size={32} /></div>
  if (!data) return <div style={{ padding: 32, color: 'var(--text2)' }}>Your savings couldn&apos;t be loaded just now. Please refresh the page.</div>
  return <SavingsView data={data} />
}
