import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { safeNext } from '@/lib/safeNext'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  // 'recovery' comes from the reset-password email, which links here with a
  // token_hash so the link works in any browser (a ?code= link only works in
  // the browser that asked for the reset).
  const type = searchParams.get('type') as 'magiclink' | 'email' | 'recovery' | null
  const next = safeNext(searchParams.get('next'))

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  // Tell the sign-in page why it failed (lib/authError.ts turns this into words).
  const failed = (params: Record<string, string>) =>
    NextResponse.redirect(`${origin}/login?${new URLSearchParams(params)}`)

  // Supabase already gave up (e.g. Google sign-in cancelled, link expired): pass its reason on.
  const sbError = searchParams.get('error')
  if (sbError && !code && !token_hash) {
    const params: Record<string, string> = { error: sbError }
    const ec = searchParams.get('error_code'); if (ec) params.error_code = ec
    const ed = searchParams.get('error_description'); if (ed) params.error_description = ed
    return failed(params)
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    // The code only works in the browser that asked for it (it holds the matching verifier).
    if (/verifier/i.test(error.message)) return failed({ error: 'other_browser' })
    if (/expired|invalid/i.test(error.message)) return failed({ error: 'auth_failed', error_code: 'otp_expired' })
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    if (/expired|invalid/i.test(error.message)) return failed({ error: 'auth_failed', error_code: 'otp_expired' })
  }

  return failed({ error: 'auth_failed' })
}
