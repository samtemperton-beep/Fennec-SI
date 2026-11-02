import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { requireAuth, requireAdmin, invalidateSettingsCache } from '../middleware/auth';
import { MODELS, DEFAULTS } from '../services/llm';
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
  const { id } = req.params;
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
  const { id } = req.params;
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
  res.json({ settings: data ?? [], modelDefaults: DEFAULTS });
});

// DELETE /api/admin/settings/models/:tier — clear saved model choices for free
// or premium accounts, so every feature goes back to its default
router.delete('/settings/models/:tier', requireAuth, requireAdmin, async (req, res) => {
  const tier = String(req.params.tier);
  if (tier !== 'free' && tier !== 'premium') return res.status(400).json({ error: 'tier must be free or premium' });
  const keys = Object.keys(DEFAULTS).map(f => (tier === 'premium' ? `model_${f}` : `model_free_${f}`));
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

export default router;
