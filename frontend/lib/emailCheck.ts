// Catches mistyped email addresses before a confirmation email goes to the wrong
// place. Some typo domains (gmai.com) are real and accept mail, so a "does this
// domain exist" check alone isn't enough: known providers are compared first.

const COMMON_DOMAINS = [
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'me.com',
  'yahoo.com', 'yahoo.co.nz', 'proton.me', 'protonmail.com', 'xtra.co.nz', 'hotmail.co.nz',
  'outlook.co.nz', 'gmx.com', 'aol.com', 'orcon.net.nz', 'vodafone.co.nz', 'slingshot.co.nz',
]

/** Levenshtein distance, stopping early once it can't be within `max`. */
function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** Is this the same two letters swapped? (gmial -> gmail) Counts as one slip. */
function isSwap(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const diff = [...a].flatMap((c, i) => (c === b[i] ? [] : [i]))
  return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]
}

export type EmailCheck =
  | { ok: true; domain: string }
  | { ok: false; reason: string }
  | { ok: false; suggestion: string; domain: string }

/** Instant checks with no network: format, then likely typos of common domains. */
export function checkEmail(raw: string): EmailCheck {
  const email = raw.trim().toLowerCase()
  if (!email) return { ok: false, reason: 'Enter your email address.' }
  if (/\s/.test(email)) return { ok: false, reason: "An email address can't contain spaces." }
  const at = email.lastIndexOf('@')
  if (at < 1 || email.indexOf('@') !== at) return { ok: false, reason: 'That doesn’t look like an email address. It should look like name@example.com.' }
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return { ok: false, reason: 'Check the part before the @. It has a misplaced dot.' }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) || /\.[a-z]$/.test(domain) || /(^|\.)-|-(\.|$)/.test(domain)) {
    return { ok: false, reason: 'Check the part after the @. It should look like example.com.' }
  }
  if (COMMON_DOMAINS.includes(domain)) return { ok: true, domain }

  const close = COMMON_DOMAINS
    .map(d => ({ d, dist: isSwap(domain, d) ? 1 : editDistance(domain, d) }))
    .filter(c => c.dist <= 2)
    .sort((a, b) => a.dist - b.dist)[0]
  if (close) return { ok: false, suggestion: `${raw.trim().slice(0, at)}@${close.d}`, domain }

  return { ok: true, domain }
}
