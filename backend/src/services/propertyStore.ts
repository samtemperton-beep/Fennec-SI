import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptField, decryptField, isFieldEncrypted } from './privateFields';

// The last property lookup (LINZ) and rates notice read for a person's home,
// kept so the Home Loan page doesn't have to look them up, or spend an AI use
// re-reading the notice, every time it opens. Saved encrypted in
// home_loan.property_details, because it holds the address, title and legal
// description. Cleared when the home address changes (routes/private.ts).
// property_cache_migration.sql adds the column; until it's run, nothing is
// saved and the page simply looks things up as before.

export interface SavedProperty {
  property?: unknown;
  property_at?: string;
  notice?: unknown;
  notice_at?: string;
}

export async function loadSavedProperty(supabase: SupabaseClient, userId: string): Promise<SavedProperty> {
  const { data, error } = await supabase.from('home_loan').select('property_details').eq('user_id', userId).maybeSingle();
  if (error || !data?.property_details) return {};
  const stored = String(data.property_details);
  if (!isFieldEncrypted(stored)) return {};
  try { return JSON.parse(decryptField(stored, userId, 'property_details')) ?? {}; }
  catch { return {}; }
}

/** Merges into what's saved: saving a notice keeps the property lookup, and the other way round. */
export async function saveProperty(supabase: SupabaseClient, userId: string, update: SavedProperty): Promise<void> {
  try {
    const next = { ...(await loadSavedProperty(supabase, userId)), ...update };
    const { error } = await supabase.from('home_loan')
      .update({ property_details: encryptField(JSON.stringify(next), userId, 'property_details') })
      .eq('user_id', userId);
    if (error) console.warn('[property] not saved:', error.message);
  } catch (e: any) {
    console.warn('[property] not saved:', e?.message ?? e);
  }
}

export async function clearSavedProperty(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from('home_loan').update({ property_details: null }).eq('user_id', userId);
  if (error && !/property_details/.test(error.message)) console.warn('[property] not cleared:', error.message);
}
