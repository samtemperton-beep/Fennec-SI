import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Email to every admin account (profiles.is_admin), from feedback and the
// nightly health check.

// Made on first use: Resend throws without a key, which would stop the server starting.
let resend: Resend | null = null;

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export async function adminEmails(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from('profiles').select('id').eq('is_admin', true);
  const users = await Promise.all((data || []).map(p => supabase.auth.admin.getUserById(p.id)));
  return users.map(u => u.data?.user?.email).filter((e): e is string => !!e);
}

/** Sends to every admin. Returns an error message, or null once sent. */
export async function emailAdmins(
  supabase: SupabaseClient,
  msg: { subject: string; html: string; replyTo?: string; attachments?: { filename: string; content: Buffer }[] },
): Promise<string | null> {
  if (!process.env.RESEND_API_KEY) return 'RESEND_API_KEY is not set';
  const to = await adminEmails(supabase);
  if (!to.length) return 'No admin account has an email address';
  resend ??= new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: 'Fennec <alerts@fennecsi.com>', to, ...msg });
  return error ? error.message : null;
}
