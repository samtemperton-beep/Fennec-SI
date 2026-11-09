import type { SupabaseClient } from '@supabase/supabase-js'

// Optional things a person tells Fennec about themselves, used to suggest
// budgets and goals and to give the fox context. Saved on profiles.about
// (about_you_migration.sql). Everything here is optional.

export const AGE_BANDS = ['Under 25', '25–34', '35–44', '45–54', '55–64', '65+'] as const
export type AgeBand = typeof AGE_BANDS[number]

export const INTERESTS = [
  { id: 'emergency', label: 'An emergency fund' },
  { id: 'debt', label: 'Paying off debt' },
  { id: 'home', label: 'Buying a home' },
  { id: 'holiday', label: 'Travel' },
  { id: 'car', label: 'A car' },
  { id: 'investing', label: 'Investing' },
  { id: 'retirement', label: 'Retirement and KiwiSaver' },
  { id: 'business', label: 'Running a business' },
  { id: 'spend_less', label: 'Spending less' },
] as const
export type InterestId = typeof INTERESTS[number]['id']

/** Answers to the budget helper's questions, kept so they're filled in next time. */
export interface HouseholdAnswers {
  adults?: number
  children?: number
  takeHome?: number // a month, after tax
  housing?: number // rent or mortgage, a month
  car?: boolean
}

export interface AboutYou {
  ageBand?: AgeBand
  interests?: InterestId[]
  household?: HouseholdAnswers
}

export async function loadAboutYou(supabase: SupabaseClient): Promise<AboutYou> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  const { data, error } = await supabase.from('profiles').select('about').eq('id', user.id).maybeSingle()
  if (error) return {} // before the migration
  return ((data as any)?.about ?? {}) as AboutYou
}

/** Merges into what's saved. */
export async function saveAboutYou(supabase: SupabaseClient, patch: AboutYou): Promise<AboutYou> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return patch
  const next = { ...(await loadAboutYou(supabase)), ...patch }
  const { error } = await supabase.from('profiles').update({ about: next }).eq('id', user.id)
  if (error) console.warn('[about] not saved:', error.message)
  return next
}

/** For the fox. */
export function aboutYouText(a: AboutYou): string | undefined {
  const parts: string[] = []
  if (a.ageBand) parts.push(`Age: ${a.ageBand}.`)
  if (a.interests?.length) parts.push(`Working towards: ${a.interests.map(i => INTERESTS.find(x => x.id === i)?.label ?? i).join(', ')}.`)
  const h = a.household
  if (h && (h.adults || h.children || h.takeHome || h.housing)) {
    parts.push(`Household: ${h.adults ?? '?'} adult(s), ${h.children ?? 0} child(ren)${h.takeHome ? `, take-home about $${Math.round(h.takeHome).toLocaleString('en-NZ')} a month` : ''}${h.housing ? `, rent/mortgage about $${Math.round(h.housing).toLocaleString('en-NZ')} a month` : ''}${h.car != null ? (h.car ? ', runs a car' : ', no car') : ''}.`)
  }
  return parts.length ? parts.join(' ') : undefined
}
