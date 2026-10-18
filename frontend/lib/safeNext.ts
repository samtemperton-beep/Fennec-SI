/** Where to send someone after they sign in. */
export const DEFAULT_AFTER_LOGIN = '/app/dashboard'

/**
 * Accepts only a path on this site ("/app/budget?x=1"). Anything else (full
 * URLs, "//evil.com", "@evil.com", backslash tricks) falls back to the default,
 * so a crafted ?next= can't bounce a freshly signed-in user to another site.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return DEFAULT_AFTER_LOGIN
  if (/[\u0000-\u001f]/.test(next)) return DEFAULT_AFTER_LOGIN
  return next
}
