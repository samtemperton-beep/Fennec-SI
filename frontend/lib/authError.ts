/**
 * Why a sign-in failed, in plain words.
 *
 * Supabase reports failures in the address it sends people back to, as
 * error / error_code / error_description, in the query (?) or the hash (#).
 * When it can't use the address we asked for it falls back to the Site URL,
 * so a failed link can land on the home page: app/layout.tsx moves those to
 * /login, and app/auth/callback/route.ts passes its own failures on as
 * ?error=auth_failed or ?error=other_browser.
 */
export interface AuthProblem {
  message: string
  /** Offer to send a new magic link (an emailed link has expired or was used). */
  offerNewLink: boolean
}

export function readAuthProblem(search: string, hash: string): AuthProblem | null {
  const q = new URLSearchParams(search)
  const h = new URLSearchParams(hash.replace(/^#/, ''))
  const get = (k: string) => h.get(k) ?? q.get(k)
  const error = get('error')
  const code = get('error_code')
  if (!error && !code) return null

  const description = (get('error_description') ?? '').toLowerCase()

  if (code === 'otp_expired' || description.includes('link')) {
    return {
      message: 'That email link has expired or has already been used. Each link works once. Send yourself a new one below.',
      offerNewLink: true,
    }
  }
  // e.g. Google: "OAuth state has expired" (the sign-in page was left open too long)
  if (description.includes('expired')) {
    return {
      message: 'That sign-in took too long and timed out. Please start again.',
      offerNewLink: false,
    }
  }
  if (error === 'other_browser') {
    return {
      message: 'That link needs to be opened in the same browser you asked for it from. Open it there, or send a new one below.',
      offerNewLink: true,
    }
  }
  if (error === 'access_denied') {
    return {
      message: 'Sign-in was cancelled. Try again, or use your email instead.',
      offerNewLink: false,
    }
  }
  return {
    message: "Sign-in didn't work that time. Please try again. If it keeps happening, use the other sign-in option or let us know.",
    offerNewLink: false,
  }
}
