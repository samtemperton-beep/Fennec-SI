import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Pages that need a signed-in user. Everything else (landing page, login,
// /auth/callback, privacy, terms) stays public.
const PROTECTED = ['/app', '/onboarding', '/admin', '/settings']
const isProtected = (path: string) => PROTECTED.some(p => path === p || path.startsWith(p + '/'))

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Also refreshes an expiring session, so it must run on every matched request.
  const { data: { user } } = await supabase.auth.getUser()
  const { pathname, search } = request.nextUrl

  // A redirect has to carry any refreshed session cookies with it.
  const redirectTo = (url: URL) => {
    const res = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach(c => res.cookies.set(c))
    return res
  }

  if (!user && isProtected(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', pathname + search)
    return redirectTo(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/app/dashboard'
    url.search = ''
    return redirectTo(url)
  }

  return supabaseResponse
}

// Must be exported as `config` (it was `proxyConfig`, which Next ignores, so the
// proxy ran on every image and script request too).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
