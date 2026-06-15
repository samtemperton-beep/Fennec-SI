'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { IconBrandGoogle, IconChartBar, IconMail } from '@tabler/icons-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState<'google' | 'magic' | null>(null)
  const supabase = createClient()

  async function signInGoogle() {
    setLoading('google')
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app/portfolio` },
    })
  }

  async function signInMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading('magic')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/app/portfolio` },
    })
    setLoading(null)
    if (!error) setSent(true)
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div style={{ background: 'var(--accent)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconChartBar size={20} color="white" />
          </div>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 20 }}>Fennec SI</span>
        </div>

        <h2 className="text-center mb-2" style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 22 }}>
          Welcome back
        </h2>
        <p className="text-center mb-8" style={{ color: 'var(--text2)', fontSize: 14 }}>Sign in to your portfolio</p>

        {sent ? (
          <div className="text-center py-8">
            <IconMail size={40} style={{ color: 'var(--accent)', margin: '0 auto 12px' }} />
            <p style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>Check your email</p>
            <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 8 }}>We sent a magic link to {email}</p>
          </div>
        ) : (
          <>
            <button
              onClick={signInGoogle}
              disabled={!!loading}
              className="w-full flex items-center justify-center gap-3 py-3 rounded-lg mb-4 transition-colors"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}
            >
              {loading === 'google' ? <LoadingSpinner size={18} /> : <IconBrandGoogle size={18} />}
              Continue with Google
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ color: 'var(--text2)', fontSize: 12 }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <form onSubmit={signInMagicLink}>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg mb-3"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'DM Mono, monospace', outline: 'none' }}
              />
              <button
                type="submit"
                disabled={!!loading || !email}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg transition-opacity"
                style={{ background: 'var(--accent)', color: 'white', fontFamily: 'Syne, sans-serif', fontWeight: 600, opacity: loading ? 0.7 : 1 }}
              >
                {loading === 'magic' ? <LoadingSpinner size={18} /> : <IconMail size={18} />}
                Send magic link
              </button>
            </form>
          </>
        )}

        <p className="text-center mt-6" style={{ color: 'var(--text2)', fontSize: 12 }}>
          By signing in you agree to our Terms of Service
        </p>
      </div>
    </div>
  )
}
