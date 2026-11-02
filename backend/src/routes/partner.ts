import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import ws from 'ws';
import { requireAuth, requireFeature } from '../middleware/auth';
import dotenv from 'dotenv';
dotenv.config();

// Linking two accounts so they can share bank accounts, bills and goals.
// Links are made and removed only here; the database rules decide what each
// person can then see (partner_sharing_migration.sql).

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

interface Link { id: string; inviter: string; invitee: string | null; code: string; accepted_at: string | null }

async function linksFor(userId: string): Promise<Link[]> {
  const { data } = await supabase
    .from('partner_links')
    .select('id, inviter, invitee, code, accepted_at')
    .or(`inviter.eq.${userId},invitee.eq.${userId}`);
  return (data || []) as Link[];
}

const activeLink = (links: Link[]) => links.find(l => l.accepted_at && l.invitee);

/** The name shown to the other person: their username, or failing that their email. */
async function displayName(userId: string): Promise<{ name: string; email: string | null }> {
  const [{ data: profile }, { data: auth }] = await Promise.all([
    supabase.from('profiles').select('username').eq('id', userId).maybeSingle(),
    supabase.auth.admin.getUserById(userId),
  ]);
  const email = auth?.user?.email ?? null;
  return { name: profile?.username || email || 'Your partner', email };
}

// GET /api/partner: none, an invite waiting to be accepted, or linked.
router.get('/', requireAuth, async (req: any, res) => {
  const me = req.user.id;
  const links = await linksFor(me);
  const active = activeLink(links);
  if (active) {
    const other = active.inviter === me ? active.invitee! : active.inviter;
    return res.json({ status: 'linked', partner: await displayName(other), since: active.accepted_at });
  }
  const pending = links.find(l => l.inviter === me && !l.accepted_at);
  if (pending) return res.json({ status: 'pending', code: pending.code });
  res.json({ status: 'none' });
});

// POST /api/partner/invite: make (or return) this person's invite code.
router.post('/invite', requireAuth, requireFeature('partner'), async (req: any, res) => {
  const me = req.user.id;
  const links = await linksFor(me);
  if (activeLink(links)) return res.status(400).json({ error: 'You are already linked with a partner. Unlink first.' });
  const pending = links.find(l => l.inviter === me && !l.accepted_at);
  if (pending) return res.json({ code: pending.code });

  const code = crypto.randomBytes(12).toString('base64url');
  const { error } = await supabase.from('partner_links').insert({ inviter: me, code });
  if (error) return res.status(500).json({ error: 'Could not create the invite. Please try again.' });
  res.json({ code });
});

// GET /api/partner/invite/:code: who sent this invite, before accepting it.
router.get('/invite/:code', requireAuth, async (req: any, res) => {
  const { data: link } = await supabase
    .from('partner_links')
    .select('inviter, accepted_at')
    .eq('code', String(req.params.code))
    .maybeSingle();
  if (!link || link.accepted_at) return res.status(404).json({ error: 'This invite has been used or cancelled.' });
  if (link.inviter === req.user.id) return res.json({ own: true });
  const { name } = await displayName(link.inviter);
  res.json({ own: false, name });
});

// POST /api/partner/accept { code }
router.post('/accept', requireAuth, requireFeature('partner'), async (req: any, res) => {
  const me = req.user.id;
  const code = String(req.body?.code || '');
  const { data: link } = await supabase
    .from('partner_links')
    .select('id, inviter, accepted_at')
    .eq('code', code)
    .maybeSingle();
  if (!link || link.accepted_at) return res.status(404).json({ error: 'This invite has been used or cancelled.' });
  if (link.inviter === me) return res.status(400).json({ error: "That's your own invite. Send it to your partner." });

  const [mine, theirs] = await Promise.all([linksFor(me), linksFor(link.inviter)]);
  if (activeLink(mine)) return res.status(400).json({ error: 'You are already linked with a partner. Unlink first.' });
  if (activeLink(theirs)) return res.status(400).json({ error: 'This person is already linked with someone else.' });

  // Accepting replaces any invite this person had sent themselves.
  await supabase.from('partner_links').delete().eq('inviter', me).is('accepted_at', null);
  const { data: done, error } = await supabase
    .from('partner_links')
    .update({ invitee: me, accepted_at: new Date().toISOString() })
    .eq('id', link.id)
    .is('accepted_at', null)
    .select('id');
  if (error || !done?.length) return res.status(409).json({ error: 'This invite has been used or cancelled.' });
  res.json({ ok: true, partner: await displayName(link.inviter) });
});

// DELETE /api/partner: unlink, or cancel a waiting invite. Either person can.
// Both people's accounts go back to private, so a later link starts from nothing shared.
router.delete('/', requireAuth, async (req: any, res) => {
  const me = req.user.id;
  const links = await linksFor(me);
  const active = activeLink(links);
  await supabase.from('partner_links').delete().or(`inviter.eq.${me},invitee.eq.${me}`);
  if (active) {
    await supabase
      .from('fin_accounts')
      .update({ share_level: 'private' })
      .in('user_id', [active.inviter, active.invitee!]);
  }
  res.json({ ok: true });
});

export default router;
