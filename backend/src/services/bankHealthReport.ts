import type { SupabaseClient } from '@supabase/supabase-js';
import { diagnose, loadHealth, healthText, type BankHealth, type Finding } from './bankHealth';

/** Everything Settings, the fox chat and a support report need about one person's bank connection. */
export async function bankHealthFor(supabase: SupabaseClient, userId: string): Promise<{
  connected: boolean; health: BankHealth | null; findings: Finding[]; text: string;
}> {
  const [{ data: creds }, { data: problem }, health] = await Promise.all([
    supabase.from('akahu_credentials').select('user_id').eq('user_id', userId).maybeSingle(),
    supabase.from('akahu_connection_status').select('problem').eq('user_id', userId).maybeSingle(),
    loadHealth(supabase, userId),
  ]);
  const connected = !!creds;
  const findings = diagnose(health, connected, (problem as any)?.problem === 'tokens');
  return { connected, health, findings, text: connected ? healthText(health, findings) : findings.map(f => `${f.title}. ${f.fix}`).join('\n') };
}
