import type { SupabaseClient } from '@supabase/supabase-js'

// Household categories are either spending (counted in your monthly budget) or
// income (money coming in: its "budget" is what you expect to receive, and it's
// never counted as spending). category_kind_migration.sql adds fin_categories.kind;
// until it's run, Income and Interest are treated as income by name.

export type CategoryKind = 'spending' | 'income'
export const INCOME_NAMES = new Set(['Income', 'Interest'])

export function isIncomeCategory(c: { name: string; kind?: string | null }): boolean {
  return c.kind ? c.kind === 'income' : INCOME_NAMES.has(c.name)
}

export class CategoryError extends Error {}

/** Creates a household category of yours, and returns it. */
export async function createCategory(supabase: SupabaseClient, rawName: string, kind: CategoryKind) {
  const name = rawName.replace(/\s+/g, ' ').trim()
  if (name.length < 2) throw new CategoryError('Give the category a name.')
  if (name.length > 40) throw new CategoryError('Keep the name under 40 characters.')
  let { data, error } = await supabase.from('fin_categories')
    .insert({ name, scope: 'household', kind }).select('*').single()
  // Before the migration there's no kind column: save the name alone.
  if (error && /kind/.test(error.message)) {
    ({ data, error } = await supabase.from('fin_categories').insert({ name, scope: 'household' }).select('*').single())
  }
  if (error) {
    if (error.code === '23505') throw new CategoryError(`You already have a category called “${name}”.`)
    throw new CategoryError(error.message)
  }
  return data as { id: string; name: string; kind?: CategoryKind | null; monthly_budget: number | null }
}
