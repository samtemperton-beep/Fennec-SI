import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { getCached, setCached } from '../services/cache';
import { requireAuth } from '../middleware/auth';
import { emailAdmins, escapeHtml } from '../services/adminEmail';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

router.get('/sentiment/:ticker', async (req, res) => {
  const { ticker } = req.params;
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  const cacheKey = `stocktwits:${ticker.toUpperCase()}`;
  const cached = await getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const r = await fetch(`https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json?limit=30`);
    if (!r.ok) return res.status(r.status).json({ error: 'StockTwits error' });
    const data: any = await r.json();

    const symbol = data.symbol || {};
    const messages: any[] = data.messages || [];

    let bullish = 0;
    let bearish = 0;
    for (const m of messages) {
      const s = m.entities?.sentiment?.basic;
      if (s === 'Bullish') bullish++;
      else if (s === 'Bearish') bearish++;
    }

    const result = {
      ticker: symbol.symbol || ticker.toUpperCase(),
      title: symbol.title || '',
      watchlist_count: symbol.watchlist_count ?? null,
      sentiment_change: symbol.sentiment_change ?? null,
      volume_change: symbol.volume_change ?? null,
      bullish,
      bearish,
      total: messages.length,
      recent: messages.slice(0, 5).map((m: any) => ({
        id: m.id,
        body: m.body,
        created_at: m.created_at,
        sentiment: m.entities?.sentiment?.basic ?? null,
        user: m.user?.username ?? null,
      })),
    };

    await setCached(cacheKey, result, 0.25); // 15-min cache
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Community ─────────────────────────────────────────────────────────────────
// Profiles are private to their owner in the database, so the public bits a
// post needs (name, avatar, verified, badges) come from here. Never amounts.

const UUID = /^[0-9a-f-]{36}$/i;

async function publicPeople(ids: string[]) {
  if (!ids.length) return [];
  const [{ data: profiles }, { data: verified }, { data: earned }] = await Promise.all([
    supabase.from('profiles').select('id, username, avatar_color, avatar_emoji, avatar_url, created_at').in('id', ids),
    supabase.from('portfolio_verifications').select('user_id').eq('status', 'verified').in('user_id', ids),
    supabase.from('user_badges').select('user_id, badge_id, badges(name, icon)').in('user_id', ids),
  ]);
  const ver = new Set((verified ?? []).map((v: any) => v.user_id));
  return (profiles ?? []).map((p: any) => ({
    id: p.id as string,
    username: p.username as string | null,
    avatarColor: p.avatar_color ?? null,
    avatarEmoji: p.avatar_emoji ?? null,
    avatarUrl: p.avatar_url ?? null,
    joined: p.created_at ? String(p.created_at).slice(0, 7) : null,
    verified: ver.has(p.id),
    badges: (earned ?? []).filter((b: any) => b.user_id === p.id && b.badges)
      .map((b: any) => ({ id: b.badge_id as string, name: b.badges.name as string, icon: b.badges.icon as string })),
  }));
}

// GET /api/social/people?ids=a,b — public details for people shown in the feed.
router.get('/people', requireAuth, async (req, res) => {
  const ids = String(req.query.ids ?? '').split(',').filter(id => UUID.test(id)).slice(0, 100);
  try { res.json({ people: await publicPeople(ids) }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

export const REPORT_REASONS: Record<string, string> = {
  spam: 'Spam or advertising',
  scam: 'Scam or share ramping',
  abuse: 'Abusive or harassing',
  personal: "Shares someone's personal information",
  other: 'Something else',
};
const HIDE_AT = 3;

// POST /api/social/report { postId?, commentId?, reason, note? }
router.post('/report', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const postId = Number(req.body?.postId) || null;
  const commentId = Number(req.body?.commentId) || null;
  const reason = String(req.body?.reason ?? '');
  const note = req.body?.note ? String(req.body.note).slice(0, 500) : null;
  if (!postId && !commentId) return res.status(400).json({ error: 'Nothing to report' });
  if (!REPORT_REASONS[reason]) return res.status(400).json({ error: 'Choose a reason' });

  const table = commentId ? 'post_comments' : 'posts';
  const id = (commentId ?? postId)!;
  const { data: item } = await supabase.from(table).select('id, user_id, username, body').eq('id', id).maybeSingle();
  if (!item) return res.status(404).json({ error: 'That has already been removed' });
  if (item.user_id === user.id) return res.status(400).json({ error: 'You can delete your own instead' });

  const { error } = await supabase.from('post_reports').insert({
    post_id: commentId ? null : postId, comment_id: commentId, reporter_id: user.id, reason, note,
  });
  if (error) {
    if (error.code === '23505') return res.json({ ok: true, already: true });
    return res.status(500).json({ error: error.message });
  }

  // Enough separate reports hide it until the admin has looked.
  const { count } = await supabase.from('post_reports').select('id', { count: 'exact', head: true })
    .eq(commentId ? 'comment_id' : 'post_id', id).eq('status', 'open');
  const hidden = (count ?? 0) >= HIDE_AT;
  if (hidden) await supabase.from(table).update({ hidden: true }).eq('id', id);

  emailAdmins(supabase, {
    subject: `Community report: ${REPORT_REASONS[reason]}${hidden ? ' (now hidden)' : ''}`,
    html: `<p>A ${commentId ? 'comment' : 'post'} by <strong>${escapeHtml(item.username ?? '')}</strong> was reported: <strong>${escapeHtml(REPORT_REASONS[reason])}</strong> (${count ?? 1} open report${count === 1 ? '' : 's'}).</p>`
      + `<blockquote>${escapeHtml(String(item.body).slice(0, 600))}</blockquote>`
      + (note ? `<p>Their note: ${escapeHtml(note)}</p>` : '')
      + `<p>Review it on the Admin page, under Community reports.</p>`,
  }).catch(() => {});

  res.json({ ok: true, hidden });
});

export default router;
