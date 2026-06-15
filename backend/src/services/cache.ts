import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

export async function getCached(key: string): Promise<any | null> {
  const { data } = await supabase
    .from('ai_cache')
    .select('data, expires_at')
    .eq('cache_key', key)
    .single();

  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  return data.data;
}

export async function setCached(key: string, data: any, ttlHours = 6): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();
  await supabase
    .from('ai_cache')
    .upsert({ cache_key: key, data, expires_at: expiresAt }, { onConflict: 'cache_key' });
}
