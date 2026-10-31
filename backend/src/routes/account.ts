import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { requireAuth } from '../middleware/auth';
import { revokeGmail } from './gmail';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

const router = Router();

// DELETE /api/account — permanently deletes the signed-in user. The database
// function removes their data in one transaction (joint data stays with the
// other household member). The login goes last, so a failure part way through
// leaves them able to sign in and try again.
router.delete('/', requireAuth, async (req: any, res) => {
  if (req.body?.confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Type DELETE to confirm.' });
  }
  const userId: string = req.user.id;

  await revokeGmail(userId);

  const { error } = await supabase.rpc('delete_user_data', { target: userId });
  if (error) {
    console.error(`[account] delete failed for ${userId.slice(0, 8)}:`, error.message);
    return res.status(500).json({ error: "We couldn't delete your account, and nothing was removed. Please try again." });
  }

  // Best-effort: the image is removed with the account, but a leftover file
  // shouldn't stop the login being deleted.
  try {
    const { data: files } = await supabase.storage.from('avatars').list(userId);
    if (files?.length) await supabase.storage.from('avatars').remove(files.map((f) => `${userId}/${f.name}`));
  } catch (e: any) {
    console.error('[account] could not remove avatar:', e?.message ?? e);
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) {
    console.error(`[account] login delete failed for ${userId.slice(0, 8)}:`, authError.message);
    return res.status(500).json({ error: 'Your data was deleted, but your login could not be removed. Please try again.' });
  }
  res.json({ ok: true });
});

export default router;
