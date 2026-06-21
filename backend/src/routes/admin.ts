import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { requireAuth, requireAdmin } from '../middleware/auth';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

// GET /api/admin/users — list all users with their tier
router.get('/users', requireAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, subscription_tier, is_admin, created_at, tier_updated_at')
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
    .update({ subscription_tier: tier, tier_updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, tier });
});

export default router;
