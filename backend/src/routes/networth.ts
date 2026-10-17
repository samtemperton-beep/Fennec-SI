import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { computeNetWorth, saveNetWorthSnapshot, getNetWorthHistory } from '../services/networth';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

const router = Router();

// GET /api/networth — current net worth breakdown (NZD) plus its daily history.
// Each call also records today's point, so the trend builds as the app is used.
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const userId: string = req.user.id;
    const current = await computeNetWorth(supabase, userId);
    const saveError = await saveNetWorthSnapshot(supabase, userId, current);
    if (saveError) console.error('[networth] could not save snapshot:', saveError);
    const history = await getNetWorthHistory(supabase, userId);
    res.json({ current, history, historyAvailable: !saveError });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
