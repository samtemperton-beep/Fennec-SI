import type { SupabaseClient } from '@supabase/supabase-js';

// Remembers why a user's Akahu connection needs attention, so the dashboard and
// Settings can say what to do even when the failure happened in a background
// sync. Best-effort: a failure here must never fail a sync.

export type AkahuProblem = 'tokens' | 'connection';

export async function setAkahuProblem(supabase: SupabaseClient, userId: string, problem: AkahuProblem, detail?: string) {
  const { error } = await supabase.from('akahu_connection_status').upsert(
    { user_id: userId, problem, detail: detail ?? null, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) console.error('[akahu health] could not save status:', error.message);
}

export async function clearAkahuProblem(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase.from('akahu_connection_status').delete().eq('user_id', userId);
  if (error) console.error('[akahu health] could not clear status:', error.message);
}
