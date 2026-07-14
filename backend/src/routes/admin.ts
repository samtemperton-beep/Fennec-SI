import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { requireAuth, requireAdmin, invalidateSettingsCache } from '../middleware/auth';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

// GET /api/admin/users — list all users with their tier and usage
router.get('/users', requireAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, email, subscription_tier, is_admin, usage_count, last_usage_reset, created_at, tier_updated_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ users: data });
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
    .update({ subscription_tier: tier, is_premium: tier === 'premium', tier_updated_at: new Date().toISOString() })
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
  res.json({ settings: data ?? [] });
});

// PATCH /api/admin/settings/:key — update a platform setting
router.patch('/settings/:key', requireAuth, requireAdmin, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  if (value === undefined || value === null) {
    return res.status(400).json({ error: 'value is required' });
  }
  const { error } = await supabase
    .from('platform_settings')
    .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return res.status(500).json({ error: error.message });
  invalidateSettingsCache();
  res.json({ success: true, key, value: String(value) });
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
