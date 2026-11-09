import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { requireAuth, requireAdmin, invalidateSettingsCache } from '../middleware/auth';
import { MODELS, DEFAULTS } from '../services/llm';
import { PLAN_FEATURES, PLAN_LIMITS } from '../services/plans';
import { runAndRecord } from '../services/healthCheck';
import { cleanKeyword, isDefaultCategory, merchantKey, DEFAULT_CATEGORIES } from '../services/sharedCategories';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

// Emails live on the login, not in profiles.
async function withEmails<T extends { id: string }>(rows: T[]) {
  const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emails = new Map((data?.users ?? []).map((u) => [u.id, u.email]));
  return rows.map((r) => ({ ...r, email: emails.get(r.id) ?? null }));
}

// GET /api/admin/users — list all users with their tier and usage
router.get('/users', requireAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, subscription_tier, is_admin, usage_count, last_usage_reset, created_at, tier_updated_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ users: await withEmails(data ?? []) });
});

// PATCH /api/admin/users/:id/tier — toggle a user's subscription tier
router.patch('/users/:id/tier', requireAuth, requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const { tier } = req.body;
  if (!['free', 'premium'].includes(tier)) {
    return res.status(400).json({ error: 'tier must be "free" or "premium"' });
  }
  const { error } = await supabase
    .from('profiles')
    .update({ subscription_tier: tier, tier_updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, tier });
});

// POST /api/admin/users/:id/reset-usage — reset a user's daily AI usage counter
router.post('/users/:id/reset-usage', requireAuth, requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const { error } = await supabase
    .from('profiles')
    .update({ usage_count: 0, last_usage_reset: new Date().toISOString().slice(0, 10) })
    .eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// GET /api/admin/settings — list all platform settings
router.get('/settings', requireAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value, description, updated_at')
    .order('key');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ settings: data ?? [], modelDefaults: DEFAULTS, planFeatures: PLAN_FEATURES, planLimits: PLAN_LIMITS });
});

// DELETE /api/admin/settings/models/:tier — clear saved model choices, features
// and limits for free or premium accounts, so everything goes back to its default
router.delete('/settings/models/:tier', requireAuth, requireAdmin, async (req, res) => {
  const tier = String(req.params.tier);
  if (tier !== 'free' && tier !== 'premium') return res.status(400).json({ error: 'tier must be free or premium' });
  const keys = [
    ...Object.keys(DEFAULTS).map(f => (tier === 'premium' ? `model_${f}` : `model_free_${f}`)),
    ...Object.keys(PLAN_FEATURES).map(f => `plan_${tier}_${f}`),
    ...Object.keys(PLAN_LIMITS).map(l => `limit_${tier}_${l}`),
    ...(tier === 'free' ? ['free_daily_ai_limit'] : []),
  ];
  const { error } = await supabase.from('platform_settings').delete().in('key', keys);
  if (error) return res.status(500).json({ error: error.message });
  invalidateSettingsCache();
  res.json({ success: true });
});

// PATCH /api/admin/settings/:key — update a platform setting
router.patch('/settings/:key', requireAuth, requireAdmin, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  if (value === undefined || value === null) {
    return res.status(400).json({ error: 'value is required' });
  }
  if (String(key).startsWith('model_') && !MODELS.includes(String(value))) {
    return res.status(400).json({ error: `Unknown model: ${value}` });
  }
  if (String(key).startsWith('plan_') && value !== 'on' && value !== 'off') {
    return res.status(400).json({ error: 'Plan features are on or off' });
  }
  if (String(key).startsWith('limit_') && !/^\d{1,6}$/.test(String(value))) {
    return res.status(400).json({ error: 'Limits are a whole number (0 for no limit)' });
  }
  const { error } = await supabase
    .from('platform_settings')
    .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return res.status(500).json({ error: error.message });
  invalidateSettingsCache();
  res.json({ success: true, key, value: String(value) });
});

// GET /api/admin/usage-stats — per-user and aggregate AI usage
router.get('/usage-stats', requireAuth, requireAdmin, async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, usage_count, last_usage_reset, subscription_tier, is_admin')
    .order('usage_count', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const list = profiles ?? [];
  const totalToday = list.reduce((s, p) => s + (p.last_usage_reset === today ? (p.usage_count || 0) : 0), 0);
  const totalAllTime = list.reduce((s, p) => s + (p.usage_count || 0), 0);
  res.json({ totalToday, totalAllTime, perUser: await withEmails(list) });
});

// GET /api/admin/stats — basic platform stats
router.get('/stats', requireAuth, requireAdmin, async (_req, res) => {
  const [{ count: total }, { count: premium }, { count: active }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('subscription_tier', 'premium'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_usage_reset', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
  ]);
  res.json({ total: total ?? 0, premium: premium ?? 0, activeThisWeek: active ?? 0 });
});

// GET /api/admin/health — the last two weeks of health checks, newest first
router.get('/health', requireAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase.from('health_checks')
    .select('id, ran_at, trigger, ok, failed, results').order('ran_at', { ascending: false }).limit(14);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ runs: data ?? [] });
});

// POST /api/admin/health/run — run the check now. Saved, but not emailed.
let manualRunning = false;
router.post('/health/run', requireAuth, requireAdmin, async (_req, res) => {
  if (manualRunning) return res.status(409).json({ error: 'A check is already running.' });
  manualRunning = true;
  try {
    res.json(await runAndRecord(supabase, 'manual'));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  } finally {
    manualRunning = false;
  }
});

// ── Shared category list ────────────────────────────────────────────────────
// Keyword -> category matches used to categorise everyone's transactions once
// approved. See shared_categories_migration.sql.

// GET /api/admin/category-matches — every match, with the default category names
router.get('/category-matches', requireAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase.from('shared_category_matches')
    .select('id, keyword, category_name, scope, status, source, suggestions, created_at, reviewed_at')
    .order('suggestions', { ascending: false }).order('keyword');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ matches: data ?? [], categories: DEFAULT_CATEGORIES });
});

// Approves a match: takes back any other approved category for the keyword,
// then categorises everyone's matching uncategorised transactions.
async function approve(id: string, keyword: string, scope: string) {
  const { data: others } = await supabase.from('shared_category_matches')
    .select('id').eq('keyword', keyword).eq('scope', scope).eq('status', 'approved').neq('id', id);
  for (const o of others ?? []) {
    await supabase.rpc('remove_shared_match', { target: o.id });
    await supabase.from('shared_category_matches').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', o.id);
  }
  const { error } = await supabase.from('shared_category_matches')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
  const { data: applied, error: applyErr } = await supabase.rpc('apply_shared_match', { target: id });
  if (applyErr) throw new Error(applyErr.message);
  return Number(applied ?? 0);
}

// POST /api/admin/category-matches { keyword, category_name, scope } — add an approved match
router.post('/category-matches', requireAuth, requireAdmin, async (req, res) => {
  const keyword = cleanKeyword(req.body?.keyword);
  const scope = req.body?.scope === 'business' ? 'business' : 'household';
  const category = String(req.body?.category_name ?? '');
  if (!keyword) return res.status(400).json({ error: 'Use 3 to 40 characters, with letters and no long numbers.' });
  if (!isDefaultCategory(category, scope)) return res.status(400).json({ error: 'Pick one of the default categories.' });
  const { data, error } = await supabase.from('shared_category_matches')
    .upsert({ keyword, category_name: category, scope, source: 'admin' }, { onConflict: 'keyword,scope,category_name' })
    .select('id').single();
  if (error) return res.status(500).json({ error: error.message });
  try {
    res.json({ applied: await approve(data.id, keyword, scope) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/category-matches/:id { status?, category_name? }
router.patch('/category-matches/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const { data: match, error } = await supabase.from('shared_category_matches')
    .select('id, keyword, scope, status, category_name').eq('id', id).maybeSingle();
  if (error || !match) return res.status(404).json({ error: 'Match not found' });

  try {
    // A different category: only while it isn't in use.
    const category = req.body?.category_name;
    if (category && category !== match.category_name) {
      if (match.status === 'approved') return res.status(400).json({ error: 'Remove the match before changing its category.' });
      if (!isDefaultCategory(category, match.scope)) return res.status(400).json({ error: 'Pick one of the default categories.' });
      const { error: upErr } = await supabase.from('shared_category_matches').update({ category_name: category }).eq('id', id);
      if (upErr) return res.status(409).json({ error: upErr.code === '23505' ? 'That match is already on the list.' : upErr.message });
    }

    const status = req.body?.status;
    if (status === 'approved') return res.json({ applied: await approve(id, match.keyword, match.scope) });
    if (status === 'rejected' || status === 'pending') {
      let removed = 0;
      if (match.status === 'approved') {
        const { data } = await supabase.rpc('remove_shared_match', { target: id });
        removed = Number(data ?? 0);
      }
      await supabase.from('shared_category_matches')
        .update({ status, reviewed_at: status === 'rejected' ? new Date().toISOString() : null }).eq('id', id);
      return res.json({ removed });
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/category-matches/from-my-data — suggest matches from the
// admin's own categorised transactions: merchants seen at least twice, always
// in the same default category. Added as pending.
router.post('/category-matches/from-my-data', requireAuth, requireAdmin, async (req: any, res) => {
  const { data: txs, error } = await supabase.from('fin_transactions')
    .select('description, category_source, category:fin_categories(name, scope)')
    .eq('user_id', req.user.id).not('category_id', 'is', null)
    .order('date', { ascending: false }).limit(5000);
  if (error) return res.status(500).json({ error: error.message });

  const seen = new Map<string, { names: Set<string>; scope: string; count: number }>();
  for (const t of txs ?? []) {
    const cat: any = Array.isArray(t.category) ? t.category[0] : t.category;
    if (t.category_source === 'shared' || !cat || !isDefaultCategory(cat.name, cat.scope)) continue;
    const key = merchantKey(t.description ?? '');
    if (!key) continue;
    const k = `${cat.scope}|${key}`;
    const s = seen.get(k) ?? { names: new Set<string>(), scope: cat.scope, count: 0 };
    s.names.add(cat.name);
    s.count++;
    seen.set(k, s);
  }
  const rows = [...seen.entries()]
    .filter(([, s]) => s.count >= 2 && s.names.size === 1)
    .map(([k, s]) => ({ keyword: k.split('|')[1], category_name: [...s.names][0], scope: s.scope, source: 'admin', suggestions: 1 }));
  if (!rows.length) return res.json({ added: 0 });
  const { data: added, error: insErr } = await supabase.from('shared_category_matches')
    .upsert(rows, { onConflict: 'keyword,scope,category_name', ignoreDuplicates: true }).select('id');
  if (insErr) return res.status(500).json({ error: insErr.message });
  res.json({ added: added?.length ?? 0, considered: rows.length });
});

// ── Community reports (community_migration.sql) ──────────────────────────────
// Grouped by post or comment, newest first. Reporters stay anonymous here too.

// GET /api/admin/reports?status=open|closed
router.get('/reports', requireAuth, requireAdmin, async (req, res) => {
  const open = req.query.status !== 'closed';
  const { data: reports, error } = await supabase.from('post_reports')
    .select('id, post_id, comment_id, reason, note, status, created_at')
    .in('status', open ? ['open'] : ['hidden', 'removed', 'dismissed'])
    .order('created_at', { ascending: false }).limit(300);
  if (error) return res.status(500).json({ error: error.message });

  const postIds = [...new Set((reports ?? []).filter(r => r.post_id).map(r => r.post_id))];
  const commentIds = [...new Set((reports ?? []).filter(r => r.comment_id).map(r => r.comment_id))];
  const [{ data: posts }, { data: comments }] = await Promise.all([
    postIds.length ? supabase.from('posts').select('id, user_id, username, body, ticker, hidden, created_at').in('id', postIds) : Promise.resolve({ data: [] as any[] }),
    commentIds.length ? supabase.from('post_comments').select('id, post_id, user_id, username, body, hidden, created_at').in('id', commentIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const postMap = new Map((posts ?? []).map((p: any) => [p.id, p]));
  const commentMap = new Map((comments ?? []).map((c: any) => [c.id, c]));

  const groups = new Map<string, any>();
  for (const r of reports ?? []) {
    const key = r.comment_id ? `c${r.comment_id}` : `p${r.post_id}`;
    const item = r.comment_id ? commentMap.get(r.comment_id) : postMap.get(r.post_id);
    const g = groups.get(key) ?? {
      key, kind: r.comment_id ? 'comment' : 'post', id: r.comment_id ?? r.post_id, item: item ?? null,
      status: r.status, reports: [] as any[],
    };
    g.reports.push({ reason: r.reason, note: r.note, created_at: r.created_at });
    groups.set(key, g);
  }
  res.json({ groups: [...groups.values()] });
});

// POST /api/admin/reports/resolve { kind: 'post'|'comment', id, action: 'keep'|'hide'|'remove' }
router.post('/reports/resolve', requireAuth, requireAdmin, async (req, res) => {
  const kind = req.body?.kind === 'comment' ? 'comment' : 'post';
  const id = Number(req.body?.id);
  const action = String(req.body?.action);
  if (!id || !['keep', 'hide', 'remove'].includes(action)) return res.status(400).json({ error: 'Bad request' });
  const table = kind === 'comment' ? 'post_comments' : 'posts';
  const col = kind === 'comment' ? 'comment_id' : 'post_id';

  // "keep" also un-hides something that three reports hid.
  const status = action === 'keep' ? 'dismissed' : action === 'hide' ? 'hidden' : 'removed';
  await supabase.from('post_reports').update({ status }).eq(col, id).eq('status', 'open');

  const { error } = action === 'remove'
    ? await supabase.from(table).delete().eq('id', id)
    : await supabase.from(table).update({ hidden: action === 'hide' }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
