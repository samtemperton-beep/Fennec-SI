import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import ws from 'ws';
import { requireAuth } from '../middleware/auth';
import { escapeHtml } from '../services/adminEmail';
import { notify } from '../services/notify';
import { refreshFor, weekStreak } from '../services/rewards';

// Accountability buddies (rewards_migration.sql). The person being kept on
// track (the owner) invites a buddy by email; the buddy must accept. A buddy
// sees the owner's pledges, slips (amounts only if the owner allows), and,
// if shared, budgets gone over and goals missed. Nothing else.

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);
let resend: Resend | null = null;
const site = () => (process.env.FRONTEND_URL || 'https://www.fennecsi.com').replace(/\/+$/, '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BUDDIES = 3;
const MAX_INVITES_A_DAY = 5;
const isMissing = (e: any) => e && /buddies|pledge|money_rewards|relation|column/.test(e.message);

async function profileOf(id: string) {
  const { data } = await supabase.from('profiles').select('username, avatar_color, avatar_emoji, avatar_url').eq('id', id).maybeSingle();
  return data;
}

// GET /api/accountability/buddies
router.get('/buddies', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const email = String(user.email ?? '').toLowerCase();
  const [mine, invites, following] = await Promise.all([
    supabase.from('buddies').select('*').eq('owner_id', user.id).order('created_at'),
    email ? supabase.from('buddies').select('id, owner_id, created_at').eq('status', 'pending').eq('buddy_email', email).neq('owner_id', user.id) : Promise.resolve({ data: [], error: null } as any),
    supabase.from('buddies').select('*').eq('status', 'active').eq('buddy_id', user.id),
  ]);
  if (isMissing(mine.error)) return res.json({ ready: false, mine: [], invites: [], following: [] });
  if (mine.error) return res.status(500).json({ error: mine.error.message });

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const view = async (b: any) => {
    const owner = b.owner_id;
    const [prof, pledges, slips, rewards, cats, goals] = await Promise.all([
      profileOf(owner),
      supabase.from('pledges').select('id, name, created_at').eq('user_id', owner).eq('active', true),
      supabase.from('pledge_slips').select('pledge_id, amount, date').eq('user_id', owner).gte('date', new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)).order('date', { ascending: false }),
      supabase.from('money_rewards').select('kind, ref, points').eq('user_id', owner),
      b.share_budgets ? supabase.from('fin_categories').select('*').eq('user_id', owner).eq('scope', 'household').gt('monthly_budget', 0) : Promise.resolve({ data: [] } as any),
      b.share_goals ? supabase.from('fin_goals').select('name, target_amount, current_amount, target_date').eq('user_id', owner).eq('status', 'active') : Promise.resolve({ data: [] } as any),
    ]);
    const allSlips = slips.data ?? [];
    const lastSlip = (id: string) => allSlips.find((s: any) => s.pledge_id === id)?.date;
    let over: string[] = [];
    if (b.share_budgets && cats.data?.length) {
      const budgets = cats.data.filter((c: any) => (c.kind ? c.kind !== 'income' : c.name !== 'Income' && c.name !== 'Interest'));
      const { data: txs } = await supabase.from('fin_transactions').select('category_id, amount').eq('user_id', owner)
        .gte('date', monthStart).lt('amount', 0).in('category_id', budgets.map((c: any) => c.id));
      over = budgets.filter((c: any) => (txs ?? []).filter(t => t.category_id === c.id).reduce((s, t) => s + Math.abs(Number(t.amount)), 0) > Number(c.monthly_budget)).map((c: any) => c.name);
    }
    const rw = rewards.data ?? [];
    return {
      id: b.id,
      name: prof?.username ?? 'Fennec member',
      avatarColor: prof?.avatar_color ?? null, avatarEmoji: prof?.avatar_emoji ?? null, avatarUrl: prof?.avatar_url ?? null,
      points: rw.reduce((s: number, r: any) => s + r.points, 0),
      streakWeeks: weekStreak(rw.filter((r: any) => r.kind === 'week_under').map((r: any) => r.ref), today),
      pledges: (pledges.data ?? []).map((p: any) => {
        const from = lastSlip(p.id) ?? p.created_at.slice(0, 10);
        return { name: p.name, keptDays: Math.max(0, Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000)) };
      }),
      slips: allSlips.slice(0, 10).map((s: any) => ({
        pledge: (pledges.data ?? []).find((p: any) => p.id === s.pledge_id)?.name ?? 'A pledge',
        date: s.date,
        amount: b.share_amounts ? Number(s.amount) : null,
      })),
      overBudget: b.share_budgets ? over : null,
      goalsMissed: b.share_goals ? (goals.data ?? []).filter((g: any) => g.target_date && g.target_date < today && Number(g.current_amount) < Number(g.target_amount)).map((g: any) => g.name) : null,
    };
  };

  const mineRows = await Promise.all((mine.data ?? []).map(async (b: any) => ({
    id: b.id, email: b.buddy_email, status: b.status,
    name: b.buddy_id && b.status === 'active' ? (await profileOf(b.buddy_id))?.username ?? null : null,
    shareAmounts: b.share_amounts, shareBudgets: b.share_budgets, shareGoals: b.share_goals,
  })));
  const inviteRows = await Promise.all((invites.data ?? []).map(async (i: any) => ({ id: i.id, from: (await profileOf(i.owner_id))?.username ?? 'A Fennec member' })));
  res.json({ ready: true, mine: mineRows, invites: inviteRows, following: await Promise.all((following.data ?? []).map(view)) });
});

// POST /api/accountability/buddies { email }
router.post('/buddies', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return res.status(400).json({ error: 'Enter a valid email address' });
  if (email === String(user.email ?? '').toLowerCase()) return res.status(400).json({ error: "That's your own email" });

  const me = await profileOf(user.id);
  if (!me?.username) return res.status(400).json({ error: 'Choose a username in Settings first, so your buddy knows who invited them' });

  const { data: rows, error } = await supabase.from('buddies').select('id, buddy_email, created_at').eq('owner_id', user.id);
  if (isMissing(error)) return res.status(503).json({ error: 'Buddies aren’t switched on yet. Try again soon.' });
  if ((rows ?? []).some(r => r.buddy_email === email)) return res.status(400).json({ error: 'You’ve already invited them' });
  if ((rows ?? []).length >= MAX_BUDDIES) return res.status(400).json({ error: `You can have up to ${MAX_BUDDIES} buddies` });
  const dayAgo = Date.now() - 86_400_000;
  if ((rows ?? []).filter(r => Date.parse(r.created_at) > dayAgo).length >= MAX_INVITES_A_DAY) return res.status(429).json({ error: 'That’s a lot of invites today. Try again tomorrow.' });

  const { data: row, error: insErr } = await supabase.from('buddies').insert({ owner_id: user.id, buddy_email: email }).select('id').single();
  if (insErr) return res.status(500).json({ error: insErr.message });

  // If they already use Fennec, it shows in their notifications too.
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = ((list?.users ?? []) as { id: string; email?: string }[]).find(u => (u.email ?? '').toLowerCase() === email);
  if (existing) {
    await notify(existing.id, {
      type: 'buddy_invite', key: `buddy-invite:${row.id}`, link: '/app/finance/budget/pledges',
      title: `${me.username} asked you to be their accountability buddy`,
      body: 'Accept on Budget → Pledges to see how their no-spend pledges are going and cheer them on.',
    });
  }

  // The same email either way, so nobody can tell from it whether an address uses Fennec.
  if (process.env.RESEND_API_KEY) {
    resend ??= new Resend(process.env.RESEND_API_KEY);
    const name = escapeHtml(me.username);
    await resend.emails.send({
      from: 'Fennec <alerts@fennecsi.com>',
      to: email,
      subject: `${me.username} asked you to be their accountability buddy`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#1a1a1a">
<p>Hi,</p>
<p><strong>${name}</strong> is using Fennec, a New Zealand money app, to stick to their budget and stop spending at places they've pledged to avoid. They'd like you to be their accountability buddy.</p>
<p>If you accept, you'll see their pledges and get a heads-up if they slip, so you can cheer them on. You won't see their accounts, balances or other spending.</p>
<p><a href="${site()}/app/finance/budget/pledges" style="display:inline-block;background:#5b7cf0;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">See the invite</a></p>
<p style="color:#666;font-size:13px">New to Fennec? Sign up free with this email address (${escapeHtml(email)}) and the invite will be waiting. If you don't know ${name}, you can ignore this email.</p>
</div>`,
    }).catch(e => console.error('[buddies] invite email failed:', e?.message ?? e));
  }
  res.json({ ok: true });
});

// POST /api/accountability/buddies/:id/accept
router.post('/buddies/:id/accept', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const email = String(user.email ?? '').toLowerCase();
  const { data: b } = await supabase.from('buddies').select('id, owner_id, status, buddy_email').eq('id', String(req.params.id)).maybeSingle();
  if (!b || b.status !== 'pending' || b.buddy_email !== email || b.owner_id === user.id) return res.status(404).json({ error: 'That invite has gone' });
  const { error } = await supabase.from('buddies').update({ buddy_id: user.id, status: 'active', accepted_at: new Date().toISOString() }).eq('id', b.id);
  if (error) return res.status(500).json({ error: error.message });
  const me = await profileOf(user.id);
  await notify(b.owner_id, {
    type: 'buddy_update', key: `buddy-joined:${b.id}`, link: '/app/finance/budget/pledges',
    title: `${me?.username ?? 'Your buddy'} is now your accountability buddy`,
    body: 'They’ll see your pledges and get a heads-up if you slip. You can change what they see on Budget → Pledges.',
  });
  refreshFor(b.owner_id).catch(() => {});
  refreshFor(user.id).catch(() => {});
  res.json({ ok: true });
});

// DELETE /api/accountability/buddies/:id — either side can end it, or decline an invite.
router.delete('/buddies/:id', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const email = String(user.email ?? '').toLowerCase();
  const { data: b } = await supabase.from('buddies').select('id, owner_id, buddy_id, buddy_email').eq('id', String(req.params.id)).maybeSingle();
  if (!b || (b.owner_id !== user.id && b.buddy_id !== user.id && b.buddy_email !== email)) return res.status(404).json({ error: 'Not found' });
  await supabase.from('buddies').delete().eq('id', b.id);
  res.json({ ok: true });
});

// PATCH /api/accountability/buddies/:id { shareAmounts?, shareBudgets?, shareGoals? } — the owner only.
router.patch('/buddies/:id', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const patch: Record<string, boolean> = {};
  if (typeof req.body?.shareAmounts === 'boolean') patch.share_amounts = req.body.shareAmounts;
  if (typeof req.body?.shareBudgets === 'boolean') patch.share_budgets = req.body.shareBudgets;
  if (typeof req.body?.shareGoals === 'boolean') patch.share_goals = req.body.shareGoals;
  const { error } = await supabase.from('buddies').update(patch).eq('id', String(req.params.id)).eq('owner_id', user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/accountability/refresh — check pledges and work out rewards now.
const lastRefresh = new Map<string, number>();
router.post('/refresh', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const last = lastRefresh.get(user.id) ?? 0;
  if (Date.now() - last < 60_000) return res.json({ ok: true, new: 0 });
  lastRefresh.set(user.id, Date.now());
  res.json({ ok: true, new: await refreshFor(user.id) });
});

export default router;
