// The password rule for new accounts and resets. Length matters most, so this
// asks for 10 characters rather than a mix of symbols, and refuses the passwords
// attackers try first. Returns what's wrong, or null if it's fine.

export const PASSWORD_MIN = 10

const COMMON = [
  'password', 'qwerty', 'letmein', 'welcome', 'iloveyou', 'admin', 'abc123', 'fennec',
  'trustno1', 'dragon', 'monkey', 'football', 'baseball', 'sunshine', 'princess',
]

export function checkPassword(password: string, email = ''): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters for your password.`
  const lower = password.toLowerCase()
  const name = email.split('@')[0].toLowerCase()
  if (name.length >= 3 && lower.includes(name)) return "Your password can't contain your email name."
  if (COMMON.some(w => lower.includes(w))) return 'That password is too easy to guess. Try a few unrelated words.'
  if (new Set(lower).size < 5) return 'That password repeats too much. Try a few unrelated words.'
  if ('01234567890123456789'.includes(lower) || 'abcdefghijklmnopqrstuvwxyz'.includes(lower)) return 'That password is too easy to guess. Try a few unrelated words.'
  return null
}
