import { createClient, SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';
import { runAkahuSync } from './akahuSync';

// Background Akahu sync, so value history keeps building when nobody has the
// app open. Akahu refreshes personal apps about once a day; syncing every few
// hours means a snapshot is captured soon after each refresh, and the per-day
// upsert makes extra runs harmless.
//
// OFF unless ENABLE_SCHEDULED_SYNC=true, which should only be set on the
// deployed server. Without that gate, anyone running the backend locally with
// production credentials would be syncing real users' data.

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 2 * 60 * 1000;

export interface SyncAllResult {
  users: number;
  ok: number;
  failed: number;
}

/** Syncs every user who has saved Akahu tokens. One user's failure never stops the others. */
export async function syncAllUsers(supabase: SupabaseClient): Promise<SyncAllResult> {
  const { data: creds, error } = await supabase.from('akahu_credentials').select('user_id');
  if (error) throw new Error(error.message);
  const ids = (creds ?? []).map((c: any) => c.user_id as string);
  if (ids.length === 0) return { users: 0, ok: 0, failed: 0 };

  const { data: profiles } = await supabase.from('profiles').select('id, subscription_tier').in('id', ids);
  const premium = new Set((profiles ?? []).filter((p: any) => p.subscription_tier === 'premium').map((p: any) => p.id));

  let ok = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await runAkahuSync(supabase, id, premium.has(id));
      ok++;
    } catch (e: any) {
      failed++;
      // Never log tokens; the user id prefix and message are enough to diagnose.
      console.error(`[scheduled sync] user ${id.slice(0, 8)} failed: ${e?.message ?? e}`);
    }
  }
  return { users: ids.length, ok, failed };
}

let running = false;

export function startScheduledSync(supabase?: SupabaseClient) {
  const client =
    supabase ??
    createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { realtime: { transport: ws as any } });

  async function tick() {
    if (running) return; // never overlap runs
    running = true;
    try {
      const r = await syncAllUsers(client);
      console.log(`[scheduled sync] ${r.ok}/${r.users} users synced${r.failed ? `, ${r.failed} failed` : ''}`);
    } catch (e: any) {
      console.error('[scheduled sync] run failed:', e?.message ?? e);
    } finally {
      running = false;
    }
  }

  setTimeout(tick, STARTUP_DELAY_MS);
  setInterval(tick, SYNC_INTERVAL_MS);
  console.log('[scheduled sync] enabled: every 6 hours, first run in 2 minutes');
}
