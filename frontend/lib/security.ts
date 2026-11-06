// Security settings each person can ease off in Settings → Security & privacy.
// Everything starts switched on. Saved on the profile (profiles.security_prefs)
// so it follows the account, and cached on the device so pages open the right
// way before the profile has loaded.
//
// Keep in step with the FAQ (backend/src/services/faq.ts) and the Fennec chat's
// guide (backend/src/services/appGuide.ts).

export interface SecurityPrefs {
  /** Dollar amounts start hidden each time Fennec is opened. */
  hideAmountsOnOpen: boolean
  /** Amounts hide again after this long away from the app. */
  rehideAfterAway: boolean
  /** IRD/GST/bank numbers, home address and title details stay hidden until the eye is tapped. */
  hideDetails: boolean
  /** Minutes without activity before signing out. 0 = never. */
  idleMinutes: number
  /** When the person last looked at these settings (ticks off the Getting started step). */
  reviewedAt?: string
}

export const DEFAULT_SECURITY: SecurityPrefs = {
  hideAmountsOnOpen: true,
  rehideAfterAway: true,
  hideDetails: true,
  idleMinutes: 30,
}

export const IDLE_CHOICES: { minutes: number; label: string }[] = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 30, label: '30 minutes (recommended)' },
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' },
  { minutes: 0, label: 'Never' },
]

export const AWAY_MINUTES = 5

/** Saved preferences merged over the defaults, ignoring anything malformed. */
export function readSecurityPrefs(raw: unknown): SecurityPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const bool = (k: keyof SecurityPrefs) => typeof r[k] === 'boolean' ? r[k] as boolean : DEFAULT_SECURITY[k] as boolean
  const idle = Number(r.idleMinutes)
  return {
    hideAmountsOnOpen: bool('hideAmountsOnOpen'),
    rehideAfterAway: bool('rehideAfterAway'),
    hideDetails: bool('hideDetails'),
    idleMinutes: IDLE_CHOICES.some(c => c.minutes === idle) ? idle : DEFAULT_SECURITY.idleMinutes,
    ...(typeof r.reviewedAt === 'string' ? { reviewedAt: r.reviewedAt } : {}),
  }
}
